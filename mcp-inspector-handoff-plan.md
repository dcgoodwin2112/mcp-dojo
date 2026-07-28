# MCP Dojo (formerly MCP Inspector) — Project Plan (revised)

**Purpose:** Demo client for "MCP from Concept to Demo: An Open Data Example with DKAN"
(Drupal AI Learners Club, Aug 21, 2026). Teaches MCP's three primitives — tools,
resources, prompts — by making the _control_ distinction visible: tools are
model-controlled, prompts are user-controlled, resources are application-controlled.

**Strategic constraint:** The client must be **server-agnostic**. It connects to any
MCP endpoint via a named connection profile. First target is `dkan_mcp_server`;
next target is a CKAN MCP server (cross-platform interop proof of concept).
No DKAN-specific logic in the client core — DKAN specifics live in connection
profiles and demo content only.

**Deadline reality:** Demo is on Zoom. Replay mode is the failure-proofing for the
live demo, so it is built immediately after the event log store — before any
network code. See milestones.

---

## Architecture

- **Stack:** Next.js / React / TypeScript, MCP TypeScript SDK
  (`@modelcontextprotocol/sdk`), streamable HTTP transport.
- **Core principle:** The append-only **event log is the single source of truth.**
  Timeline, replay, raw-frame drawer, context visualizer, and capability diff are
  all pure renderings of the log. Live mode and replay mode use the same renderer.
- **Server-side proxy (decided):** All MCP traffic and all Anthropic API calls go
  through Next.js server routes. The browser never holds the Anthropic key or an
  OAuth token, and Drupal CORS config becomes unnecessary. (The module does ship
  CORS compiler passes for browser-direct clients — not needed with the proxy.)
- **Agent loop:** Anthropic API directly (no provider-agnostic wrapper — post-demo
  concern). Manual mode calls MCP tools directly with no model involved.
- **Auth (decided):** OAuth 2.1 **`client_credentials`** with two preconfigured
  consumers (read-scope / write-scope) — the module's documented recipe, and no
  live credential typing on Zoom. Authorization-code + PKCE (also supported by the
  server) is P1, for the OAuth stepper visualization only.
- **Redaction at write time:** an allowlist-based redactor runs before any
  event is appended: Authorization headers, client secrets, token-endpoint
  responses, cookies, harvest source URLs/headers; large resource/tool payloads
  capped. Tokens are not the only secret — DKAN metadata can carry non-public
  operational detail. A recorded session must be safe to share and replay as-is.

---

## Verified facts about `dkan_mcp_server` (was: open questions)

Verified against module source and docs (`ToolAccessSubscriber.php`, README,
`docs/ARCHITECTURE.md`, `docs/OAUTH_PLAN.md`).

1. **Permission denial is NOT an `isError` tool result.** `ToolAccessSubscriber`
   does both: it **hides** unauthorized tools from `tools/list` AND denies
   `tools/call` by throwing, which surfaces as **HTTP 403 with a JSON-RPC error
   body** (`-32002` "forbidden", `WWW-Authenticate: Bearer error="insufficient_scope"`;
   anonymous → 401/`-32001`). The error never enters the model loop as a tool
   result. Read token sees **25 tools**; write token sees **38**. This reshapes
   demo beat 7 — see below.
2. **All three primitives exist.**
   - Tools: 38 (25 read gated by `access mcp server`; 13 write, each gated by a
     `* via mcp` permission).
   - Resources: concrete `dkan://catalog`, `dkan://schemas`; templated
     `dkan://dataset/{id}`, `dkan://distribution/{id}`,
     `dkan://dataset/{id}/dictionary`, `dkan://datastore/{resourceId}/schema`.
   - Prompts: 5 config entities — `explore_dataset`, `build_datastore_query`,
     `find_datasets`, `diagnose_harvest`, `dataset_health_check` — with
     `dataset_id` argument completion.
3. **Transport:** `POST /mcp` (streamable HTTP). **Responses are SSE** (`data:`
   lines) — the client wrapper must parse them. Sessions via `Mcp-Session-Id`
   header. Handshake footguns from the module docs: `clientInfo.version` must be
   a real non-empty string.
