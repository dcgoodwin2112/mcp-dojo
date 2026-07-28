import { fetch as undiciFetch, type Dispatcher } from "undici";
import { getProfileById, type ResolvedProfile } from "@/lib/profiles";
import type { OauthPersona } from "@/lib/profile-config";
import { dispatchAuth } from "@/lib/proxy-auth";
import { dispatcherFor } from "@/lib/self-signed";

/**
 * Server-side MCP proxy. The browser sends {profileId, persona, op,
 * mcpSessionId?}; this route resolves the profile, applies its auth
 * strategy (none | bearer | oauth client_credentials with mint/cache),
 * forwards JSON-RPC to the profile's endpoint, parses SSE responses, and
 * returns raw frames + allowlisted HTTP metadata for the client-side event
 * log. Tokens and client secrets never reach the browser.
 *
 * Outbound calls go through undici's fetch so a self-signed profile's TLS
 * dispatcher applies per request — never process-global.
 *
 * Hand-rolled JSON-RPC instead of the MCP SDK client: the app's whole
 * point is showing raw frames and transport metadata, which the SDK
 * abstracts away.
 */

const TOKEN_EXPIRY_MARGIN_MS = 30_000;
const HEADER_ALLOWLIST = ["content-type", "mcp-session-id", "www-authenticate"];

type Op =
  | { kind: "initialize" }
  | { kind: "tools/list" | "resources/list" | "resources/templates/list" | "prompts/list" }
  | { kind: "tools/call"; name: string; args: Record<string, unknown> }
  | { kind: "resources/read"; uri: string }
  | { kind: "prompts/get"; name: string; args: Record<string, string> }
  | {
      kind: "completion/complete";
      ref: { type: "ref/prompt"; name: string } | { type: "ref/resource"; uri: string };
      argName: string;
      value: string;
    };

interface CachedToken {
  accessToken: string;
  expiresAtMs: number;
  scopes: string[];
  expiresAtIso: string;
}

const tokenCache = new Map<string, CachedToken>();

async function ensureToken(
  tokenUrl: string,
  persona: OauthPersona,
  cacheKey: string,
  dispatcher: Dispatcher | undefined,
): Promise<{ token: CachedToken; minted: boolean }> {
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAtMs - TOKEN_EXPIRY_MARGIN_MS > Date.now()) {
    return { token: cached, minted: false };
  }
  const resp = await undiciFetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: persona.clientId,
      client_secret: persona.clientSecret,
      scope: persona.scope,
    }),
    dispatcher,
  });
  if (!resp.ok) {
    throw new Error(`token mint failed: HTTP ${resp.status} ${await resp.text()}`);
  }
  const data = (await resp.json()) as { access_token: string; expires_in: number };
  const expiresAtMs = Date.now() + data.expires_in * 1000;
  const token: CachedToken = {
    accessToken: data.access_token,
    expiresAtMs,
    expiresAtIso: new Date(expiresAtMs).toISOString(),
    scopes: persona.scope.split(" "),
  };
  tokenCache.set(cacheKey, token);
  return { token, minted: true };
}

function buildFrame(op: Op, id: string, protocolVersion: string): Record<string, unknown> {
  switch (op.kind) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        id,
        method: "initialize",
        params: {
          protocolVersion,
          clientInfo: { name: "mcp-dojo", version: "0.1.0" },
          capabilities: {},
        },
      };
    case "tools/call":
      return {
        jsonrpc: "2.0",
        id,
        method: "tools/call",
        params: { name: op.name, arguments: op.args },
      };
    case "resources/read":
      return { jsonrpc: "2.0", id, method: "resources/read", params: { uri: op.uri } };
    case "prompts/get":
      return {
        jsonrpc: "2.0",
        id,
        method: "prompts/get",
        params: { name: op.name, arguments: op.args },
      };
    case "completion/complete":
      return {
        jsonrpc: "2.0",
        id,
        method: "completion/complete",
        params: {
          ref: op.ref,
          argument: { name: op.argName, value: op.value },
        },
      };
    default:
      return { jsonrpc: "2.0", id, method: op.kind, params: {} };
  }
}

function allowlistHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of HEADER_ALLOWLIST) {
    const v = headers.get(name);
    if (v !== null) out[name] = v;
  }
  return out;
}

/** MCP HTTP responses may be SSE (data: lines) or plain JSON. */
function parseFrame(body: string, contentType: string): unknown {
  if (contentType.includes("text/event-stream") || body.startsWith("event:") || body.startsWith("data:")) {
    let frame: unknown = null;
    for (const line of body.split("\n")) {
      if (line.startsWith("data:")) frame = JSON.parse(line.slice(5).trim());
    }
    return frame;
  }
  return body.trim() ? JSON.parse(body) : null;
}

async function forward(
  profile: ResolvedProfile,
  authorization: string | undefined,
  frame: Record<string, unknown>,
  mcpSessionId?: string,
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (authorization) headers.Authorization = authorization;
  if (mcpSessionId) headers["Mcp-Session-Id"] = mcpSessionId;
  const t0 = performance.now();
  const resp = await undiciFetch(profile.transport.url, {
    method: "POST",
    headers,
    body: JSON.stringify(frame),
    dispatcher: dispatcherFor(profile),
  });
  const body = await resp.text();
  const latencyMs = Math.round(performance.now() - t0);
  const respHeaders = new Headers(resp.headers as unknown as HeadersInit);
  const sse = (respHeaders.get("content-type") ?? "").includes("text/event-stream");
  return {
    httpStatus: resp.status,
    headers: allowlistHeaders(respHeaders),
    sse,
    responseFrame: parseFrame(body, respHeaders.get("content-type") ?? ""),
    latencyMs,
  };
}

export async function POST(request: Request) {
  const { profileId, persona: personaKey, op, mcpSessionId, requestId } = (await request.json()) as {
    profileId: string;
    persona: string;
    op: Op;
    mcpSessionId?: string;
    requestId?: string;
  };

  const profile = getProfileById(profileId);
  if (!profile) {
    return Response.json({ ok: false, transportError: `unknown profile: ${profileId}` }, { status: 400 });
  }
  const dispatch = dispatchAuth(profile, personaKey);
  if ("error" in dispatch) {
    return Response.json({ ok: false, transportError: dispatch.error }, { status: 400 });
  }

  try {
    let authorization: string | undefined;
    let tokenInfo: { minted: true; scopes: string[]; expiresAt: string } | undefined;
    if (dispatch.mode === "bearer") {
      authorization = dispatch.authorization;
    } else if (dispatch.mode === "oauth") {
      const { token, minted } = await ensureToken(
        dispatch.tokenUrl,
        dispatch.persona,
        dispatch.cacheKey,
        dispatcherFor(profile),
      );
      authorization = `Bearer ${token.accessToken}`;
      if (minted) tokenInfo = { minted: true, scopes: token.scopes, expiresAt: token.expiresAtIso };
    }

    const requestFrame = buildFrame(
      op,
      requestId ?? `r-${crypto.randomUUID().slice(0, 8)}`,
      profile.protocolVersion,
    );
    const result = await forward(profile, authorization, requestFrame, mcpSessionId);

    let newMcpSessionId: string | undefined;
    if (op.kind === "initialize") {
      newMcpSessionId = result.headers["mcp-session-id"];
      // Complete the handshake; fire-and-forget notification frame.
      await forward(
        profile,
        authorization,
        { jsonrpc: "2.0", method: "notifications/initialized" },
        newMcpSessionId,
      );
    }

    return Response.json({
      ok: result.httpStatus >= 200 && result.httpStatus < 300,
      ...result,
      requestFrame,
      mcpSessionId: newMcpSessionId,
      token: tokenInfo,
    });
  } catch (err) {
    return Response.json(
      { ok: false, transportError: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
