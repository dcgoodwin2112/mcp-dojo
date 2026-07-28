import type { CapabilityItem, Primitive } from "./events";
import type { PublicProfile } from "./profiles";
import type { EventLogStore } from "./store";

/**
 * Live-mode orchestration: drives the /api/mcp proxy and translates every
 * round-trip into semantic + rpc events on the store. The proxy holds the
 * secrets; this class only ever sees redacted metadata.
 *
 * Persona semantics (per plan): ONE inspector log spans persona switches —
 * switchPersona() opens a new MCP session and re-runs initialize + lists into
 * the same log, which is what the capability diff renders. connect() starts a
 * fresh log.
 */

interface ProxyResult {
  ok: boolean;
  httpStatus?: number;
  headers?: Record<string, string>;
  sse?: boolean;
  requestFrame?: { id?: string; method?: string } & Record<string, unknown>;
  responseFrame?: unknown;
  latencyMs?: number;
  mcpSessionId?: string;
  token?: { minted: boolean; scopes: string[]; expiresAt: string };
  transportError?: string;
}

type ListKind = "tools/list" | "resources/list" | "resources/templates/list" | "prompts/list";

const LIST_PRIMITIVE: Record<ListKind, Primitive> = {
  "tools/list": "tool",
  "resources/list": "resource",
  "resources/templates/list": "resource",
  "prompts/list": "prompt",
};

/** Cap resource text in LOG EVENTS only (recording-size control). The model
 *  always receives the full text. */
const RESOURCE_TEXT_CAP = 2000;

export const AGENT_SYSTEM_SUMMARY =
  "You are a DKAN open-data assistant. Use the MCP tools to answer questions about the catalog.";

function rpcResult(frame: unknown): Record<string, unknown> | undefined {
  if (frame && typeof frame === "object" && "result" in frame) {
    return (frame as { result: Record<string, unknown> }).result;
  }
  return undefined;
}

function rpcError(frame: unknown): { code: number; message: string } | undefined {
  if (frame && typeof frame === "object" && "error" in frame) {
    return (frame as { error: { code: number; message: string } }).error;
  }
  return undefined;
}

export interface ResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
}

/** completion/complete target: a prompt argument or a resource-template variable. */
export type CompletionRef =
  | { type: "ref/prompt"; name: string }
  | { type: "ref/resource"; uri: string };

export interface ToolOutcome {
  isError: boolean;
  latencyMs?: number;
  /** MCP content blocks (or a synthesized error block) for the agent loop. */
  content: Array<{ type: string; text?: string }>;
}

export class LiveSession {
  private mcpSessionId: string | undefined;
  private profileId = "";
  persona = "";
  toolItems: CapabilityItem[] = [];
  attached: Array<{ uri: string; name: string; text?: string }> = [];
  /** Host-side tool selection: names hidden from the MODEL (manual mode can
   *  still call anything the server lists — the toggle shapes only what the
   *  model sees, like tool pickers in Claude Desktop). */
  disabledTools = new Set<string>();
  /** Host-side description rewrites — the sandbox for "descriptions are prompts". */
  descriptionOverrides = new Map<string, string>();
  /** Server usage guidance from the initialize result — folded into the
   *  agent's system prompt (AgentLoop.system) and shown in the Context
   *  Inspector as a distinct read-only section. */
  serverInstructions: string | undefined;

  /** The tool definitions the model actually receives. */
  get effectiveTools(): CapabilityItem[] {
    return this.toolItems
      .filter((t) => !this.disabledTools.has(t.name))
      .map((t) => {
        const override = this.descriptionOverrides.get(t.name);
        return override === undefined ? t : { ...t, description: override };
      });
  }

  /** Rewrite what the MODEL sees as a tool's description; null restores the server's. */
  overrideToolDescription(name: string, description: string | null): void {
    const server = this.toolItems.find((t) => t.name === name)?.description;
    if (description === null || description === server) {
      if (!this.descriptionOverrides.delete(name)) return;
      this.store.append("user", {
        type: "context.updated",
        field: "tools",
        detail: `restored the server's description for ${name}`,
      });
      return;
    }
    this.descriptionOverrides.set(name, description);
    this.store.append("user", {
      type: "context.updated",
      field: "tools",
      detail: `rewrote the description of ${name} for the model — the server is unchanged`,
      text: description,
    });
  }

