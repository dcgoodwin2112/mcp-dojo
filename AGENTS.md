<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# MCP Dojo — agent guide

MCP teaching client (Next.js 16 / React 19 / TS / Tailwind v4): explore MCP
servers hands-on, every exchange logged and replayable.
Named "MCP Dojo" (formerly "MCP Inspector"); the local directory keeps the
old name. Domains: mcpdojo.dev (primary), mcpdojo.app.
User-facing docs: [README.md](README.md). Demo script: [DEMO-RUNBOOK.md](DEMO-RUNBOOK.md).
Feature backlog: [ROADMAP.md](ROADMAP.md).
History/decisions: [mcp-inspector-handoff-plan.md](mcp-inspector-handoff-plan.md).

## Invariants (do not break)

- **The event log is the single source of truth.** Timeline, replay, capability
  diff, drawers are pure renderings of `InspectorEvent[]`. New UI reads the
  log (or live objects the log reflects); it never keeps a parallel history.
- **Append-only, validated at write.** `EventLogStore.append()` assigns the
  envelope (id/seq/t/wall/sessionId/actor) and zod-parses every event.
- **Schema changes must be additive.** Fixtures in git
  (`src/lib/fixtures/**`) are `EventLogSchema.parse`d at import — a breaking
  change fails the build. New event types: extend the union in
  `src/lib/events.ts`, add an `EventCard` case.
- **Redaction at write time.** Tokens never enter the log (`REDACTED`
  literal). Resource text is capped in log events only — the model always
  receives full text (`readResource` in `src/lib/live.ts`).
- **Secrets stay server-side.** `.env.local` (gitignored) feeds
  `src/lib/profiles.ts`; the browser calls `/api/mcp` (OAuth + MCP proxy) and
  `/api/agent` (Anthropic key). Never return tokens/secrets from a route.
- **Live and replay share the `Timeline` renderer.** Rpc frames are hidden
  from the timeline and rendered by `FramesDrawer`; replay stepping skips
  hidden events via the `skip` param on `ReplayController.stepForward/Back`.

## Map

| Path | Role |
|---|---|
| `src/lib/events.ts` | zod event schema v2 (source of truth for types) |
| `src/lib/store.ts` | append-only live log store |
| `src/lib/replay.ts` | framework-free replay controller |
| `src/lib/live.ts` | LiveSession: proxy calls → events; tools/resources/prompts ops; tool toggles, detach |
| `src/lib/agent.ts` | client-side agent loop (step gating, editable systemBase, clearConversation) |
| `src/lib/profiles.ts` | server-only connection profiles from env |
| `src/app/api/mcp/route.ts` | OAuth mint/cache + JSON-RPC forward + SSE parse |
| `src/app/api/agent/route.ts` | one Anthropic call per request (loop is client-side) |
| `src/components/LiveView.tsx` | split layout, wiring, drawers |
| `src/components/ContextInspector.tsx` | live context view + edits |
| `src/lib/fixtures/` | authored sample + `goldens/full-demo.json`; registry in `index.ts` |
| `scripts/annotate-golden.ts` | recorded log → narration-annotated golden |

## Workflows

- **Verify**: `npm test && npm run typecheck && npm run build`;
  `npm run validate:fixture`. No eslint. Then exercise the feature in a real
  browser against the DDEV site (dev server: `npm run dev -- --port 3111`).
- **Unit tests** (vitest, `tests/`): cover the framework-free core — replay
  stepping/timing, store envelope+validation, log-schema invariants, slash
  parsing (`src/lib/slash.ts`), timeline grouping (`src/lib/timeline-rows.ts`),
  schema-form. Components stay untested; pull new logic into `src/lib/` and
  test it there.
- **Golden re-cut**: drive the beats live → `↓ Save .json` →
  `npx tsx scripts/annotate-golden.ts ~/Downloads/live-*.json` (beat matchers
  are content-based; update them if the beat structure changes).
- **Server facts** (verified against `dkan_mcp_server`): read token lists 25
  tools, write token 38; permission denial = HTTP 403 + JSON-RPC `-32002`
  (never an `isError` tool result); responses are SSE `data:` lines; session
  via `Mcp-Session-Id` header; access tokens live 300s (proxy re-mints at a
  30s margin); `initialize` returns an `instructions` string; completion
  covers prompt args and the dataset/dictionary resource templates
  (ref/resource on `{id}`, 13 UUIDs on empty input) — distribution and
  datastore-schema templates have no completers (empty result, not an error). DKAN site + consumers setup: plan's provisioning checklist.
- **Commits**: concise, no hype; push to `origin main`
  (github.com/dcgoodwin2112/mcp-dojo).