4. **OAuth:** `simple_oauth` ^6 + `simple_oauth_21` — Composer `suggest`, not
   `require`, so the demo site must install them explicitly. Grants
   `authorization_code` (PKCE S256) and `client_credentials` are both configured
   on scopes `dkan_mcp:read` (→ `access mcp server` permission) and
   `dkan_mcp:write` (→ `dkan_mcp_write` role). Scope-derived permissions feed the
   same gate that filters `tools/list` and denies calls, so the capability diff
   is driven end-to-end by Drupal permissions.
5. **Real tool names/schemas** (use these in demo script and sample logs):
   - `search_datasets`: `keyword` (required), `page`, `pageSize` (1–50, default 10)
   - `get_dataset`: `identifier` (UUID)
   - `query_datastore`: `resourceId` (required), `conditions`/`expressions` as
     JSON strings, `limit` (max 500, default 100)
   - `update_dataset` / `patch_dataset`: `identifier` + `metadata` as a **JSON
     object string**, not a structured object — manual-mode form generation must
     handle string-typed JSON args.
6. **Latency (still needs live measurement):** No documented wall-clock numbers.
   Caps: search ≤50/page, datastore ≤500 rows, listings ≤100/page. `get_catalog`
   is expensive cold but permanently cached — **pre-warm before the demo**. No
   in-module rate limiting. Measure real latency at milestone M1 and decide
   live-vs-replay default at the dry run.

---

## P0 — Must-have for Aug 21

- [x] **Connection profiles.** Named profiles (endpoint URL + auth config).
      Ship with "DKAN demo site". Server-agnostic by construction.
- [x] **Event log + replay.** Implement the schema below; record/replay from day
      one (keyboard stepping, adjustable speed, honors `annotation.pauseOnReplay`).
      Replay is a pure rendering of the log — no server, auth, or model needed,
      so it lands before any network code. Hand-authored sample log doubles as
      the renderer's test fixture.
- [x] **MCP handshake + capability panel.** On connect, run `initialize` and
      `tools/list` / `resources/list` / `resources/templates/list` /
      `prompts/list`. Render three color-coded columns (colors consistent across
      the whole UI). Per-item toggle to raw JSON schema. 38 tools is too many for
      one screen — curated demo subset with a "show all" toggle.
- [x] **Timeline + "who's driving?" badges.** Live turn-by-turn timeline: user
      message → model text → tool_use → JSON-RPC request → result → result
      re-entering the loop. Latency per hop. **Step button** pauses between hops.
      Every event badged by envelope `actor`: model / user / app / server. The
      single most important pedagogical feature.
- [x] **Manual mode (inspector).** Auto-generate a form from each tool's
      `inputSchema` (including string-typed JSON args); invoke directly, no
      model. Same event types as agent mode, different `actor` — the contrast IS
      the demo.
- [x] **Agent mode.** Chat panel; model receives the tool definitions and drives
      the loop via a Next.js server route (Anthropic key stays server-side). Run
      the same `search_datasets` tool that was just called manually.
- [x] **Persona switcher.** Header control with "Read-only" and "Editor"
      profiles backed by the two `client_credentials` consumers. Switching swaps
      the token and a colored session badge, opens a new MCP session, and
      re-runs `initialize` + the list calls into the same inspector log (the
      capability diff depends on this). No live credential typing on Zoom.
- [x] **Token lifecycle.** Access tokens live 300s — shorter than a demo
      segment. Mint on demand, re-mint before expiry with a safety margin, log
      redacted `auth.token.received` events. Rehearsed 2026-07-23 with a 60s
      lifetime: transparent mid-session re-mint, no errors.
- [x] **Capability diff by permission.** Compare `capabilities.listed` events
      across personas; render added/removed tools (25 vs 38). Shows the MCP
      surface is permission-dependent, driven by Drupal's own permission system.
      **This is the headline of the permissions story** (see beat 6–7).
