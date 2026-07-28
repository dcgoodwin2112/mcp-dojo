import { describe, expect, it } from "vitest";
import { buildFrame, buildForwardHeaders, negotiatedVersion } from "@/lib/mcp-frames";

describe("buildFrame", () => {
  it("puts the requested protocol version in the initialize body", () => {
    const f = buildFrame({ kind: "initialize" }, "r-1", "2025-06-18");
    expect(f.method).toBe("initialize");
    expect((f.params as { protocolVersion: string }).protocolVersion).toBe("2025-06-18");
  });

  it("adds a progressToken to tools/call so servers stream progress", () => {
    const f = buildFrame({ kind: "tools/call", name: "t", args: { a: 1 } }, "r-9", "2025-06-18");
    expect(f.params).toEqual({ name: "t", arguments: { a: 1 }, _meta: { progressToken: "r-9" } });
  });

  it("builds list frames with empty params", () => {
    const f = buildFrame({ kind: "tools/list" }, "r-2", "2025-06-18");
    expect(f).toEqual({ jsonrpc: "2.0", id: "r-2", method: "tools/list", params: {} });
  });
});

describe("buildForwardHeaders", () => {
  it("always sends content-type and accept; everything else is conditional", () => {
    expect(buildForwardHeaders()).toEqual({
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    });
  });

  it("adds authorization, session id, and the protocol-version header when given", () => {
    const h = buildForwardHeaders("Bearer x", "sess-1", "2025-06-18");
    expect(h.Authorization).toBe("Bearer x");
    expect(h["Mcp-Session-Id"]).toBe("sess-1");
    expect(h["MCP-Protocol-Version"]).toBe("2025-06-18");
  });
});

describe("negotiatedVersion", () => {
  it("reads the server's negotiated version from the initialize result", () => {
    const frame = { jsonrpc: "2.0", id: "r-1", result: { protocolVersion: "2025-03-26" } };
    expect(negotiatedVersion(frame, "2025-06-18")).toBe("2025-03-26");
  });

  it("falls back when the result is absent or malformed", () => {
    expect(negotiatedVersion(null, "2025-06-18")).toBe("2025-06-18");
    expect(negotiatedVersion({ result: {} }, "2025-06-18")).toBe("2025-06-18");
    expect(negotiatedVersion({ result: { protocolVersion: 42 } }, "2025-06-18")).toBe("2025-06-18");
    expect(negotiatedVersion({ result: { protocolVersion: " " } }, "2025-06-18")).toBe("2025-06-18");
  });
});