  toggleTool(name: string): void {
    const disabling = !this.disabledTools.has(name);
    if (disabling) this.disabledTools.add(name);
    else this.disabledTools.delete(name);
    this.store.append("user", {
      type: "context.updated",
      field: "tools",
      detail: `${disabling ? "disabled" : "re-enabled"} ${name} for the model (${this.effectiveTools.length} of ${this.toolItems.length} tools active)`,
    });
  }

  /** Remove an attached resource from context (mirrors resource.attached). */
  detachResource(uri: string): void {
    const idx = this.attached.findIndex((a) => a.uri === uri);
    if (idx === -1) return;
    const [removed] = this.attached.splice(idx, 1);
    this.store.append("user", {
      type: "resource.detached",
      primitive: "resource",
      uri: removed.uri,
      name: removed.name,
    });
    this.snapshotContext("preview");
  }

  constructor(readonly store: EventLogStore) {}

  /** Fresh log + session. */
  async connect(profile: PublicProfile, personaKey: string): Promise<void> {
    this.store.start(`live-${Date.now().toString(36)}`);
    this.attached = [];
    this.disabledTools.clear();
    this.descriptionOverrides.clear();
    this.profileId = profile.id;
    this.store.append("app", {
      type: "session.started",
      profile: profile.name,
      serverUrl: profile.mcpUrl,
      transport: profile.transport,
      mode: "live",
    });
    await this.initPersona(profile, personaKey);
  }

  /** New MCP session for another persona, appended to the SAME log. */
  async switchPersona(profile: PublicProfile, personaKey: string): Promise<void> {
    await this.initPersona(profile, personaKey);
  }

  private async initPersona(profile: PublicProfile, personaKey: string): Promise<void> {
    const personaLabel =
      profile.personas.find((p) => p.key === personaKey)?.label ?? personaKey;
    this.persona = personaKey;
    this.mcpSessionId = undefined;
    this.serverInstructions = undefined;

    this.store.append("user", {
      type: "auth.persona.selected",
      persona: personaKey,
      label: personaLabel,
    });

    const init = await this.call({ kind: "initialize" });
    if (init === null) return;

    const result = rpcResult(init.responseFrame);
    if (init.ok && result) {
      this.mcpSessionId = init.mcpSessionId;
      const info = result.serverInfo as { name: string; version: string };
      this.serverInstructions =
        typeof result.instructions === "string" && result.instructions.trim() !== ""
          ? result.instructions
          : undefined;
      this.store.append("server", {
        type: "mcp.initialized",
        requestId: String(init.requestFrame?.id ?? ""),
        mcpSessionId: init.mcpSessionId,
        serverInfo: { name: info.name, version: info.version },
        capabilities: (result.capabilities as Record<string, unknown>) ?? {},
        instructions: this.serverInstructions,
      });
    } else {
      return; // error event already appended by call()
    }

    for (const kind of Object.keys(LIST_PRIMITIVE) as ListKind[]) {
      await this.list(kind);
    }
  }

  /**
   * Tool call from manual mode (actor "user", no turnId) or the agent loop
   * (actor "model" + turnId). A JSON-RPC error (e.g. the 403 denial) yields
   * rpc.response + error events from call(); tool.call.completed is only
   * appended for real results.
   */
  async callTool(
    name: string,
    args: Record<string, unknown>,
    opts: { actor: "user" | "model"; turnId?: string } = { actor: "user" },
  ): Promise<ToolOutcome> {
    const requestId = `r-${crypto.randomUUID().slice(0, 8)}`;
    this.store.append(opts.actor, {
      type: "tool.call.requested",
      primitive: "tool",
      requestId,
      turnId: opts.turnId,
      toolName: name,
      args,
    });
    const res = await this.call({ kind: "tools/call", name, args }, requestId);
    const result = rpcResult(res?.responseFrame);
    if (res?.ok && result) {
      const isError = Boolean((result as { isError?: boolean }).isError);
      this.store.append("server", {
        type: "tool.call.completed",
        primitive: "tool",
        requestId,
        turnId: opts.turnId,
        toolName: name,
        latencyMs: res.latencyMs ?? 0,
        isError,
        result,
        outputSchema: this.toolItems.find((t) => t.name === name)?.outputSchema,
      });
      const content = (result.content as Array<{ type: string; text?: string }>) ?? [];
      return { isError, latencyMs: res.latencyMs, content };
    }
    const err = rpcError(res?.responseFrame);
    return {
      isError: true,
      latencyMs: res?.latencyMs,
      content: [
        {
          type: "text",
          text: err
            ? `JSON-RPC error ${err.code}: ${err.message} (HTTP ${res?.httpStatus})`
            : `transport error calling ${name}`,
        },
      ],
    };
  }

