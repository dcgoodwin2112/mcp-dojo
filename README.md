# MCP Dojo

A practice space for the Model Context Protocol — connect to a server,
explore its tools, resources, and prompts hands-on, and watch every
exchange. Server-agnostic; teaches MCP's three primitives by making the
control distinction visible: tools are model-controlled, prompts are
user-controlled, resources are app-controlled. (Formerly named
"MCP Inspector"; renamed to avoid colliding with the official debugging
tool of that name.)

**Try it without installing: [mcpdojo.dev](https://mcpdojo.dev)** — the
hosted replay experience: bundled recordings plus any log you saved locally
with ↓ Save .json (↑ Open log… in the Replay tab). Live mode needs servers
you run yourself, so it's local-only.

Plan and architecture: [mcp-inspector-handoff-plan.md](mcp-inspector-handoff-plan.md).

## How it works

- The append-only **event log is the single source of truth** — timeline,
  replay, capability diff, and the raw-frames drawer are pure renderings of it.
  Live and replay share one renderer. Schema: `src/lib/events.ts` (zod).
- **Server-side proxy** (`/api/mcp`): mints OAuth `client_credentials` tokens
  per persona (re-mint before the 300s expiry), forwards JSON-RPC, parses SSE.
  Secrets and tokens never reach the browser; logs are redacted at write time.
- **Agent loop** (`src/lib/agent.ts`) runs client-side so every hop lands in
  the log; `/api/agent` only holds the Anthropic key.

## Setup

Replay mode needs no setup — run the dev server and pick a recording. Live
mode requires an MCP server. Connections are declared in
`profiles.config.json` (committed; secrets enter via `${ENV_VAR}`
references into `.env.local`). Each profile picks an auth strategy —
`none`, `bearer`, or `oauth-client-credentials` — with personas as
credential sets. The shipped profile targets a DKAN site with
`dkan_mcp_server` + the simple_oauth stack and two `client_credentials`
consumers (see the plan's provisioning checklist). Example of adding a
no-auth server:

```json
{
  "id": "everything",
  "name": "Reference server",
  "transport": { "kind": "streamable-http", "url": "http://localhost:3001/mcp" },
  "auth": { "type": "none" }
}
```

Local stdio servers work too (`auth` must be `none`; identity goes in
args, secrets in `secretEnv` as `${ENV_VAR}` refs). stdio is a local-dev
capability: sessions are child processes of the Next server, so it needs
a single long-lived Node process. Example — DKAN over drush:

```json
{
  "id": "dkan-stdio",
  "name": "DKAN (stdio)",
  "transport": {
    "kind": "stdio",
    "command": "ddev",
    "args": ["drush", "dkan-mcp-server:serve"],
    "cwd": "/path/to/dkan-site"
  },
  "auth": { "type": "none" }
}
```

```bash
npm install
cp .env.local.example .env.local   # fill in consumer secrets + Anthropic key
npm run dev
```

`.env.local` keys: `DKAN_MCP_URL`, `DKAN_OAUTH_TOKEN_URL`,
`DKAN_ALLOW_SELF_SIGNED`, `PERSONA_{READONLY,EDITOR}_CLIENT_{ID,SECRET}` +
`_SCOPE`, `ANTHROPIC_API_KEY`, optional `ANTHROPIC_MODEL`.

## Using it

- **Live**: pick a persona, Connect. The server's `initialize` instructions
  are shown on the handshake card and composed into the agent's system prompt
  (visible as a labeled section in `⊞ Context`). Click a tool in the left rail
  for a schema-generated form; click a resource to Preview (read without
  attaching) and Attach to context — template `{vars}` get value typeahead via
  MCP completion/complete (empty input lists all values). The chat bar drives agent mode ("pause before each model call"
  gates each step of the loop); model responses render as markdown. Prompts are slash
  commands in the chat bar: `/expl` → Tab completes, type args inline (value
  typeahead via MCP completion/complete, Tab accepts), first Enter expands &
  previews, second Enter sends (Esc cancels). Switching personas appends to
  the same log — that powers the capability diff. `▶ Replay recording` /
  `↓ Save .json` on the timeline.
- **Replay**: recording picker + play/step controls. The golden demo recording
  (`src/lib/fixtures/goldens/full-demo.json`) auto-pauses at narration cards.
- **`⇄ Diagram`**: renders the same log as a sequence diagram — swimlanes for
  user/model/app/server (matching the actor badges), request/response arrow
  pairs, errors in red. Available in live and replay.
- **`{ } Raw JSON-RPC`**: the wire-level exchanges paired by request id,
  hidden from the main timeline.
- **Learning aids**: a collapsible legend in the rail (primitives + who
  controls each, actor badges); every timeline card has an "ⓘ what is this?"
  note linking into the MCP spec (works in replay too); tool-result cards tab
  between text content, `structuredContent`, the tool's `outputSchema`, and
  the raw result. Failures are channel-labeled: in-band tool-result errors
  (amber chip — the model sees them), JSON-RPC errors (the app sees them),
  transport failures — the legend's "when things fail" section maps them.
- **`⊞ Context`**: the exact payload the next model call will send, read live
  from the agent loop — system prompt (attached data visually delimited),
  full conversation array, tool definitions, ~token estimates, and a
  context-growth meter (stacked bars per model call: flat tool-definition
  baseline, growing conversation). Editable:
  system instructions, per-resource detach, host-side tool toggles (hides
  tools from the model only), per-tool description rewriting ("descriptions
  are prompts" — re-ask a question and watch tool choice change), clear
  conversation. Every edit is logged (`context.updated` /
  `resource.detached` events).

Keyboard: `p` presentation mode (130% scale, hidden chrome), `Esc` exit,
`space` play/pause, `←/→` step, `Home`/`End` jump, `/` prompt commands.

Demo operations: [DEMO-RUNBOOK.md](DEMO-RUNBOOK.md).

## Scripts

```bash
npm test                                      # vitest unit tests (lib core)
npm run typecheck
npm run validate:fixture                      # zod-validate the authored fixture
npx tsx scripts/annotate-golden.ts <log.json> # recorded session → annotated golden
```
