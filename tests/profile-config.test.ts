import { describe, expect, it } from "vitest";
import {
  parseProfilesConfig,
  publicProfiles,
  type ResolvedProfile,
} from "@/lib/profile-config";

const ENV = {
  MCP_URL: "https://example.test/mcp",
  TOKEN_URL: "https://example.test/oauth/token",
  RO_SECRET: "s3cret-ro",
  ED_SECRET: "s3cret-ed",
  BEARER_TOKEN: "static-token",
};

function oauthProfile(over: Record<string, unknown> = {}) {
  return {
    id: "dkan",
    name: "DKAN",
    transport: { kind: "streamable-http", url: "${MCP_URL}" },
    auth: {
      type: "oauth-client-credentials",
      tokenUrl: "${TOKEN_URL}",
      personas: [
        {
          key: "read-only",
          label: "Read-only",
          clientId: "ro-client",
          clientSecret: "${RO_SECRET}",
          scope: "read",
        },
      ],
    },
    ...over,
  };
}

function parse(profiles: unknown[], env: Record<string, string | undefined> = ENV) {
  return parseProfilesConfig({ profiles }, env);
}

describe("parseProfilesConfig", () => {
  it("resolves an oauth profile with env interpolation and defaults", () => {
    const [p] = parse([oauthProfile()]);
    expect(p.transport.url).toBe("https://example.test/mcp");
    expect(p.protocolVersion).toBe("2025-06-18");
    expect(p.allowSelfSigned).toBe(false);
    expect(p.auth.type).toBe("oauth-client-credentials");
    if (p.auth.type === "oauth-client-credentials") {
      expect(p.auth.tokenUrl).toBe("https://example.test/oauth/token");
      expect(p.auth.personas[0].clientSecret).toBe("s3cret-ro");
    }
  });

  it("resolves none and bearer profiles", () => {
    const [none, bearer] = parse([
      { id: "open", name: "Open", transport: { kind: "streamable-http", url: "${MCP_URL}" }, auth: { type: "none" } },
      {
        id: "tokened",
        name: "Tokened",
        transport: { kind: "streamable-http", url: "${MCP_URL}" },
        auth: {
          type: "bearer",
          personas: [{ key: "svc", label: "Service", token: "${BEARER_TOKEN}" }],
        },
      },
    ]);
    expect(none.auth).toEqual({ type: "none" });
    expect(bearer.auth.type).toBe("bearer");
    if (bearer.auth.type === "bearer") expect(bearer.auth.personas[0].token).toBe("static-token");
  });

  it("applies ${VAR:-fallback} defaults and coerces allowSelfSigned strings", () => {
    const [p] = parse([
      oauthProfile({ name: "${MISSING_NAME:-Fallback name}", allowSelfSigned: "${MISSING_FLAG:-1}" }),
    ]);
    expect(p.name).toBe("Fallback name");
    expect(p.allowSelfSigned).toBe(true);
  });

  it("errors on a missing env var, naming the profile and field", () => {
    expect(() => parse([oauthProfile()], { ...ENV, MCP_URL: undefined })).toThrow(
      /profile "dkan" transport\.url: missing env var MCP_URL/,
    );
  });

  it("rejects literal secrets and :- defaults on secret fields", () => {
    const literal = oauthProfile();
    (literal.auth as { personas: Array<{ clientSecret: string }> }).personas[0].clientSecret = "hunter2";
    expect(() => parse([literal])).toThrow(/clientSecret: must be a pure \$\{ENV_VAR\} reference/);

    const withDefault = oauthProfile();
    (withDefault.auth as { personas: Array<{ clientSecret: string }> }).personas[0].clientSecret =
      "${RO_SECRET:-oops}";
    expect(() => parse([withDefault])).toThrow(/clientSecret: must be a pure \$\{ENV_VAR\} reference/);
  });

  it("rejects duplicate profile ids", () => {
    expect(() => parse([oauthProfile(), oauthProfile()])).toThrow(/duplicate profile id "dkan"/);
  });

  it("rejects duplicate persona keys within a profile, allows them across profiles", () => {
    const dup = oauthProfile();
    (dup.auth as { personas: unknown[] }).personas = [
      { key: "a", label: "A", clientId: "x", clientSecret: "${RO_SECRET}", scope: "read" },
      { key: "a", label: "B", clientId: "y", clientSecret: "${ED_SECRET}", scope: "write" },
    ];
    expect(() => parse([dup])).toThrow(/duplicate persona key "a" in profile "dkan"/);

    const across = [
      oauthProfile(),
      { ...oauthProfile(), id: "other" }, // same persona key "read-only" — fine
    ];
    expect(parse(across)).toHaveLength(2);
  });
});

describe("publicProfiles", () => {
  it("never leaks secrets, tokens, or the token endpoint", () => {
    const resolved: ResolvedProfile[] = parse([
      oauthProfile(),
      {
        id: "tokened",
        name: "Tokened",
        transport: { kind: "streamable-http", url: "${MCP_URL}" },
        auth: { type: "bearer", personas: [{ key: "svc", label: "Service", token: "${BEARER_TOKEN}" }] },
      },
    ]);
    const json = JSON.stringify(publicProfiles(resolved));
    expect(json).not.toContain("s3cret-ro");
    expect(json).not.toContain("static-token");
    expect(json).not.toContain("clientSecret");
    expect(json).not.toContain("tokenUrl");
    expect(json).not.toContain(ENV.TOKEN_URL);
  });

  it("gives a no-auth profile the implicit default persona", () => {
    const [pub] = publicProfiles(
      parse([{ id: "open", name: "Open", transport: { kind: "streamable-http", url: "${MCP_URL}" }, auth: { type: "none" } }]),
    );
    expect(pub.personas).toEqual([{ key: "default", label: "Default" }]);
    expect(pub.authType).toBe("none");
  });
});
