import { EventLogSchema, type EventLog } from "../events";

/**
 * Golden fixture: the "denial teaching moment" against dkan_mcp_server as the
 * read-only persona. Doubles as the replay renderer's test fixture — it is
 * parsed through EventLogSchema at import, so loading it anywhere validates it.
 *
 * Matches real server behavior: update_dataset is hidden from tools/list for
 * the read scope, and a forced call returns HTTP 403 with JSON-RPC -32002 —
 * never an isError tool result.
 */

const SESSION_ID = "s-golden-denial";
const BASE_WALL = Date.parse("2026-07-22T15:00:00.000Z");

let seq = 0;
function ev<T extends object>(t: number, actor: "user" | "model" | "app" | "server", body: T) {
  seq += 1;
  return {
    id: `evt-${String(seq).padStart(3, "0")}`,
    seq,
    t,
    wall: new Date(BASE_WALL + t).toISOString(),
    sessionId: SESSION_ID,
    actor,
    ...body,
  };
}

const READ_TOOLS = [
  "search_datasets",
  "list_datasets",
  "get_dataset",
  "get_distribution",
  "query_datastore",
  "sample_rows",
  "get_catalog",
  "get_site_status",
];

export const denialSession: EventLog = EventLogSchema.parse({
  version: 2,
  sessionId: SESSION_ID,
  recordedAt: new Date(BASE_WALL).toISOString(),
  events: [
    ev(0, "app", {
      type: "session.started",
      profile: "DKAN demo site",
      serverUrl: "https://dkan.ddev.site/mcp",
      transport: "streamable-http",
      mode: "live",
    }),
    ev(400, "user", {
      type: "auth.persona.selected",
      persona: "read-only",
      label: "Read-only",
    }),
    ev(900, "app", {
      type: "auth.oauth.step",
      step: "token_request",
      detail: "client_credentials grant, scope dkan_mcp:read",
    }),
    ev(1400, "server", {
      type: "auth.token.received",
      scopes: ["dkan_mcp:read"],
      expiresAt: new Date(BASE_WALL + 1400 + 300_000).toISOString(),
      tokenPreview: "REDACTED",
    }),
    ev(1600, "app", {
      type: "rpc.request",
      requestId: "r-1",
      method: "initialize",
      raw: {
        jsonrpc: "2.0",
        id: "r-1",
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          clientInfo: { name: "mcp-dojo", version: "0.1.0" },
          capabilities: {},
        },
      },
    }),
    ev(2100, "server", {
      type: "rpc.response",
      requestId: "r-1",
      http: {
        status: 200,
        headers: { "mcp-session-id": "mcp-sess-4f21", "content-type": "text/event-stream" },
        sse: true,
      },
      raw: {
        jsonrpc: "2.0",
        id: "r-1",
        result: {
          protocolVersion: "2025-06-18",
          serverInfo: { name: "dkan_mcp_server", version: "1.0.0" },
          capabilities: { tools: { listChanged: false }, resources: {}, prompts: {} },
        },
      },
    }),
    ev(2150, "server", {
      type: "mcp.initialized",
      requestId: "r-1",
      mcpSessionId: "mcp-sess-4f21",
      serverInfo: { name: "dkan_mcp_server", version: "1.0.0" },
      capabilities: { tools: { listChanged: false }, resources: {}, prompts: {} },
    }),
    ev(2600, "app", {
      type: "capabilities.listed",
      primitive: "tool",
      requestId: "r-2",
      persona: "read-only",
      items: READ_TOOLS.map((name) => ({
        name,
        description:
          name === "search_datasets"
            ? "Full-text search over dataset metadata"
            : undefined,
        schema:
          name === "search_datasets"
            ? {
                type: "object",
                properties: {
                  keyword: { type: "string" },
                  page: { type: "integer", minimum: 1 },
                  pageSize: { type: "integer", minimum: 1, maximum: 50 },
                },
                required: ["keyword"],
              }
            : undefined,
      })),
    }),
    ev(2900, "app", {
      type: "capabilities.listed",
      primitive: "resource",
      requestId: "r-3",
      persona: "read-only",
      items: [
        { name: "dkan://catalog", description: "Full DCAT-US catalog" },
        {
          name: "dkan://dataset/{id}",
          isTemplate: true,
          uriTemplate: "dkan://dataset/{id}",
          description: "Single dataset, DCAT-US metadata",
        },
      ],
    }),
    ev(3100, "app", {
      type: "capabilities.listed",
      primitive: "prompt",
      requestId: "r-4",
      persona: "read-only",
      items: [
        { name: "explore_dataset", description: "Guided tour of one dataset" },
        { name: "find_datasets", description: "Help me find relevant data" },
      ],
    }),
    ev(6000, "user", {
      type: "annotation",
      text: "Agent mode, read-only persona. First, a normal search — watch the loop round-trip: model → tool call → JSON-RPC → result → back into the loop.",
      pauseOnReplay: true,
    }),
    ev(8000, "user", {
      type: "turn.started",
      turnId: "turn-1",
      trigger: "user_message",
    }),
    ev(8000, "user", {
      type: "user.message",
      turnId: "turn-1",
      text: "Find datasets about traffic counts.",
    }),
    ev(8200, "app", {
      type: "context.snapshot",
      turnId: "turn-1",
      blocks: [
        { kind: "system", summary: "You are a DKAN open-data assistant…" },
        { kind: "message", role: "user", summary: "Find datasets about traffic counts." },
        { kind: "tool_definitions", count: READ_TOOLS.length, names: READ_TOOLS },
      ],
    }),
    ev(9600, "model", {
      type: "tool.call.requested",
      primitive: "tool",
      turnId: "turn-1",
      requestId: "r-5",
      toolName: "search_datasets",
      args: { keyword: "traffic counts", pageSize: 5 },
    }),
    ev(9620, "app", {
      type: "rpc.request",
      requestId: "r-5",
      method: "tools/call",
      raw: {
        jsonrpc: "2.0",
        id: "r-5",
        method: "tools/call",
        params: { name: "search_datasets", arguments: { keyword: "traffic counts", pageSize: 5 } },
      },
    }),
    ev(10480, "server", {
      type: "rpc.response",
      requestId: "r-5",
      http: {
        status: 200,
        headers: { "content-type": "text/event-stream" },
        sse: true,
      },
      raw: {
        jsonrpc: "2.0",
        id: "r-5",
        result: { content: [{ type: "text", text: "{\"total\":3,\"results\":[…]}" }] },
      },
    }),
    ev(10490, "server", {
      type: "tool.call.completed",
      primitive: "tool",
      requestId: "r-5",
      toolName: "search_datasets",
      turnId: "turn-1",
      latencyMs: 860,
      isError: false,
      result: {
        total: 3,
        results: [
          { title: "Traffic Counts", identifier: "abc-123" },
          { title: "Intersection Traffic Volumes 2025", identifier: "def-456" },
          { title: "Bicycle & Pedestrian Counts", identifier: "ghi-789" },
        ],
      },
    }),
    ev(12300, "model", {
      type: "model.text",
      turnId: "turn-1",
      text: "I found 3 datasets matching “traffic counts”: Traffic Counts, Intersection Traffic Volumes 2025, and Bicycle & Pedestrian Counts. Want a summary of any of them?",
    }),
    ev(20000, "user", {
      type: "annotation",
      text: "Now the teaching moment: ask the read-only agent to CHANGE something. Note update_dataset was never in its tools/list — watch what the model says.",
      pauseOnReplay: true,
    }),
    ev(22000, "user", {
      type: "turn.started",
      turnId: "turn-2",
      trigger: "user_message",
    }),
    ev(22000, "user", {
      type: "user.message",
      turnId: "turn-2",
      text: "Change the title of the Traffic Counts dataset to 'Traffic Counts 2026'.",
    }),
    ev(22200, "app", {
      type: "context.snapshot",
      turnId: "turn-2",
      blocks: [
        { kind: "system", summary: "You are a DKAN open-data assistant…" },
        { kind: "message", role: "user", summary: "Change the title of the Traffic Counts dataset…" },
        { kind: "tool_definitions", count: READ_TOOLS.length, names: READ_TOOLS },
      ],
    }),
    ev(24100, "model", {
      type: "model.text",
      turnId: "turn-2",
      text: "I don't have a tool that can modify datasets — this connection only exposes read tools like search_datasets and get_dataset. Switching to the Editor persona would expose the write tools.",
    }),
    ev(30000, "user", {
      type: "annotation",
      text: "Manual mode: force-call the hidden tool anyway. The server denies it at the protocol level — defense in depth.",
      pauseOnReplay: true,
    }),
    ev(32000, "user", {
      type: "tool.call.requested",
      primitive: "tool",
      requestId: "r-6",
      toolName: "update_dataset",
      args: { identifier: "abc-123", metadata: "{\"title\":\"Traffic Counts 2026\"}" },
    }),
    ev(32020, "app", {
      type: "rpc.request",
      requestId: "r-6",
      method: "tools/call",
      raw: {
        jsonrpc: "2.0",
        id: "r-6",
        method: "tools/call",
        params: {
          name: "update_dataset",
          arguments: { identifier: "abc-123", metadata: "{\"title\":\"Traffic Counts 2026\"}" },
        },
      },
    }),
    ev(32500, "server", {
      type: "rpc.response",
      requestId: "r-6",
      http: {
        status: 403,
        headers: { "www-authenticate": 'Bearer error="insufficient_scope"' },
        sse: false,
      },
      raw: {
        jsonrpc: "2.0",
        error: { code: -32002, message: "forbidden" },
        id: "r-6",
      },
    }),
    ev(32510, "server", {
      type: "error",
      scope: "rpc",
      httpStatus: 403,
      code: -32002,
      message: "forbidden",
      requestId: "r-6",
    }),
    ev(36000, "user", {
      type: "annotation",
      text: "Hidden from the list AND denied at call time — the read-only surface is enforced end-to-end by Drupal permissions.",
    }),
    ev(38000, "user", {
      type: "session.ended",
      reason: "user",
    }),
  ],
});
