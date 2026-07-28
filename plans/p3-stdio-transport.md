# P3 — stdio transport

Goal: connect to local MCP servers spoken over stdin/stdout —
`drush dkan-mcp-server:serve` and the whole local reference-server
ecosystem — through the same proxy, event log, and UI as streamable
HTTP. The event schema is already ready (`transport: "stdio"` is in the
enum); what's missing is a process transport.

## Design

### Config (`profile-config.ts`)

Transport becomes a real discriminated union:

```ts
transport:
  | { kind: "streamable-http"; url: string }
  | { kind: "stdio"; command: string; args?: string[]; cwd?: string;
      env?: Record<string, string>;        // non-secret values
      secretEnv?: Record<string, string> } // pure ${VAR} refs required
```

- Commands come from the config file ONLY — never from the browser; the
  proxy must never execute a browser-supplied string (the stdio analog
  of the no-UI-URLs SSRF rule).
- **Secret policy** (the config file is tracked in git):
  - Secrets flow through `secretEnv` ONLY: values must be pure
    `${ENV_VAR}` references — same rule and error as `clientSecret` —
    and merge into the child env at spawn. Argv is not a secret channel:
    args are visible to process listings and crash reports regardless
    of redaction.
  - `command`/`args`/`cwd`/`env` are non-secret by contract: they
    interpolate `${VAR}` but `:-` defaults are DISALLOWED in stdio
    fields, and the secret-name pattern
    (`/SECRET|TOKEN|PASSWORD|PASSWD|APIKEY|API_KEY|CREDENTIAL/i`) is
    rejected at load wherever it appears — interpolated variable
    names, `env` KEYS (`env: { API_KEY: … }` belongs in `secretEnv`),
    and literal arg option names (`--token=…`). Args may carry
    non-sensitive persona selectors (e.g. `--user=mcp_writer`),
    nothing more.
  - Tests: literal in `secretEnv` rejected, `${VAR:-x}` in args/env
    rejected, secret-like var name in args rejected, secret-like env
    key rejected, `--token=literal` arg rejected, and the public
    mapping stays basename-only.
- stdio profiles must use `auth: { type: "none" }` — identity is
  expressed as non-sensitive command args (e.g. `--user=mcp_writer`),
  enforced by `superRefine`; real secrets go through `secretEnv`.
  Persona-per-command is out of scope: a writer variant is simply a
  second profile with different args.
- `PublicProfile.transport` widens to `"streamable-http" | "stdio"`;
  `mcpUrl` (a display string) becomes `stdio: <basename(command)>` for
  stdio profiles. Args/env/command/cwd are non-secret by contract (see
  secret policy) but still deployment-specific local detail — the
  browser-facing string carries the command basename only, and a
  public-mapping test asserts no arg or env value survives into
  `PublicProfile`. LiveView renders it unchanged.

### Line framing (`src/lib/ndjson.ts`, pure, unit-tested)

MCP stdio frames are newline-delimited JSON. A tiny stateful-buffer
helper — `appendChunk(buffer, chunk) → { lines, rest }` — handles
partial lines across chunk boundaries and CRLF. Parsed lines feed `classifyFrames` from P2 in a new STRICT mode
(`{ fallback: false }`): only the exact id-matched frame becomes the
response — the last-result fallback exists for conforming single-frame
HTTP bodies and would misattribute a wrong-id frame arriving mid-flight
on a long-lived stream. Wrong-id result/error frames stay
`orphan-response`; no match by the deadline is a timeout transport
error. Unparseable lines are preserved as `{ unparseable }` frames; the
client renders the same ordered classified list either way.

### Process manager (`src/lib/stdio-manager.ts`, server-only)

