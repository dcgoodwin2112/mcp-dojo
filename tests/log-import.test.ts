import { describe, expect, it } from "vitest";
import { denialSession } from "@/lib/fixtures/denial-session";
import { MAX_LOG_BYTES, MAX_LOG_EVENTS, parseEventLogJson } from "@/lib/log-import";

describe("parseEventLogJson", () => {
  it("round-trips a valid log", () => {
    const r = parseEventLogJson(JSON.stringify(denialSession));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.log).toEqual(denialSession);
  });

  it("rejects malformed JSON with a readable error", () => {
    const r = parseEventLogJson("{not json");
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toContain("not valid JSON");
  });

  it("rejects a schema-violating log, naming the offending path", () => {
    const bad = { ...denialSession, version: 1 };
    const r = parseEventLogJson(JSON.stringify(bad));
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) {
      expect(r.error).toContain("not a valid event log");
      expect(r.error).toContain("version");
    }
  });

  it("truncates long issue lists", () => {
    const bad = {
      ...denialSession,
      // Break seq on many events: every issue past the third is elided.
      events: denialSession.events.map((e, i) => (i === 0 ? e : { ...e, seq: e.seq + 100 + i })),
    };
    const r = parseEventLogJson(JSON.stringify(bad));
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toMatch(/\(\+\d+ more\)/);
  });

  it("rejects an empty file", () => {
    const r = parseEventLogJson("  \n");
    expect(r).toMatchObject({ ok: false, error: "file is empty" });
  });

  it("rejects oversize input without parsing it", () => {
    const r = parseEventLogJson("x".repeat(MAX_LOG_BYTES + 1));
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toContain("larger than");
  });

  it("rejects an over-limit event count before schema validation", () => {
    const huge = {
      version: 2,
      sessionId: "s",
      recordedAt: "now",
      events: Array.from({ length: MAX_LOG_EVENTS + 1 }, () => ({})),
    };
    const r = parseEventLogJson(JSON.stringify(huge));
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toContain(`limit ${MAX_LOG_EVENTS}`);
  });
});
