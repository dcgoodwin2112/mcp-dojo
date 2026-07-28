import { fetch as undiciFetch, type Dispatcher } from "undici";
import { getProfileById, type ResolvedProfile } from "@/lib/profiles";
import type { OauthPersona } from "@/lib/profile-config";
import { buildFrame, buildForwardHeaders, negotiatedVersion, type Op } from "@/lib/mcp-frames";
import { dispatchAuth } from "@/lib/proxy-auth";
import { dispatcherFor } from "@/lib/self-signed";
import { classifyFrames, parseMcpBody, type ClassifiedFrame } from "@/lib/sse";

/**
 * Server-side MCP proxy. The browser sends {profileId, persona, op,
 * mcpSessionId?, protocolVersion?}; this route resolves the profile,
 * applies its auth strategy (none | bearer | oauth client_credentials
 * with mint/cache), forwards JSON-RPC to the profile's endpoint, parses
 * the SSE-or-JSON body into EVERY frame it carries (classified, wire
 * order preserved), and returns raw frames + allowlisted HTTP metadata
 * for the client-side event log. Tokens and client secrets never reach
 * the browser.
 *
 * The negotiated MCP-Protocol-Version header: for calls after initialize
 * the CLIENT holds the negotiated version and supplies it per call; for
 * the notifications/initialized follow-up (sent before the client sees
 * the initialize result) the route derives it from the response frame.
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

function allowlistHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of HEADER_ALLOWLIST) {
    const v = headers.get(name);
    if (v !== null) out[name] = v;
  }
  return out;
}

async function forward(
  profile: ResolvedProfile,
  authorization: string | undefined,
  frame: Record<string, unknown>,
  mcpSessionId?: string,
  protocolVersion?: string,
): Promise<{
  httpStatus: number;
  headers: Record<string, string>;
  sse: boolean;
  responseFrame: unknown;
  ordered: ClassifiedFrame[];
  latencyMs: number;
}> {
  const t0 = performance.now();
  const resp = await undiciFetch(profile.transport.url, {
    method: "POST",
    headers: buildForwardHeaders(authorization, mcpSessionId, protocolVersion),
    body: JSON.stringify(frame),
    dispatcher: dispatcherFor(profile),
  });
  const body = await resp.text();
  const latencyMs = Math.round(performance.now() - t0);
  const respHeaders = new Headers(resp.headers as unknown as HeadersInit);
  const contentType = respHeaders.get("content-type") ?? "";
  const frames = parseMcpBody(body, contentType);
  const { response, ordered } = classifyFrames(frames, String(frame.id ?? ""));
  return {
    httpStatus: resp.status,
    headers: allowlistHeaders(respHeaders),
    sse: contentType.includes("text/event-stream"),
    responseFrame: response,
    ordered,
    latencyMs,
  };
}

export async function POST(request: Request) {
  const {
    profileId,
    persona: personaKey,
    op,
    mcpSessionId,
    requestId,
    protocolVersion,
  } = (await request.json()) as {
    profileId: string;
    persona: string;
    op: Op;
    mcpSessionId?: string;
    requestId?: string;
    protocolVersion?: string;
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
    // initialize carries the version in its body; later calls carry the
    // CLIENT-held negotiated version as a header.
    const result = await forward(
      profile,
      authorization,
      requestFrame,
      mcpSessionId,
      op.kind === "initialize" ? undefined : protocolVersion,
    );

    let newMcpSessionId: string | undefined;
    let initializedFrame: Record<string, unknown> | undefined;
    let negotiatedProtocolVersion: string | undefined;
    if (op.kind === "initialize") {
      newMcpSessionId = result.headers["mcp-session-id"];
      // The follow-up fires before the client sees the initialize result,
      // so the route derives the negotiated version itself.
      negotiatedProtocolVersion = negotiatedVersion(result.responseFrame, profile.protocolVersion);
      initializedFrame = { jsonrpc: "2.0", method: "notifications/initialized" };
      await forward(
        profile,
        authorization,
        initializedFrame,
        newMcpSessionId,
        negotiatedProtocolVersion,
      );
    }

    return Response.json({
      ok: result.httpStatus >= 200 && result.httpStatus < 300,
      ...result,
      requestFrame,
      mcpSessionId: newMcpSessionId,
      negotiatedProtocolVersion,
      initializedFrame,
      token: tokenInfo,
    });
  } catch (err) {
    return Response.json(
      { ok: false, transportError: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
