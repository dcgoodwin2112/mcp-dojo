import { AGENT_SYSTEM_SUMMARY, type LiveSession } from "./live";

/**
 * Client-side agent loop: model → tool_use → MCP call → tool_result → model,
 * with every hop logged and an optional step gate between hops (the plan's
 * "step button pauses between hops").
 */

export interface ContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface AgentTurnResult {
  content: ContentBlock[];
  stop_reason?: string;
  latencyMs?: number;
  error?: string;
}

export class AgentLoop {
  private messages: Array<{ role: "user" | "assistant"; content: unknown }> = [];

  /** Read-only view of the live conversation array for the Context Inspector. */
  getMessages(): ReadonlyArray<{ role: "user" | "assistant"; content: unknown }> {
    return this.messages;
  }
  private turnCount = 0;
  stepMode = false;
  /** Set while waiting for the presenter to press Continue. */
  waiting = false;
  private gateResolve: (() => void) | null = null;
  onStateChange: (() => void) | null = null;

  constructor(private session: LiveSession) {}

  continueStep(): void {
    this.gateResolve?.();
  }

  private async gate(): Promise<void> {
    if (!this.stepMode) return;
    this.waiting = true;
    this.onStateChange?.();
    await new Promise<void>((resolve) => {
      this.gateResolve = resolve;
    });
    this.gateResolve = null;
    this.waiting = false;
    this.onStateChange?.();
  }

  /** Base instructions — editable from the Context Inspector. */
  systemBase = AGENT_SYSTEM_SUMMARY;

  setSystemBase(text: string): void {
    const next = text.trim() || AGENT_SYSTEM_SUMMARY;
    if (next === this.systemBase) return;
    const reset = next === AGENT_SYSTEM_SUMMARY;
    this.systemBase = next;
    this.session.store.append("user", {
      type: "context.updated",
      field: "system",
      detail: reset
        ? "system instructions reset to default"
        : `system instructions edited (${next.length} chars)`,
      text: next,
    });
  }

  /** Wipe conversation history (system, attachments, and tools survive). */
  clearConversation(): void {
    const removed = this.messages.length;
    if (removed === 0) return;
    this.messages = [];
    this.session.store.append("user", {
      type: "context.updated",
      field: "history",
      detail: `conversation cleared (${removed} messages removed)`,
    });
  }

  /** The exact system prompt the next model call will send (base + server
   *  instructions from initialize + attached resources) — the Context
   *  Inspector shows each part. */
  get system(): string {
    const server = this.session.serverInstructions
      ? `\n\n=== Server instructions (from initialize) ===\n${this.session.serverInstructions}`
      : "";
    const attachments = this.session.attached
      .filter((a) => a.text)
      .map((a) => `\n\n=== Attached resource: ${a.uri} (${a.name}) ===\n${a.text}`)
      .join("");
    return this.systemBase + server + attachments;
  }

  async send(
    userText: string,
    trigger: "user_message" | "prompt_invocation" = "user_message",
  ): Promise<void> {
    const store = this.session.store;
    this.turnCount += 1;
    const turnId = `turn-${this.turnCount}`;

    store.append("user", { type: "turn.started", turnId, trigger });
    // A prompt invocation's content is already on the timeline as
    // prompt.expanded — no duplicate user.message.
    if (trigger === "user_message") {
      store.append("user", { type: "user.message", turnId, text: userText });
    }
    this.messages.push({ role: "user", content: userText });

    for (;;) {
      this.session.snapshotContext(
        turnId,
        this.messages.slice(-3).map((m) => ({
          role: m.role,
          summary:
            typeof m.content === "string"
              ? m.content.slice(0, 80)
              : `${(m.content as ContentBlock[]).length} content block(s)`,
        })),
        {
          system: this.system.length,
          messages: JSON.stringify(this.messages).length,
          tools: JSON.stringify(
            this.session.effectiveTools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.schema,
            })),
          ).length,
        },
      );

      await this.gate();
      const res = await this.modelCall();
      if (res.error) {
        store.append("app", { type: "error", scope: "model", message: res.error });
        return;
      }

      const toolUses: ContentBlock[] = [];
      for (const block of res.content) {
        if (block.type === "text" && block.text) {
          store.append("model", { type: "model.text", turnId, text: block.text });
        } else if (block.type === "tool_use") {
          toolUses.push(block);
        }
      }
      this.messages.push({ role: "assistant", content: res.content });

      if (toolUses.length === 0) return;

      const results: unknown[] = [];
      for (const tu of toolUses) {
        await this.gate();
        const outcome = await this.session.callTool(tu.name ?? "", tu.input ?? {}, {
          actor: "model",
          turnId,
        });
        results.push({
          type: "tool_result",
          tool_use_id: tu.id,
          is_error: outcome.isError,
          content: outcome.content
            .filter((c) => c.type === "text")
            .map((c) => ({ type: "text", text: c.text ?? "" })),
        });
      }
      this.messages.push({ role: "user", content: results });
      store.append("app", { type: "turn.started", turnId, trigger: "tool_result" });
      await this.gate();
    }
  }

  private async modelCall(): Promise<AgentTurnResult> {
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: this.system,
          messages: this.messages,
          tools: this.session.effectiveTools.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.schema ?? { type: "object", properties: {} },
          })),
        }),
      });
      const data = (await res.json()) as AgentTurnResult;
      if (!res.ok) return { content: [], error: data.error ?? `HTTP ${res.status}` };
      return data;
    } catch (err) {
      return { content: [], error: err instanceof Error ? err.message : String(err) };
    }
  }
}
