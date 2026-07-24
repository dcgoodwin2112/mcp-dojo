import { describe, expect, it } from "vitest";
import { EventLogSchema } from "@/lib/events";

function envelope(seq: number, t: number) {
  return {
    id: `evt-${seq}`,
    seq,
    t,
    wall: "2026-01-01T00:00:00.000Z",
    sessionId: "s",
    actor: "app" as const,
  };
}

const started = {
  ...envelope(1, 0),
  type: "session.started",
  profile: "Test",
  serverUrl: "u",
  transport: "streamable-http",
  mode: "live",
};

function log(events: unknown[]) {
  return { version: 2, sessionId: "s", recordedAt: "2026-01-01T00:00:00.000Z", events };
}

describe("EventLogSchema invariants", () => {
  it("accepts a valid log", () => {
    const r = EventLogSchema.safeParse(
      log([started, { ...envelope(2, 50), type: "annotation", text: "note" }]),
    );
    expect(r.success).toBe(true);
  });

  it("requires the first event to be session.started at t=0", () => {
    const bad1 = EventLogSchema.safeParse(
      log([{ ...envelope(1, 0), type: "annotation", text: "x" }]),
    );
    expect(bad1.success).toBe(false);

    const bad2 = EventLogSchema.safeParse(log([{ ...started, t: 5 }]));
    expect(bad2.success).toBe(false);
    expect(JSON.stringify(bad2.error?.issues)).toContain("replay anchor");
  });

  it("rejects seq gaps", () => {
    const r = EventLogSchema.safeParse(
      log([started, { ...envelope(3, 50), type: "annotation", text: "x" }]),
    );
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain("gapless");
  });

  it("accepts mcp.initialized with and without server instructions", () => {
    const init = {
      ...envelope(2, 10),
      actor: "server" as const,
      type: "mcp.initialized",
      requestId: "r-1",
      serverInfo: { name: "s", version: "1" },
      capabilities: {},
    };
    // Older recordings have no instructions field — must still parse.
    expect(EventLogSchema.safeParse(log([started, init])).success).toBe(true);
    expect(
      EventLogSchema.safeParse(
        log([started, { ...init, instructions: "This server exposes a DKAN open data catalog" }]),
      ).success,
    ).toBe(true);
  });

  it("rejects decreasing t", () => {
    const r = EventLogSchema.safeParse(
      log([
        { ...started, t: 0 },
        { ...envelope(2, 100), type: "annotation", text: "x" },
        { ...envelope(3, 50), type: "annotation", text: "y" },
      ]),
    );
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain("non-decreasing");
  });
});