- [x] **Denial beat (reworked).** Two-part, matching real server behavior:
      (a) agent mode as read-only — the model, never given `update_dataset`,
      explains it has no way to modify datasets (list-filtering made visible);
      (b) manual mode "forced call" of a hidden tool → HTTP 403 JSON-RPC error
      frame rendered raw. This beat includes a minimal raw view of that one
      `rpc.response` (expand-in-place on the error event); the full raw-frames
      drawer stays P1. Teaches defense in depth: hidden from list AND denied
      at call.
- [x] **Prompts + resources, minimal path.** The talk's thesis is all three
      primitives — a demo that only exercises tools undercuts it, so one path
      for each is P0: invoke `explore_dataset` via a plain argument form and
      show the expanded messages BEFORE sending (`prompt.expanded`); attach one
      templated resource (`dkan://dataset/{id}`) and render a
      `context.snapshot` of what the model receives. Rich UX (resource browser,
      slash commands, argument completion) stays P1.

## P1 — Stretch goals (high value if time allows)

- [x] **Prompt slash-command UX.** (Done 2026-07-23.) `/explore-dataset` with `dataset_id`
      argument completion, on top of the P0 expansion path.
- [x] **Resource browser.** (Done 2026-07-23.) Browse all concrete + templated resources and
      attach from the browser, on top of the P0 attach + context-snapshot path.
      Answers "why doesn't the model just fetch it?" — because the application
      attaches resources.
- [x] **Raw-frames drawer.** (Done 2026-07-23; toggle labeled "Raw frames".) Collapsible raw JSON-RPC frames (`rpc.*` events),
      paired request/response via `requestId`. Includes the `initialize`
      handshake — teach the protocol from real frames.
- [x] **Context inspector (added).** (Phase 1 done 2026-07-23.) Read-only drawer
      showing the exact next-call payload live from the agent loop: full system
      prompt (incl. attached resources), complete conversation array, tool
      definitions, ~token estimates. Phase 2 (edit system prompt, detach,
      tool toggles, clear history) done same day — every edit logged as context.updated / resource.detached events.
- [x] **Presentation mode.** (Done 2026-07-23.) Big fonts, high contrast, hidden chrome,
      annotations rendered as narration cards.
- [ ] **OAuth stepper visualization** (authorization-code + PKCE flow):
      authorize → redirect → code + PKCE exchange → token (redacted, with
      expiry). Requires adding an auth-code consumer; demo-optional.

## P2 — Post-demo / reuse

- [ ] **Second connection profile: CKAN** (okfn `mcp-ckan`). Same client, second
      platform — the interop flagship artifact.
- [ ] **Claude Desktop cameo assets.** Config snippet + 30-second segment
      showing the same server in an off-the-shelf host.
- [ ] **Session export/share.** Shareable replay files; maybe a hosted
      replay-only build for after the talk.
- [ ] **Annotation authoring UI.** Edit annotations on a recorded log
      (currently: hand-edit JSON is fine).
- [ ] **Provider-agnostic agent-loop wrapper.** Anthropic-direct is enough for
      the demo.

---

## Demo beats the features must support

1. Connect to DKAN site → capability panel (three primitives, three colors).
2. Manual mode: fire `search_datasets` by hand ("it's just a typed function
   over HTTP").
3. Agent mode: same tool, model's choice — watch the loop round-trip.
4. Invoke a prompt: user-controlled primitive, expansion shown pre-send.
5. Attach a resource; show context snapshot: app-controlled primitive.
6. Persona switch (read-only → editor): capability diff, 25 → 38 tools.
7. Denial, two angles: read-only agent can't even see write tools (model
   explains); manual forced call of a hidden tool → raw 403 JSON-RPC error frame.
8. Fallback at every step: replay of a recorded golden run.

---

## Demo-site provisioning checklist

- [x] DDEV demo site built with sample content (already provisioned).
- [x] simple_oauth 6.1.1 + simple_oauth_21 1.13.0 installed and enabled;
      `dkan_mcp:read` / `dkan_mcp:write` scopes confirmed installed.
- [x] Two consumers created (2026-07-22): `inspector-readonly` (read scope,
      user `inspector_ro`/`mcp_read` role) and `inspector-editor` (write scope,
      user `inspector_ed`/`dkan_mcp_write` role). client_credentials requires a
      default user on the consumer — effective perms are the user∩scope
      intersection. Secrets live in `.env.local` (gitignored) only.
