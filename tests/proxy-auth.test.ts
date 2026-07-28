import { describe, expect, it } from "vitest";
import type { ResolvedProfile } from "@/lib/profile-config";
import { dispatchAuth, tokenCacheKey } from "@/lib/proxy-auth";

function profile(auth: ResolvedProfile["auth"], id = "p1"): ResolvedProfile {
  return {
    id,
    name: id,
    transport: { kind: "streamable-http", url: "https://example.test/mcp" },
    protocolVersion: "2025-06-18",
    allowSelfSigned: false,
    auth,
  };
}

describe("dispatchAuth", () => {
  it("none: accepts only the implicit default persona and sends no header", () => {
    const p = profile({ type: "none" });
    expect(dispatchAuth(p, "default")).toEqual({ mode: "none" });
    expect(dispatchAuth(p, "read-only")).toEqual({
      error: 'profile "p1" has no persona "read-only"',
    });
  });

  it("bearer: returns the persona's static Authorization header", () => {
    const p = profile({
      type: "bearer",
      personas: [{ key: "svc", label: "Service", token: "tok-123" }],
    });
    expect(dispatchAuth(p, "svc")).toEqual({ mode: "bearer", authorization: "Bearer tok-123" });
    expect(dispatchAuth(p, "nope")).toEqual({ error: 'profile "p1" has no persona "nope"' });
  });

  it("oauth: returns persona credentials and a profile-scoped cache key", () => {
    const persona = {
      key: "read-only",
      label: "Read-only",
      clientId: "c",
      clientSecret: "s",
      scope: "read",
    };
    const p = profile(
      { type: "oauth-client-credentials", tokenUrl: "https://t", personas: [persona] },
      "dkan",
    );
    expect(dispatchAuth(p, "read-only")).toEqual({
      mode: "oauth",
      persona,
      tokenUrl: "https://t",
      cacheKey: "dkan:read-only",
    });
    expect(dispatchAuth(p, "editor")).toEqual({ error: 'profile "dkan" has no persona "editor"' });
  });

  it("cache keys never collide across profiles sharing persona keys", () => {
    expect(tokenCacheKey("dkan", "read-only")).not.toBe(tokenCacheKey("other", "read-only"));
  });
});
