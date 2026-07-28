import { getProfile, type PersonaConfig } from "@/lib/profiles";

/**
 * Server-side MCP proxy. The browser sends {persona, op, mcpSessionId?}; this
 * route mints/caches OAuth tokens (client_credentials, re-mint before the
 * 300s expiry), forwards JSON-RPC to the profile's /mcp endpoint, parses SSE
 * responses, and returns raw frames + allowlisted HTTP metadata for the
 * client-side event log. Tokens and client secrets never reach the browser.
 *
 * Hand-rolled JSON-RPC instead of the MCP SDK client: the inspector's whole
 * point is showing raw frames and transport metadata, which the SDK abstracts
 * away.
 */

const PROTOCOL_VERSION = "2025-06-18";
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
  persona: PersonaConfig,
): Promise<{ token: CachedToken; minted: boolean }> {
  const cached = tokenCache.get(persona.key);
  if (cached && cached.expiresAtMs - TOKEN_EXPIRY_MARGIN_MS > Date.now()) {
    return { token: cached, minted: false };
  }
  const resp = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: persona.clientId,
      client_secret: persona.clientSecret,
      scope: persona.scope,
    }),
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
  tokenCache.set(persona.key, token);
  return { token, minted: true };
}

function buildFrame(op: Op, id: string): Record<string, unknown> {
  switch (op.kind) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        id,
        method: "initialize",
        params: {
          protocolVersion: PROTOCOL_VERSION,
          clientInfo: { name: "mcp-lens", version: "0.1.0" },
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
  mcpUrl: string,
  accessToken: string,
  frame: Record<string, unknown>,
  mcpSessionId?: string,
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${accessToken}`,
  };
  if (mcpSessionId) headers["Mcp-Session-Id"] = mcpSessionId;
  const t0 = performance.now();
  const resp = await fetch(mcpUrl, { method: "POST", headers, body: JSON.stringify(frame) });
  const body = await resp.text();
  const latencyMs = Math.round(performance.now() - t0);
  const sse = (resp.headers.get("content-type") ?? "").includes("text/event-stream");
  return {
    httpStatus: resp.status,
    headers: allowlistHeaders(resp.headers),
    sse,
    responseFrame: parseFrame(body, resp.headers.get("content-type") ?? ""),
    latencyMs,
  };
}

export async function POST(request: Request) {
  const profile = getProfile();
  if (profile.allowSelfSigned) {
    // ddev's mkcert CA is trusted by the OS but not by Node's bundled store.
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }

  const { persona: personaKey, op, mcpSessionId, requestId } = (await request.json()) as {
    persona: string;
    op: Op;
    mcpSessionId?: string;
    requestId?: string;
  };
  const persona = profile.personas[personaKey];
  if (!persona) {
    return Response.json({ ok: false, transportError: `unknown persona: ${personaKey}` }, { status: 400 });
  }

  try {
    const { token, minted } = await ensureToken(profile.tokenUrl, persona);
    const requestFrame = buildFrame(op, requestId ?? `r-${crypto.randomUUID().slice(0, 8)}`);
    const result = await forward(profile.mcpUrl, token.accessToken, requestFrame, mcpSessionId);

    let newMcpSessionId: string | undefined;
    if (op.kind === "initialize") {
      newMcpSessionId = result.headers["mcp-session-id"];
      // Complete the handshake; fire-and-forget notification frame.
      await forward(
        profile.mcpUrl,
        token.accessToken,
        { jsonrpc: "2.0", method: "notifications/initialized" },
        newMcpSessionId,
      );
    }

    return Response.json({
      ok: result.httpStatus >= 200 && result.httpStatus < 300,
      ...result,
      requestFrame,
      mcpSessionId: newMcpSessionId,
      token: minted
        ? { minted: true, scopes: token.scopes, expiresAt: token.expiresAtIso }
        : undefined,
    });
  } catch (err) {
    return Response.json(
      { ok: false, transportError: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