- [x] `tools/list` verified: 25 (read token) vs 38 (editor token); the 13
      write tools are the hidden set.
- [x] Forced `update_dataset` call with read token → HTTP 403, `-32002`
      "forbidden", `WWW-Authenticate: Bearer error="insufficient_scope"`.
- [x] Token minting verified; `expires_in: 300` confirmed — pre-expiry re-mint
      in the wrapper is required, as planned. Shortened-lifetime rehearsal done
      2026-07-23 (60s lifetime): re-mint fired mid-session at the 30s margin,
      call succeeded, no user-visible interruption. Lifetime restored to 300s.
- [x] `get_catalog` pre-warmed: 272 ms cold → 48 ms warm.
- [x] Latency measured (local DDEV): initialize 238 ms, tools/list ~50 ms,
      search_datasets 185 ms, warm catalog 48 ms. Live agent mode is viable;
      re-measure over Zoom-day network before deciding per-beat defaults.
- [x] CORS: skipped — server-side proxy makes it unnecessary.

---

## Milestones (talk is Fri Aug 21)

| Date | Milestone |
|---|---|
| Fri Jul 31 | M1: Event log + replay + capability panel + manual mode working against the live demo site ("first demoable slice"). Latency measured. |
| Fri Aug 7 | M2: Agent mode + timeline/badges + personas + capability diff + denial beat + minimal prompts/resources — all P0 done. |
| Wed Aug 12 | Feature freeze. P1 items only if everything is green. |
| Fri Aug 14 | Golden sessions recorded and annotated for every demo beat. |
| Mon–Tue Aug 17–18 | Zoom dry run with replay fallback rehearsed. Decide live-vs-replay default per beat. |
| Fri Aug 21 | Talk. |

If M2 slips, pre-decided P0 cut order (no improvised triage in August):
resource attach + context snapshot (beat 5) first, then prompt expansion
(beat 4), then step control — each cut beat falls back to its golden replay.
Replay and golden recordings are never cut.

---

## Event Log Schema (v2 draft)

