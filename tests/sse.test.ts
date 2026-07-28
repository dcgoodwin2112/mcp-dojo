import { describe, expect, it } from "vitest";
import { classifyFrames, classifyUnsolicited, parseMcpBody } from "@/lib/sse";

const SSE = "text/event-stream; charset=utf-8";

describe("parseMcpBody", () => {
  it("parses a plain JSON body into one frame", () => {
    expect(parseMcpBody('{"jsonrpc":"2.0","id":"r-1","result":{}}', "application/json")).toEqual([
      { jsonrpc: "2.0", id: "r-1", result: {} },
    ]);
  });

  it("returns [] for empty bodies", () => {
    expect(parseMcpBody("", SSE)).toEqual([]);
    expect(parseMcpBody("  \n", "application/json")).toEqual([]);
  });

  it("preserves malformed plain JSON as an unparseable frame", () => {
    expect(parseMcpBody("<html>gateway error</html>", "application/json")).toEqual([
      { unparseable: "<html>gateway error</html>" },
    ]);
  });

  it("parses a single-event SSE body", () => {
    const body = 'event: message\ndata: {"jsonrpc":"2.0","id":"r-1","result":{}}\n\n';
    expect(parseMcpBody(body, SSE)).toEqual([{ jsonrpc: "2.0", id: "r-1", result: {} }]);
  });

  it("keeps every event of a multi-event SSE body in order", () => {
    const body = [
      'data: {"jsonrpc":"2.0","method":"notifications/progress","params":{"progress":1}}',
      "",
      'data: {"jsonrpc":"2.0","id":"r-1","result":{"done":true}}',
      "",
    ].join("\n");
    expect(parseMcpBody(body, SSE)).toEqual([
      { jsonrpc: "2.0", method: "notifications/progress", params: { progress: 1 } },
      { jsonrpc: "2.0", id: "r-1", result: { done: true } },
    ]);
  });

  it("joins multi-line data fields and ignores comments/event/id/retry lines", () => {
    const body = [
      ": keepalive",
      "event: message",
      "id: 7",
      "retry: 1000",
      'data: {"a":',
      "data: 1}",
      "",
    ].join("\n");
    expect(parseMcpBody(body, SSE)).toEqual([{ a: 1 }]);
  });

  it("handles CRLF bodies and sniffs SSE without the content type", () => {
    const body = 'data: {"ok":true}\r\n\r\n';
    expect(parseMcpBody(body, "text/plain")).toEqual([{ ok: true }]);
  });

  it("preserves malformed SSE payloads as unparseable frames", () => {
    const body = 'data: {broken\n\ndata: {"jsonrpc":"2.0","id":"r-1","result":{}}\n\n';
    expect(parseMcpBody(body, SSE)).toEqual([
      { unparseable: "{broken" },
      { jsonrpc: "2.0", id: "r-1", result: {} },
    ]);
  });
});

describe("classifyFrames", () => {
  const response = { jsonrpc: "2.0", id: "r-1", result: {} };
  const note = { jsonrpc: "2.0", method: "notifications/progress", params: {} };

  it("matches the response by id, keeping wire order in the full list", () => {
    const { response: r, ordered } = classifyFrames([note, response, note], "r-1");
    expect(r).toBe(response);
    expect(ordered.map((e) => e.kind)).toEqual(["notification", "response", "notification"]);
    expect(ordered).toHaveLength(3);
  });

  it("coerces numeric ids", () => {
    const numeric = { jsonrpc: "2.0", id: 7, result: {} };
    expect(classifyFrames([numeric], "7").response).toBe(numeric);
  });

  it("falls back to the last result/error frame when no id matches", () => {
    const other = { jsonrpc: "2.0", id: "other", error: { code: -1, message: "x" } };
    const { response: r, ordered } = classifyFrames([note, other], "r-1");
    expect(r).toBe(other);
    expect(ordered.map((e) => e.kind)).toEqual(["notification", "response"]);
  });

  it("classifies server requests, orphan responses, and unparseables", () => {
    const serverReq = { jsonrpc: "2.0", id: "s-1", method: "sampling/createMessage", params: {} };
    const orphan = { jsonrpc: "2.0", id: "other", result: {} };
    const bad = { unparseable: "{broken" };
    const { ordered } = classifyFrames([serverReq, bad, response, orphan], "r-1");
    expect(ordered.map((e) => e.kind)).toEqual([
      "server-request",
      "unparseable",
      "response",
      "orphan-response",
    ]);
  });

  it("covers every parsed frame — nothing is dropped", () => {
    const frames = [note, { weird: true }, response];
    const { ordered } = classifyFrames(frames, "r-1");
    expect(ordered.map((e) => e.frame)).toEqual(frames);
  });

  it("returns null response for notification-only bodies", () => {
    const { response: r, ordered } = classifyFrames([note], "r-1");
    expect(r).toBeNull();
    expect(ordered.map((e) => e.kind)).toEqual(["notification"]);
  });

  it("strict mode never falls back: wrong-id frames stay orphans", () => {
    const wrongId = { jsonrpc: "2.0", id: "other", result: {} };
    const { response: r, ordered } = classifyFrames([wrongId], "r-1", { fallback: false });
    expect(r).toBeNull();
    expect(ordered.map((e) => e.kind)).toEqual(["orphan-response"]);
  });
});

describe("classifyUnsolicited", () => {
  it("classifies by shape only — nothing becomes a response", () => {
    const frames = [
      { jsonrpc: "2.0", method: "notifications/message", params: {} },
      { jsonrpc: "2.0", id: "s-1", method: "sampling/createMessage", params: {} },
      { jsonrpc: "2.0", id: "x", result: {} },
      { unparseable: "{oops" },
    ];
    expect(classifyUnsolicited(frames).map((e) => e.kind)).toEqual([
      "notification",
      "server-request",
      "orphan-response",
      "unparseable",
    ]);
  });
});
