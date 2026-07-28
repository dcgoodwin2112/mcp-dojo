import { fileURLToPath } from "node:url";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { ResolvedProfile } from "@/lib/profile-config";

process.env.MCP_DOJO_STDIO_TIMEOUT_MS = "700";

// Dynamic import AFTER the env override — static imports would hoist.
type Manager = typeof import("@/lib/stdio-manager");
let mgr: Manager;
beforeAll(async () => {
  mgr = await import("@/lib/stdio-manager");
});
afterEach(() => {
  mgr.stdioKillAll();
});

const CHILD = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/stdio-child.mjs");

function profile(id = "stdio-test", over: Record<string, unknown> = {}): ResolvedProfile {
  return {
    id,
    name: id,
    transport: {
      kind: "stdio",
      command: process.execPath,
      args: [CHILD],
      env: {},
      secretEnv: {},
      redact: [],
      ...over,
    },
    protocolVersion: "2025-06-18",
    allowSelfSigned: false,
    auth: { type: "none" },
  };
}

const initFrame = (id = "i-1") => ({
  jsonrpc: "2.0",
  id,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", clientInfo: { name: "t", version: "1" }, capabilities: {} },
});
const callFrame = (id: string, name: string) => ({
  jsonrpc: "2.0",
  id,
  method: "tools/call",
  params: { name, arguments: {} },
});

async function connect(p = profile()) {
  return mgr.stdioInitialize(p, "default", initFrame());
}

describe("stdio-manager", () => {
  it("initializes, matches the response, and completes the handshake", async () => {
    const p = profile();
    const init = await connect(p);
    expect((init.responseFrame as { result?: unknown }).result).toBeDefined();
    expect(init.initializedFrame).toEqual({ jsonrpc: "2.0", method: "notifications/initialized" });
    // The child must have SEEN notifications/initialized before later calls.
    const saw = await mgr.stdioCall(init.sessionId, p.id, "default", callFrame("c-1", "saw-initialized"));
    expect((saw.responseFrame as { result: { saw: boolean } }).result.saw).toBe(true);
  });

  it("keeps a notification emitted before the response in wire order", async () => {
    const p = profile();
    const init = await connect(p);
    const r = await mgr.stdioCall(init.sessionId, p.id, "default", callFrame("c-2", "notify-then-respond"));
    expect(r.ordered.map((e) => e.kind)).toEqual(["notification", "response"]);
  });

  it("drains idle frames as unsolicited on the NEXT request", async () => {
    const p = profile();
    const init = await connect(p);
    await mgr.stdioCall(init.sessionId, p.id, "default", callFrame("c-3", "later-notify"));
    await new Promise((r) => setTimeout(r, 120)); // let the delayed notification arrive idle
    const next = await mgr.stdioCall(init.sessionId, p.id, "default", callFrame("c-4", "echo"));
    expect(next.unsolicited.map((e) => e.kind)).toEqual(["notification"]);
    expect(next.ordered.map((e) => e.kind)).toEqual(["response"]);
  });

  it("serializes overlapping requests without misattributing responses", async () => {
    const p = profile();
    const init = await connect(p);
    const [slow, fast] = await Promise.all([
      mgr.stdioCall(init.sessionId, p.id, "default", callFrame("c-5", "slow")),
      mgr.stdioCall(init.sessionId, p.id, "default", callFrame("c-6", "echo")),
    ]);
    expect((slow.responseFrame as { id: string }).id).toBe("c-5");
    expect((fast.responseFrame as { id: string }).id).toBe("c-6");
  });

  it("times out a silent request", async () => {
    const p = profile();
    const init = await connect(p);
    await expect(
      mgr.stdioCall(init.sessionId, p.id, "default", callFrame("c-7", "silent")),
    ).rejects.toThrow(/timed out/);
  });

  it("redacts secrets from stderr excerpts", async () => {
    const p = profile("stdio-secret", {
      env: {},
      secretEnv: { CHILD_SECRET: "sekret-value-123" },
      redact: ["sekret-value-123"],
    });
    const init = await mgr.stdioInitialize(p, "default", initFrame());
    const err = await mgr
      .stdioCall(init.sessionId, p.id, "default", callFrame("c-8", "stderr-secret"))
      .catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("REDACTED");
    expect((err as Error).message).not.toContain("sekret-value-123");
  });

  it("gives children a minimal env: parent secrets absent, profile env present", async () => {
    process.env.ANTHROPIC_API_KEY_TEST_SENTINEL = "should-not-leak";
    const p = profile("stdio-env", { env: { MY_FLAG: "yes" } });
    const init = await mgr.stdioInitialize(p, "default", initFrame());
    const r = await mgr.stdioCall(init.sessionId, p.id, "default", callFrame("c-9", "env-keys"));
    const keys = (r.responseFrame as { result: { keys: string[] } }).result.keys;
    expect(keys).toContain("MY_FLAG");
    expect(keys).toContain("PATH");
    expect(keys).not.toContain("ANTHROPIC_API_KEY_TEST_SENTINEL");
  });

  it("kills a flooding session at the frame cap", async () => {
    const p = profile();
    const init = await connect(p);
    await expect(
      mgr.stdioCall(init.sessionId, p.id, "default", callFrame("c-10", "flood")),
    ).rejects.toThrow(/flooded/);
    expect(() =>
      mgr.stdioCall(init.sessionId, p.id, "default", callFrame("c-11", "echo")),
    ).toThrow(/unknown or expired/);
  });

  it("rejects calls from a different profile on a bound session", async () => {
    const p = profile("writer");
    const init = await connect(p);
    expect(() =>
      mgr.stdioCall(init.sessionId, "read-only-profile", "default", callFrame("c-12", "echo")),
    ).toThrow(/different profile/);
  });

  it("close kills the session; unknown ids are a no-op", async () => {
    const p = profile();
    const init = await connect(p);
    mgr.stdioClose("not-a-session"); // no-op
    mgr.stdioClose(init.sessionId);
    expect(() =>
      mgr.stdioCall(init.sessionId, p.id, "default", callFrame("c-13", "echo")),
    ).toThrow(/unknown or expired/);
    expect(mgr.stdioSessionCount()).toBe(0);
  });
});