```typescript
/**
 * MCP Inspector — Event Log Schema
 *
 * Design principles:
 * 1. The log is the single source of truth. Timeline, replay, raw-frame
 *    drawer, and context visualizer are all pure renderings of this log.
 * 2. Append-only. Events are never mutated; corrections are new events.
 * 3. Two clocks: `t` (ms since session start) drives replay timing;
 *    `wall` (ISO string) is for display only. Replay speed control just
 *    multiplies deltas between `t` values.
 * 4. Semantic events and raw JSON-RPC frames are separate event types,
 *    linked by `requestId`. The timeline renders semantic events; the
 *    raw-frames drawer renders rpc.* events.
 * 5. Redaction happens at WRITE time, never at render time. A recorded
 *    session must be safe to share/replay as-is.
 */

// ---------------------------------------------------------------------------
// Envelope — shared by every event
// ---------------------------------------------------------------------------

type Actor = "user" | "model" | "app" | "server";

interface EventBase {
  id: string; // ulid — sortable, unique
  seq: number; // gapless monotonic counter, authoritative ordering
  t: number; // ms since session.started (replay clock)
  wall: string; // ISO 8601 wall time (display only)
  // INSPECTOR session, not the MCP Mcp-Session-Id. One log spans persona
  // switches — the capability diff compares capabilities.listed events
  // across personas within a single log.
  sessionId: string;
  actor: Actor; // who initiated this — drives the "who's driving?" badge
}

// The primitive tag drives color-coding everywhere in the UI.
type Primitive = "tool" | "resource" | "prompt";

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

interface SessionStarted extends EventBase {
  type: "session.started";
  profile: string; // named connection profile, e.g. "DKAN demo"
  serverUrl: string;
  transport: "streamable-http" | "sse" | "stdio";
  mode: "live" | "replay";
}

interface McpInitialized extends EventBase {
  type: "mcp.initialized";
  requestId: string; // links to rpc.request/rpc.response frames
  // Server-assigned Mcp-Session-Id. A persona switch opens a NEW MCP session:
  // re-run initialize + all list calls, emitting a fresh mcp.initialized and
  // capabilities.listed set into the same inspector log.
  mcpSessionId?: string;
  serverInfo: { name: string; version: string };
  // MCP capabilities are OBJECT-shaped (e.g. { tools: { listChanged: true } }),
  // not booleans. Store the server's object verbatim; render presence/absence.
  capabilities: {
    tools?: Record<string, unknown>;
    resources?: Record<string, unknown>;
    prompts?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

interface SessionEnded extends EventBase {
  type: "session.ended";
  reason: "user" | "error" | "disconnect";
}

// ---------------------------------------------------------------------------
// Auth / personas
// ---------------------------------------------------------------------------

interface PersonaSelected extends EventBase {
  type: "auth.persona.selected";
  persona: string; // 'read-only' | 'editor' (free-form for reuse)
  label: string; // display name shown in session badge
}

interface OAuthStep extends EventBase {
  type: "auth.oauth.step";
  // client_credentials uses only 'token_request'; the P1 auth-code stepper
  // uses the full sequence.
  step: "token_request" | "authorize" | "redirect" | "code_exchange" | "refresh";
  detail?: string; // human-readable note for the stepper UI
}

interface TokenReceived extends EventBase {
  type: "auth.token.received";
  scopes: string[]; // e.g. ['dkan_mcp:read']
  expiresAt: string; // ISO — default lifetime is 300s; expect refreshes
  tokenPreview: "REDACTED"; // literal — enforced at write time
}

// ---------------------------------------------------------------------------
// Discovery — powers the capability panel and the permission diff
// ---------------------------------------------------------------------------

interface CapabilitiesListed extends EventBase {
  type: "capabilities.listed";
  primitive: Primitive;
  requestId: string;
  persona: string; // which persona this list was fetched under —
  // the capability diff is computed by comparing
  // two of these events across personas
  items: Array<{
    name: string; // tool name / resource uri / prompt name
    title?: string;
    description?: string;
    schema?: unknown; // inputSchema for tools, args for prompts
    // resources/templates/list is a separate MCP call; most of this server's
    // resources are templated (dkan://dataset/{id} etc.)
    isTemplate?: boolean; // resource templates vs concrete resources
    uriTemplate?: string; // RFC 6570 template when isTemplate
  }>;
}

// ---------------------------------------------------------------------------
// Agent loop
// ---------------------------------------------------------------------------

interface TurnStarted extends EventBase {
  type: "turn.started";
  turnId: string;
  trigger: "user_message" | "tool_result" | "prompt_invocation";
}

/** The user's chat input. Without this, replay cannot show what was asked. */
interface UserMessage extends EventBase {
  type: "user.message";
  turnId: string;
  text: string;
}

interface ModelText extends EventBase {
  type: "model.text";
  turnId: string;
  text: string;
}

/** A tool call, whether the MODEL chose it (agent mode) or the USER fired it
 *  from the auto-generated form (manual/inspector mode). Same event type,
 *  different actor — that contrast IS the demo. */
interface ToolCallRequested extends EventBase {
  type: "tool.call.requested";
  primitive: "tool";
  turnId?: string; // absent in manual mode
  requestId: string;
  toolName: string;
  args: Record<string, unknown>;
}

/** Emitted only when the server returns a tool RESULT. A permission denial on
 *  this server is NOT a result — it is an HTTP 403 JSON-RPC error, logged as
 *  an ErrorEvent + rpc.response instead. isError covers in-band tool errors
 *  (bad args, DKAN API failures). */
interface ToolCallCompleted extends EventBase {
  type: "tool.call.completed";
  primitive: "tool";
  requestId: string;
  toolName: string; // denormalized for rendering without a requestId join
  turnId?: string;
  latencyMs: number;
  isError: boolean;
  result: unknown; // MCP content blocks (already redacted)
}

/** A resources/read round-trip. Content included so replay can show what was
 *  fetched. */
interface ResourceRead extends EventBase {
  type: "resource.read";
  primitive: "resource";
  requestId: string;
  uri: string;
  latencyMs: number;
  contents: Array<{ uri: string; mimeType?: string; text?: string }>;
}

interface ResourceAttached extends EventBase {
  type: "resource.attached";
  primitive: "resource";
  uri: string; // e.g. dkan://dataset/abc-123
  name: string;
  mimeType?: string;
  // actor will be 'user' or 'app' — never 'model'. Schema encodes the lesson.
}

interface PromptInvoked extends EventBase {
  type: "prompt.invoked";
  primitive: "prompt";
  promptName: string; // e.g. 'explore_dataset'
  args: Record<string, unknown>;
}

interface PromptExpanded extends EventBase {
  type: "prompt.expanded";
  primitive: "prompt";
  promptName: string;
  // Flattened for display — MCP prompts/get returns content BLOCKS (objects);
  // the client stringifies them at write time.
  messages: Array<{ role: string; content: string }>; // shown BEFORE send
}

/** Snapshot of what the model actually receives — powers the context
 *  visualizer. Emitted at the start of each model call. */
interface ContextSnapshot extends EventBase {
  type: "context.snapshot";
  turnId: string;
  blocks: Array<
    | { kind: "system"; summary: string }
    | { kind: "message"; role: string; summary: string }
    | { kind: "tool_definitions"; count: number; names: string[] }
    | { kind: "attached_resource"; uri: string; name: string }
  >;
}

// ---------------------------------------------------------------------------
// Raw JSON-RPC frames — raw-frames drawer only
// ---------------------------------------------------------------------------

interface RpcFrame extends EventBase {
  type: "rpc.request" | "rpc.response" | "rpc.notification";
  requestId?: string; // pairs request with response
  method?: string; // 'tools/call', 'resources/read', ...
  raw: unknown; // full frame, redacted at write time
  // rpc.response only — the drawer shows the real HTTP exchange. Always
  // emitted, including for JSON-RPC error bodies (a 403 denial produces an
  // rpc.response AND a derived ErrorEvent).
  http?: {
    status: number;
    headers: Record<string, string>; // allowlisted + redacted
    sse: boolean; // body arrived as SSE data: lines
  };
}

// ---------------------------------------------------------------------------
// Errors & presenter annotations
// ---------------------------------------------------------------------------

/** Derived semantic event for the timeline — the raw exchange is always also
 *  logged as an rpc.response with http metadata. Includes permission denials:
 *  this server answers a denied tools/call with HTTP 403 and JSON-RPC error
 *  -32002 "forbidden" (401/-32001 anonymous), never an isError tool result. */
interface ErrorEvent extends EventBase {
  type: "error";
  scope: "transport" | "auth" | "rpc" | "model" | "app";
  httpStatus?: number; // e.g. 403
  code?: string | number; // JSON-RPC error code, e.g. -32002
  message: string;
  requestId?: string;
}

/** Authored notes that surface during replay — lets you pre-script narration
 *  ("watch what happens when read-only tries to write..."). */
interface Annotation extends EventBase {
  type: "annotation";
  text: string;
  pauseOnReplay?: boolean; // auto-pause replay here for narration
}

// ---------------------------------------------------------------------------
// The log
// ---------------------------------------------------------------------------

type InspectorEvent =
  | SessionStarted
  | McpInitialized
  | SessionEnded
  | PersonaSelected
  | OAuthStep
  | TokenReceived
  | CapabilitiesListed
  | TurnStarted
  | UserMessage
  | ModelText
  | ToolCallRequested
  | ToolCallCompleted
  | ResourceRead
  | ResourceAttached
  | PromptInvoked
  | PromptExpanded
  | ContextSnapshot
  | RpcFrame
  | ErrorEvent
  | Annotation;

interface EventLog {
  version: 2;
  sessionId: string;
  recordedAt: string;
  events: InspectorEvent[]; // ordered by seq
}
```