  /** Prompt invocation: user-controlled primitive; expansion shown pre-send.
   *  Returns the flattened expanded messages, or null on failure. */
  async invokePrompt(
    name: string,
    args: Record<string, string>,
  ): Promise<Array<{ role: string; content: string }> | null> {
    this.store.append("user", {
      type: "prompt.invoked",
      primitive: "prompt",
      promptName: name,
      args,
    });
    const res = await this.call({ kind: "prompts/get", name, args });
    const result = rpcResult(res?.responseFrame);
    if (!res?.ok || !result) return null;
    const messages = ((result.messages as Array<Record<string, unknown>>) ?? []).map((m) => {
      const c = m.content;
      const text =
        typeof c === "string"
          ? c
          : ((c as { text?: string })?.text ?? JSON.stringify(c));
      return { role: String(m.role), content: text };
    });
    this.store.append("server", {
      type: "prompt.expanded",
      primitive: "prompt",
      promptName: name,
      messages,
    });
    return messages;
  }

  /**
   * MCP completion/complete for a prompt argument (e.g. dataset_id) or a
   * resource-template variable (e.g. {id} in dkan://dataset/{id}).
   * Logged like any other exchange — completions are protocol calls too and
   * show up in the raw-frames drawer.
   */
  async completeArgument(ref: CompletionRef, argName: string, value: string): Promise<string[]> {
    const res = await this.call({ kind: "completion/complete", ref, argName, value });
    const result = rpcResult(res?.responseFrame);
    if (!res?.ok || !result) return [];
    const completion = result.completion as { values?: string[] } | undefined;
    return completion?.values ?? [];
  }

  /** resources/read round-trip (app-controlled) — logs resource.read; no
   *  attachment. The browser's Preview action. */
  async readResource(
    uri: string,
  ): Promise<{ contents: ResourceContent[]; latencyMs?: number } | { error: string }> {
    const requestId = `r-${crypto.randomUUID().slice(0, 8)}`;
    const res = await this.call({ kind: "resources/read", uri }, requestId);
    const result = rpcResult(res?.responseFrame);
    if (!res?.ok || !result) {
      const err = rpcError(res?.responseFrame);
      return { error: err?.message ?? "read failed — see the timeline for details" };
    }
    const contents = ((result.contents as Array<Record<string, unknown>>) ?? []).map((c) => ({
      uri: String(c.uri ?? uri),
      mimeType: c.mimeType as string | undefined,
      text: c.text as string | undefined,
    }));
    // Log a size-capped copy; the returned (and attached) contents stay full.
    const loggedContents = contents.map((c) => ({
      ...c,
      text:
        typeof c.text === "string" && c.text.length > RESOURCE_TEXT_CAP
          ? `${c.text.slice(0, RESOURCE_TEXT_CAP)}… [truncated in log; model receives full text]`
          : c.text,
    }));
    this.store.append("app", {
      type: "resource.read",
      primitive: "resource",
      requestId,
      uri,
      latencyMs: res.latencyMs ?? 0,
      contents: loggedContents,
    });
    return { contents, latencyMs: res.latencyMs };
  }

  /** Attach already-read contents: user action; snapshot shows the result. */
  attachFromRead(uri: string, name: string, contents: ResourceContent[]): void {
    this.store.append("user", {
      type: "resource.attached",
      primitive: "resource",
      uri,
      name,
      mimeType: contents[0]?.mimeType,
    });
    this.attached.push({ uri, name, text: contents[0]?.text });
    this.snapshotContext("preview");
  }

  /** Read + attach in one step (no prior preview). */
  async attachResource(
    uri: string,
    name: string,
  ): Promise<{ blocks: number; mimeType?: string; latencyMs?: number } | { error: string }> {
    const read = await this.readResource(uri);
    if ("error" in read) return read;
    this.attachFromRead(uri, name, read.contents);
    return {
      blocks: read.contents.length,
      mimeType: read.contents[0]?.mimeType,
      latencyMs: read.latencyMs,
    };
  }

