/**
 * JSON-RPC frame + HTTP header construction for the /api/mcp proxy —
 * pure, so the protocol plumbing is unit-testable without mocking fetch.
 */

export type Op =
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

export function buildFrame(op: Op, id: string, protocolVersion: string): Record<string, unknown> {
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
        params: {
          name: op.name,
          arguments: op.args,
          // Spec-standard: servers that stream progress only do so when a
          // token is supplied; servers without progress ignore it.
          _meta: { progressToken: id },
        },
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

export function buildForwardHeaders(
  authorization?: string,
  mcpSessionId?: string,
  protocolVersion?: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (authorization) headers.Authorization = authorization;
  if (mcpSessionId) headers["Mcp-Session-Id"] = mcpSessionId;
  // Required by the 2025-06-18 spec on every request after initialize.
  if (protocolVersion) headers["MCP-Protocol-Version"] = protocolVersion;
  return headers;
}

/** The version the server actually negotiated in its initialize result;
 *  falls back to the requested version when absent or malformed. */
export function negotiatedVersion(initializeResponseFrame: unknown, fallback: string): string {
  const result =
    initializeResponseFrame && typeof initializeResponseFrame === "object"
      ? (initializeResponseFrame as { result?: { protocolVersion?: unknown } }).result
      : undefined;
  const v = result?.protocolVersion;
  return typeof v === "string" && v.trim() !== "" ? v : fallback;
}
