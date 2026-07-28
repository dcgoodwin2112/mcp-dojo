# P2 — Honest streamable-HTTP

Goal: the proxy currently keeps only the LAST `data:` line of an SSE
response body — any server that streams notifications (progress, log
messages) interleaved with the response gets frames silently dropped — and
it never sends the `MCP-Protocol-Version` header the 2025-06-18 spec
requires after initialize. Fix both, and surface the wire frames the log
currently hides (server-sent notifications, the client's
`notifications/initialized`). Prerequisite for the Tasks/notifications
work (P5).

## Design

### Pure SSE parsing (`src/lib/sse.ts`, unit-tested)

- `parseMcpBody(body, contentType): unknown[]` — real SSE event framing:
  events split on blank lines, multiple `data:` lines within one event
  joined with `\n`, `event:` / `id:` / retry / comment lines ignored.
  Plain-JSON bodies return a single-frame array. Malformed payloads —
  SSE event data AND non-empty plain bodies that fail JSON.parse (today a
  thrown transport error that loses the raw body) — are preserved as
  `{ unparseable: "<raw text>" }` frames; nothing is silently dropped.
- `classifyFrames(frames, requestId)` → `{ response, ordered }` where
  `ordered` covers EVERY parsed frame in wire order, each tagged with its
  kind: `response` (the frame whose `id` equals the request id,
  String-coerced — JSON-RPC ids may be numbers), `notification` (method,
  no id), `server-request` (method and id), `orphan-response`
  (response-shaped, matching nothing), `unparseable` (the preserved
  `{ unparseable }` frames). One ordered list rather than per-kind
  buckets: wire order across kinds is part of what the frames drawer
  must show honestly (a progress notification that arrived before the
  response must appear before it), and full coverage means nothing the
  parser preserved can be dropped by classification. Fallback when no id
  matches: the last result/error frame is tagged `response` (today's
  behavior for conforming single-frame servers).

### Pure frame/header helpers (`src/lib/mcp-frames.ts`, unit-tested)

`buildFrame` moves out of the route and gains the `_meta.progressToken`
on tools/call; plus `buildForwardHeaders(auth?, mcpSessionId?,
protocolVersion?)` and `negotiatedVersion(initializeResponseFrame,
fallback)` (reads `result.protocolVersion`, falls back to the requested
version when absent or malformed). Route-level protocol plumbing becomes
unit-testable without mocking fetch.

### Proxy changes (`/api/mcp`)

- `forward()` returns `responseFrame` (for semantic handling) + the full
  `ordered` classified list (for frame logging).
- Request body gains `protocolVersion?: string`; when present, `forward()`
  sets `MCP-Protocol-Version` on the outbound POST. Ordering hole on
  initialize: the proxy sends `notifications/initialized` BEFORE the
  client ever sees the negotiated version — so the route itself derives
  the negotiated version from the initialize response frame
  (`negotiatedVersion()`) and uses it for the follow-up notification's
  header. Client-held state covers only post-initialize calls.
- The initialize op additionally returns `initializedFrame` — the raw
  client→server `notifications/initialized` frame the proxy sends, which
  today never reaches the log at all — and `negotiatedProtocolVersion`
  so the client stores the server's answer, not its own request.
- `tools/call` frames gain `_meta: { progressToken: <requestId> }` so
  servers that stream progress actually do (the reference everything
  server only emits progress notifications when a token is supplied;
  DKAN ignores the field — it is spec-standard).

### Client changes (`live.ts`)

- Stores `negotiatedProtocolVersion` from the proxy's initialize
  response (the server's answer, not the requested version); sends it
  with every subsequent call; reset on persona/profile re-init.
- Walks the `ordered` list in wire order, appending each entry as its
  true frame type (so the log's sequence matches the stream's):
  - `response` → the main `rpc.response` with http metadata (as today);
  - `notification` → `rpc.notification`, actor `"server"`, `method` from
    the frame;
  - `server-request` → `rpc.request`, actor `"server"`, the frame's own
    id;
  - `orphan-response` → `rpc.response`, actor `"server"`, the frame's
    own id, no http metadata;
  - `unparseable` → `rpc.notification`, actor `"server"`, no method,
    `raw` carrying the preserved `{ unparseable }` payload.
  Plus `initializedFrame` → `rpc.notification`, actor `"app"`, after the
  initialize exchange. (`rpc.notification` exists in the schema;
  FramesDrawer and EventCard already render it — nothing appends it
  yet.)

### Explicitly out of scope

- The standalone GET SSE channel (server-initiated stream) — P4/P5
  territory alongside the stateless spec.
- Semantic/timeline rendering of notifications (progress bars, log
  cards) — P5. In P2 they appear in the raw frames drawer only, which the
  timeline already hides by design.
- Event schema changes — none needed; `rpc.notification` is already in
  the v2 union, so fixtures and goldens are untouched.

## Phases

1. `src/lib/sse.ts` + tests: single-frame SSE, multi-event SSE
   (notification then response), multi-line `data:` joining, ignored
   field/comment lines, plain JSON, empty body, malformed payload
   preserved, id matching incl. numeric ids, no-match fallback,
   classification kinds (notification / server request / orphan
   response / unparseable), full coverage (every parsed frame appears in
   `ordered`), and wire-order preservation across kinds.
2. `src/lib/mcp-frames.ts` + tests: every op's frame shape,
   `_meta.progressToken` on tools/call, header construction with/without
   auth, session id, and protocol version, `negotiatedVersion()`
   including absent/malformed results.
3. Route: swap in the helpers; return the ordered classified list +
   `initializedFrame` + `negotiatedProtocolVersion`; use the
   route-derived negotiated version for the initialized notification's
   header.
4. `live.ts`: negotiated-version plumbing, ordered walk appending each
   frame as its true type.
5. Verify + docs: `npm test && npm run typecheck && npm run build`;
   browser against (a) DKAN — single-frame behavior identical, header
   accepted, `notifications/initialized` now visible in the frames
   drawer, golden beats unaffected; (b) the everything server —
   `longRunningOperation` tool call shows interleaved progress
   notifications in the frames drawer. Update AGENTS.md server facts.

## Risks

- **Servers rejecting the new header** — it is required by the pinned
  spec; verified live against DKAN in phase 4.
- **Frames-drawer pairing with interleaved notifications** — the drawer
  already has an `rpc.notification` branch; phase 4 verifies ordering
  visually.
- **`_meta.progressToken` breaking a strict server** — it is a reserved
  spec field on CallToolRequest params; DKAN (mcp/sdk) tolerates unknown
  `_meta`. Verified in phase 4.