### Sample excerpt — the denial teaching moment (matches real server behavior)

Excerpt only (`Partial<...>` for readability). The shipped fixture is authored
as full events — envelope fields populated and a `session.started` anchor at
`t: 0` — so it passes the zod validator it exists to exercise.

```typescript
export const sample: Partial<InspectorEvent>[] = [
  {
    seq: 41,
    t: 92_000,
    actor: "user",
    type: "annotation",
    text: "Read-only persona asks the agent to update a dataset title. update_dataset is not in its tools/list — watch the model's context.",
    pauseOnReplay: true,
  },

  {
    seq: 42,
    t: 93_100,
    actor: "user",
    type: "user.message",
    turnId: "turn-7",
    text: "Change the title of the Traffic Counts dataset to 'Traffic Counts 2026'.",
  },

  // No tool.call.requested: the model was never given a write tool.
  {
    seq: 43,
    t: 95_400,
    actor: "model",
    type: "model.text",
    turnId: "turn-7",
    text: "I don't have a tool that can modify datasets — this connection only exposes read tools like search_datasets and get_dataset…",
  },

  {
    seq: 44,
    t: 105_000,
    actor: "user",
    type: "annotation",
    text: "Manual mode: force-call the hidden tool anyway. The server denies it at the protocol level — defense in depth.",
    pauseOnReplay: true,
  },

  {
    seq: 45,
    t: 106_200,
    actor: "user",
    type: "tool.call.requested",
    primitive: "tool",
    requestId: "req-19",
    toolName: "update_dataset",
    args: { identifier: "abc-123", metadata: '{"title":"Traffic Counts 2026"}' },
  },

  {
    seq: 46,
    t: 106_210,
    actor: "app",
    type: "rpc.request",
    requestId: "req-19",
    method: "tools/call",
    raw: {
      /* frame */
    },
  },

  {
    seq: 47,
    t: 106_690,
    actor: "server",
    type: "rpc.response",
    requestId: "req-19",
    http: {
      status: 403,
      headers: { "www-authenticate": 'Bearer error="insufficient_scope"' },
      sse: false,
    },
    raw: {
      jsonrpc: "2.0",
      error: { code: -32002, message: "forbidden" },
      id: "req-19",
    },
  },

  {
    seq: 48,
    t: 106_690,
    actor: "server",
    type: "error",
    scope: "rpc",
    httpStatus: 403,
    code: -32002,
    message: "forbidden",
    requestId: "req-19",
  },
];
```