- `initialize` op spawns the child with `shell: false` and a MINIMAL
  environment — children must NOT inherit the Next process env, which
  holds `.env.local` secrets (Anthropic key, OAuth client secrets) that
  a third-party `npx` server could read. Allowlist only what launching
  needs (`PATH`, `HOME`, `USER`, `SHELL`, `TMPDIR`, `LANG`, `LC_ALL`),
  overlaid with the profile's explicit `env` entries. A test asserts
  sensitive parent keys (e.g. `ANTHROPIC_API_KEY`, `PERSONA_*`) are
  absent from the child env unless explicitly configured. The manager
  mints a session id (uuid) and stores the session in a registry —
  RECORDING the creating `profileId` and persona key. Every non-close
  operation must present the matching `profileId`/persona or it is
  rejected with a transport error before anything is written to stdin:
  `profileId`, `persona`, and `mcpSessionId` are all browser-controlled,
  and without the binding a valid session id could be replayed under a
  different stdio profile, sending operations to a child spawned with
  another identity (e.g. a writer `--user` arg) while the log claims
  otherwise. Integration-tested: a session initialized under a writer
  profile rejects a call presented with a read-only profile id, with no
  child write. The session id rides the existing `mcpSessionId`
  plumbing. After the initialize response the
  manager writes the same `notifications/initialized` frame to the
  child's stdin (strict servers treat the handshake as incomplete
  without it) and returns it as `initializedFrame`, exactly like the
  HTTP path.
- **Reconnect cleanup contract**: the client currently clears
  `mcpSessionId` before re-initializing, so the route could never know
  which child to kill. The initialize request gains
  `closeMcpSessionId` — `live.ts` captures the old id before resetting
  and sends it; the ROUTE destroys that stdio session (if the registry
  knows it) immediately after parsing the request body — before profile
  lookup, auth validation, and transport dispatch — so cleanup happens
  even when the new initialize is itself rejected, and regardless of
  which transport the new profile uses (including stdio→HTTP switches).
  Unknown ids are a no-op (HTTP sessions have nothing to kill). Covered
  by tests for connect-again, persona re-init, stdio→HTTP reconnect,
  and cleanup-despite-rejected-initialize.
- **One reader, one queue per session**: a single stdout dispatcher
  owns the child's stream and appends every parsed frame to the
  session's frame queue; requests enter a per-session FIFO — a request
  writes its outbound frame only when it reaches the queue head, then
  collects frames until its id-matched response or a 30s timeout.
  Overlapping requests can never interleave writes, misattribute
  frames, or double-consume the queue. The FIFO itself is bounded: max
  8 pending requests per session (rejected beyond with a transport
  error), the 30s deadline runs from ENQUEUE time (a hung head request
  can't hold followers hostage indefinitely), and outbound frames are
  capped at 1 MB serialized.
- **Idle-frame ordering contract**: frames that arrived BEFORE a
  request is written must not be logged after it — the event log is the
  source of truth and would otherwise show a false sequence. When a
  request reaches the queue head, already-queued frames are drained
  into a separate `unsolicited` list (classified by shape only — no
  response fallback: `classifyUnsolicited()`), returned alongside
  `ordered`. `live.ts` appends unsolicited frames BEFORE its
  `rpc.request` event, then walks `ordered` as in P2.
  Integration-tested: idle notification queued before a request
  appears in the log ahead of it; two overlapping requests stay
  serialized with an interleaved notification.
- `latencyMs` measured write→response. No HTTP metadata: the proxy
  returns `httpStatus`/`headers`/`sse` as absent, and `live.ts` omits
  the `http` block on `rpc.response` (the schema already marks it
  optional).
- Hygiene: registry lives on `globalThis` (survives dev HMR module
  reloads — otherwise orphaned children leak); hard cap on concurrent
  processes (4) with a clear error beyond it; idle reaper kills
  sessions unused for 5 minutes; children killed on process exit
  (`exit` hook); **bounded buffers** — max partial-line length (1 MB)
  and a max of 500 frames per session across BOTH the idle queue and
  any in-flight request's collected `ordered` list (a child flooding
  valid notifications after a request is written hits the same cap) —
  overflow kills the session with a redacted transport error instead of
  growing memory unbounded (tested, incl. the flood-without-response
  case); stderr captured in a small ring buffer and included in
  transport-error messages (it is where stdio servers log — the 2026
  spec even deprecates protocol logging in its favor). **Redacted
  before it leaves the manager**: every resolved `secretEnv` value and
  every `${VAR}`-interpolated arg/env value is replaced with `REDACTED`
  in the stderr excerpt — a failing child may echo its command line or
  environment, and transport errors land in the browser-visible event
  log. Tested with a scripted child that prints a secret to stderr.

