import type { InspectorEvent } from "./events";

/**
 * Sequence-diagram rows derived from the event log — who talks to whom.
 * Pure mapping; the SequenceDiagram component only positions what this
 * returns. Lane order user|model|app|server keeps the frequent pairs
 * (model⇄app, app⇄server) adjacent; rpc.* frames are the raw layer and are
 * skipped.
 */

export const LANES = ["user", "model", "app", "server"] as const;
export type Lane = (typeof LANES)[number];

export type DiagramRow =
  | {
      kind: "arrow";
      id: string;
      from: Lane;
      to: Lane;
      label: string;
      /** Fuller text revealed on hover; label is the compact fallback. */
      detail?: string;
      dashed?: boolean;
      tone?: "error";
    }
  | { kind: "note"; id: string; lane: Lane; label: string; detail?: string }
  | { kind: "banner"; id: string; label: string };

function short(s: string, n = 42): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
}

function shortUri(uri: string): string {
  return short(uri.replace(/^dkan:\/\//, ""), 36);
}

export function diagramRows(events: InspectorEvent[]): DiagramRow[] {
  const rows: DiagramRow[] = [];
  const arrow = (
    id: string,
    from: Lane,
    to: Lane,
    label: string,
    opts: { detail?: string; dashed?: boolean; tone?: "error" } = {},
  ) => rows.push({ kind: "arrow", id, from, to, label, ...opts });
  const note = (id: string, lane: Lane, label: string, detail?: string) =>
    rows.push({ kind: "note", id, lane, label, detail });

  for (const e of events) {
    switch (e.type) {
      case "session.started":
        note(e.id, "app", `session started (${e.transport})`);
        break;
      case "auth.persona.selected":
        note(e.id, "user", `persona: ${e.label}`);
        break;
      case "auth.oauth.step":
        arrow(e.id, "app", "server", `OAuth ${e.step}`);
        break;
      case "auth.token.received":
        arrow(e.id, "server", "app", `access token · ${e.scopes.join(" ")}`, { dashed: true });
        break;
      case "mcp.initialized":
        arrow(`${e.id}-req`, "app", "server", "initialize");
        arrow(`${e.id}-res`, "server", "app", "capabilities · protocol version", { dashed: true });
        break;
      case "capabilities.listed": {
        const method =
          e.primitive === "tool"
            ? "tools/list"
            : e.primitive === "prompt"
              ? "prompts/list"
              : e.items.some((i) => i.isTemplate)
                ? "resources/templates/list"
                : "resources/list";
        arrow(`${e.id}-req`, "app", "server", method);
        arrow(`${e.id}-res`, "server", "app", `${e.items.length} ${e.primitive}s`, {
          dashed: true,
        });
        break;
      }
      case "user.message":
        arrow(e.id, "user", "app", short(e.text), { detail: short(e.text, 220) });
        break;
      case "context.snapshot": {
        const tools = e.blocks.find((b) => b.kind === "tool_definitions");
        const attached = e.blocks.filter((b) => b.kind === "attached_resource").length;
        const toolCount = tools && "count" in tools ? tools.count : 0;
        arrow(
          e.id,
          "app",
          "model",
          `context: ${toolCount} tools${attached > 0 ? ` · ${attached} attached` : ""}`,
        );
        break;
      }
      case "tool.call.requested": {
        const args = short(JSON.stringify(e.args), 24);
        if (e.turnId) {
          arrow(`${e.id}-use`, "model", "app", `tool_use ${e.toolName}`);
        } else {
          arrow(`${e.id}-use`, "user", "app", `call ${e.toolName}`);
        }
        arrow(`${e.id}-call`, "app", "server", `tools/call ${e.toolName} ${args}`, {
          detail: `tools/call ${e.toolName} ${short(JSON.stringify(e.args), 220)}`,
        });
        break;
      }
      case "tool.call.completed":
        arrow(e.id, "server", "app", `${e.toolName} result · ${e.latencyMs} ms`, {
          dashed: true,
          tone: e.isError ? "error" : undefined,
        });
        break;
      case "resource.read":
        arrow(`${e.id}-req`, "app", "server", `resources/read ${shortUri(e.uri)}`, {
          detail: `resources/read ${e.uri}`,
        });
        arrow(`${e.id}-res`, "server", "app", `contents · ${e.latencyMs} ms`, { dashed: true });
        break;
      case "resource.attached":
        note(e.id, "app", `attached ${shortUri(e.uri)} to context`, `attached ${e.uri} to context`);
        break;
      case "resource.detached":
        note(e.id, "app", `detached ${shortUri(e.uri)}`, `detached ${e.uri}`);
        break;
      case "prompt.invoked":
        arrow(`${e.id}-inv`, "user", "app", `/${e.promptName}`);
        arrow(`${e.id}-get`, "app", "server", `prompts/get ${e.promptName}`);
        break;
      case "prompt.expanded":
        arrow(e.id, "server", "app", "expanded messages (previewed)", { dashed: true });
        break;
      case "model.text":
        arrow(e.id, "model", "app", short(e.text), { dashed: true, detail: short(e.text, 220) });
        break;
      case "context.updated":
        note(e.id, "app", `✎ ${short(e.detail, 48)}`, `✎ ${short(e.detail, 220)}`);
        break;
      case "error":
        if (e.scope === "rpc" || e.scope === "auth") {
          arrow(e.id, "server", "app", short(`${e.code ?? ""} ${e.message}`, 48), {
            dashed: true,
            tone: "error",
            detail: short(`${e.code ?? ""} ${e.message}`, 220),
          });
        } else {
          note(e.id, "app", short(`error: ${e.message}`, 48), short(`error: ${e.message}`, 220));
        }
        break;
      case "session.ended":
        note(e.id, "app", `session ended (${e.reason})`);
        break;
      case "annotation":
        rows.push({ kind: "banner", id: e.id, label: e.text });
        break;
      // Skipped intentionally: rpc.* frames (the raw layer, shown in the
      // frames drawer) and turn.started (host bookkeeping — the app→model
      // context arrow already marks each turn).
    }
  }
  return rows;
}