---

## Build order

Resequenced so replay (the failure-proofing) lands before any network code, and
the core demo beats (manual + agent mode) land before persona-switching work.
Minimal token minting is part of the wrapper (step 3) because `/mcp` has no
anonymous mode. The provisioning checklist gates M1 — run it first.

1. Scaffold Next.js app; event log store + schema v2 with runtime validation
   (zod mirroring these types). Hand-author the sample log above.
2. **Replay + annotations.** Timeline renderer, keyboard stepping, speed
   control, `pauseOnReplay`. Driven entirely by the sample log — this is also
   the renderer's test fixture. _Done when: the sample denial sequence replays
   with narration pauses._
3. MCP client wrapper behind a Next.js server route, configured by a named
   **connection profile** (the P0 profiles item lands here): `client_credentials`
   token minting with pre-expiry re-mint (the `/mcp` route requires
   `access mcp server` — there is no anonymous mode), SSE response parsing,
   `Mcp-Session-Id` handling, semantic + rpc events emitted for every
   operation. _Done when: initialize + tools/list against the demo site lands
   in the log and renders on the existing timeline._
4. Capability panel + manual mode (single read token; no persona switching
   yet) — **first demoable slice.** _Done when: `search_datasets` fired from an
   auto-generated form renders as a live timeline, and the recording replays._
5. Agent mode via Anthropic server route + step control + badges. _Done when:
   demo beats 2–3 run live and as replay._
6. Personas (two `client_credentials` consumers) + capability diff + denial
   beat. _Done when: beats 6–7 run live and as replay._
7. Minimal prompts + resources: prompt expansion shown pre-send, resource
   attach + context snapshot. _Done when: beats 4–5 run live and as replay._
8. Golden recordings for every beat; annotate them. (Milestone Aug 14.)
9. P1 items in order: raw-frames drawer (done), slash-command UX + resource browser,
   presentation mode, OAuth stepper.