### Route (`/api/mcp`)

Branch on `profile.transport.kind`: HTTP path unchanged; stdio path
skips auth entirely (config guarantees `none`), calls the manager, and
returns the same response shape (`ok`, `responseFrame`, `ordered`,
`latencyMs`, `mcpSessionId` + `initializedFrame` on initialize, no http
fields). The client's `protocolVersion` param is ignored — headers are
an HTTP concept; the version negotiation still happens in the
initialize body. An unknown stdio session id (dead child, restarted
server process) returns a clear transport error telling the user to
reconnect.

**Deployment honesty**: stdio requires a long-lived single Node
process — it is a local-dev capability. The route already runs on the
Node runtime; multi-worker/serverless deployments would strand session
registries (documented in README/AGENTS; the hosted replay-only
deployment is unaffected since it has no live mode).

### Client

Nearly nothing: `live.ts` already derives `session.started.transport`
from the profile; the only change is omitting `http` on `rpc.response`
when the proxy sent no HTTP metadata. Frames drawer cards show no HTTP
chip for stdio exchanges — which is itself the lesson (same JSON-RPC,
different transport).

## Out of scope

- Persona-per-command for stdio (second profile covers it).
- Restarting crashed children mid-session — a crash surfaces as a
  transport error; the user reconnects.
- Windows support beyond what `spawn` gives for free.

## Phases

1. Config: stdio transport schema, auth-none restriction, secret
   policy (secretEnv pure refs, no `:-` defaults in stdio fields),
   public mapping (basename-only display) + tests (valid stdio profile,
   stdio+oauth rejected, literal secretEnv rejected, `:-` in args
   rejected, public shape leak test: no arg/env value in
   PublicProfile).
2. `ndjson.ts` + tests: partial chunks, multiple lines per chunk, CRLF,
   empty lines, unparseable lines preserved. `classifyFrames` strict
   mode + tests (wrong-id frame stays orphan under strict, fallback
   unchanged for HTTP).
3. `stdio-manager.ts` + integration tests driving a scripted `node -e`
   child: initialize → response + initialized notification written,
   notification before response lands in ordered list, idle
   notification drains as unsolicited (logged before the request), two
   overlapping requests stay serialized, timeout path, kill via
   `closeMcpSessionId` (incl. stdio→HTTP reconnect: cleanup runs before
   transport dispatch), unknown-session error, minimal child env
   (sensitive parent keys absent), stderr secret → `REDACTED` in the
   transport error.
4. Route branch + `live.ts` (`closeMcpSessionId` capture, unsolicited
   frames appended before `rpc.request`, http-optional) + docs (README
   stdio profile example incl. `ddev drush` + local-only note, AGENTS
   map/facts).
5. Verify live: (a) everything server over stdio
   (`npx @modelcontextprotocol/server-everything` — default transport
   is stdio) — lists, tool call, progress notifications; (b) DKAN via
   `ddev drush dkan-mcp-server:serve` (cwd `../`) — 25 anonymous
   read-only tools, golden-path manual call. `npm test && npm run
   typecheck && npm run build`.

## Risks

- **`ddev drush` stdio passthrough** — docker exec buffering could
  break framing; verified in phase 5, and the everything server is the
  independent fallback target.
- **Process leaks across dev HMR** — the `globalThis` registry + cap +
  reaper are specifically for this; the integration test asserts kill
  behavior.
- **Interactive/slow startup commands** — initialize waits on the same
  30s timeout; stderr ring buffer makes failures diagnosable.