  /** What the model receives — the context visualizer's data. */
  snapshotContext(
    turnId: string,
    messageSummaries: Array<{ role: string; summary: string }> = [],
    chars?: { system: number; messages: number; tools: number },
  ): void {
    this.store.append("app", {
      type: "context.snapshot",
      turnId,
      chars,
      blocks: [
        { kind: "system" as const, summary: AGENT_SYSTEM_SUMMARY },
        ...messageSummaries.map((m) => ({ kind: "message" as const, role: m.role, summary: m.summary })),
        {
          kind: "tool_definitions" as const,
          count: this.effectiveTools.length,
          names: this.effectiveTools.map((t) => t.name),
        },
        ...this.attached.map((a) => ({
          kind: "attached_resource" as const,
          uri: a.uri,
          name: a.name,
        })),
      ],
    });
  }

  private async list(kind: ListKind): Promise<void> {
    const res = await this.call({ kind });
    const result = rpcResult(res?.responseFrame);
    if (!res?.ok || !result) return;

    let items: CapabilityItem[] = [];
    if (kind === "tools/list") {
      items = ((result.tools as Array<Record<string, unknown>>) ?? []).map((t) => ({
        name: String(t.name),
        title: t.title as string | undefined,
        description: t.description as string | undefined,
        schema: t.inputSchema,
        outputSchema: t.outputSchema,
        annotations: t.annotations as Record<string, unknown> | undefined,
      }));
      this.toolItems = items;
    } else if (kind === "resources/list") {
      items = ((result.resources as Array<Record<string, unknown>>) ?? []).map((r) => ({
        name: String(r.uri),
        title: r.name as string | undefined,
        description: r.description as string | undefined,
      }));
    } else if (kind === "resources/templates/list") {
      items = ((result.resourceTemplates as Array<Record<string, unknown>>) ?? []).map((r) => ({
        name: String(r.uriTemplate),
        title: r.name as string | undefined,
        description: r.description as string | undefined,
        isTemplate: true,
        uriTemplate: String(r.uriTemplate),
      }));
    } else {
      items = ((result.prompts as Array<Record<string, unknown>>) ?? []).map((p) => ({
        name: String(p.name),
        title: p.title as string | undefined,
        description: p.description as string | undefined,
        schema: p.arguments,
      }));
    }

    this.store.append("app", {
      type: "capabilities.listed",
      primitive: LIST_PRIMITIVE[kind],
      requestId: String(res.requestFrame?.id ?? ""),
      persona: this.persona,
      items,
    });
  }

  private async call(
    op: Record<string, unknown>,
    requestId?: string,
  ): Promise<ProxyResult | null> {
    let res: ProxyResult;
    try {
      const httpRes = await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: this.profileId,
          persona: this.persona,
          op,
          mcpSessionId: this.mcpSessionId,
          requestId,
        }),
      });
      res = (await httpRes.json()) as ProxyResult;
    } catch (err) {
      this.store.append("app", {
        type: "error",
        scope: "transport",
        message: err instanceof Error ? err.message : String(err),
      });
      return null;
    }

    if (res.transportError) {
      this.store.append("app", {
        type: "error",
        scope: "transport",
        message: res.transportError,
      });
      return null;
    }

    if (res.token?.minted) {
      this.store.append("app", {
        type: "auth.oauth.step",
        step: "token_request",
        detail: `client_credentials grant, persona ${this.persona}`,
      });
      this.store.append("server", {
        type: "auth.token.received",
        scopes: res.token.scopes,
        expiresAt: res.token.expiresAt,
        tokenPreview: "REDACTED",
      });
    }

    this.store.append("app", {
      type: "rpc.request",
      requestId: res.requestFrame?.id !== undefined ? String(res.requestFrame.id) : undefined,
      method: res.requestFrame?.method,
      raw: res.requestFrame,
    });
    this.store.append("server", {
      type: "rpc.response",
      requestId: res.requestFrame?.id !== undefined ? String(res.requestFrame.id) : undefined,
      raw: res.responseFrame,
      http: {
        status: res.httpStatus ?? 0,
        headers: res.headers ?? {},
        sse: res.sse ?? false,
      },
    });

    const err = rpcError(res.responseFrame);
    if (err) {
      this.store.append("server", {
        type: "error",
        scope: "rpc",
        httpStatus: res.httpStatus,
        code: err.code,
        message: err.message,
        requestId: res.requestFrame?.id !== undefined ? String(res.requestFrame.id) : undefined,
      });
    }
    return res;
  }
}
