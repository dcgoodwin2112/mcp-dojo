/**
 * Streamable-HTTP body parsing + frame classification — pure. An MCP POST
 * response may be plain JSON or an SSE stream carrying several JSON-RPC
 * frames (notifications interleaved with the response). Every frame is
 * preserved: malformed payloads become { unparseable } frames instead of
 * being dropped or thrown.
 */

export function parseMcpBody(body: string, contentType: string): unknown[] {
  const normalized = body.replace(/\r\n/g, "\n");
  const trimmed = normalized.trim();
  if (trimmed === "") return [];

  const isSse =
    contentType.includes("text/event-stream") ||
    trimmed.startsWith("event:") ||
    trimmed.startsWith("data:");
  if (!isSse) {
    try {
      return [JSON.parse(trimmed)];
    } catch {
      return [{ unparseable: body }];
    }
  }

  const frames: unknown[] = [];
  for (const block of normalized.split(/\n{2,}/)) {
    const dataLines = block
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).replace(/^ /, ""));
    if (dataLines.length === 0) continue; // comment / event-name-only block
    const payload = dataLines.join("\n");
    try {
      frames.push(JSON.parse(payload));
    } catch {
      frames.push({ unparseable: payload });
    }
  }
  return frames;
}

export type FrameKind =
  | "response"
  | "notification"
  | "server-request"
  | "orphan-response"
  | "unparseable";

export interface ClassifiedFrame {
  kind: FrameKind;
  frame: unknown;
}

export interface ClassifiedFrames {
  /** The frame answering `requestId` (or the last result/error fallback). */
  response: unknown;
  /** EVERY parsed frame in wire order, tagged — full coverage, so nothing
   *  the parser preserved can be dropped by classification. */
  ordered: ClassifiedFrame[];
}

function isObj(f: unknown): f is Record<string, unknown> {
  return f !== null && typeof f === "object";
}

export function classifyFrames(frames: unknown[], requestId: string): ClassifiedFrames {
  let responseIdx = frames.findIndex(
    (f) => isObj(f) && !("method" in f) && "id" in f && String(f.id) === requestId,
  );
  if (responseIdx === -1) {
    // Conforming single-frame servers may use ids we didn't coerce
    // identically — fall back to the last result/error frame.
    for (let i = frames.length - 1; i >= 0; i--) {
      const f = frames[i];
      if (isObj(f) && ("result" in f || "error" in f) && !("method" in f)) {
        responseIdx = i;
        break;
      }
    }
  }

  const ordered = frames.map((f, i): ClassifiedFrame => {
    if (i === responseIdx) return { kind: "response", frame: f };
    if (isObj(f) && "unparseable" in f) return { kind: "unparseable", frame: f };
    if (isObj(f) && "method" in f) {
      return { kind: "id" in f ? "server-request" : "notification", frame: f };
    }
    if (isObj(f) && ("result" in f || "error" in f)) return { kind: "orphan-response", frame: f };
    return { kind: "unparseable", frame: f }; // unknown shape — still preserved
  });

  return { response: responseIdx >= 0 ? frames[responseIdx] : null, ordered };
}
