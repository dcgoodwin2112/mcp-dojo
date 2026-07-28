# Hosted replay-only deployment — mcpdojo.dev

Public entry point for MCP Dojo: the replay experience (bundled recordings +
open-your-own log) as a pure static site. No server, no secrets, no API keys —
by construction, not by configuration.

## Decisions (settled with the user)

- **Hosting**: Next `output: "export"` static build on Netlify (user's
  existing platform; see Phase 5).
- **Live mode**: tab stays visible; selecting it shows a "run locally" card
  (Live inspects *your* servers → clone + `npm run dev`), turning the
  limitation into the conversion path to the repo.
- **Log import**: yes — open a saved `.json` log (from Live's ↓ Save) in
  Replay, client-side, schema-validated.
- **Domains**: mcpdojo.dev canonical; mcpdojo.app 301-redirects to it.

## Why static export requires excluding the API routes

Static export supports only GET route handlers, and even GET handlers execute
at build time (`node_modules/next/dist/docs/01-app/02-guides/static-exports.md`).
`/api/mcp` and `/api/agent` are POST (build failure); `/api/profile` is GET but
calls `getPublicProfiles()`, which throws on missing env vars at build. All of
`src/app/api` must therefore be absent from the static build.

Hosting the full server instead was rejected: `/api/agent` would be an
unauthenticated proxy to the Anthropic key, `/api/mcp` would need a publicly
reachable MCP server plus server-side OAuth credentials, and the stdio manager
is single-Node by design.

## Phase 1 — replay-only build mode

- `next.config.ts`: when `process.env.NEXT_PUBLIC_REPLAY_ONLY === "1"`, set
  `output: "export"` and `pageExtensions: ["tsx"]`. Every page/layout is
  `.tsx`; the three route handlers are `.ts`, so they fall out of the build.
  Normal builds are untouched (default pageExtensions, server output).
- `package.json`: `"build:static": "NEXT_PUBLIC_REPLAY_ONLY=1 next build &&
  tsx scripts/check-static-out.ts"` (emits `out/`). `out/` added to
  `.gitignore`.
- `scripts/check-static-out.ts`: repeatable guard, not manual inspection —
  fails the build if `out/api` (or any `api/*` artifact) exists, or if
  `out/index.html` / `out/icon.svg` are missing. Catches a future Next
  behavior change or a route renamed to `.tsx` silently reintroducing API
  output.
- **Feasibility verified** (trial build, Next 16.2.11, 2026-07-28): with the
  flag, the build emits exactly `/`, `/_not-found`, `/icon.svg` — no `out/api`,
  icon metadata route intact, `404.html` present. The undocumented
  `pageExtensions`/`route.ts` interaction is the residual risk the guard
  script exists for; fallback if it ever breaks: build from a copy of the
  tree with `src/app/api` removed (never mutate the working tree in place).
  Note the constraint it imposes: future route handlers must stay `.ts`, and
  future dynamic metadata files (`robots.ts`, `sitemap.ts`) would need to be
  `.tsx` or static files — recorded in AGENTS.md (Phase 4).

## Phase 2 — UI gating (flag inlined client-side)

- `src/lib/replay-only.ts`:
  `export const REPLAY_ONLY = process.env.NEXT_PUBLIC_REPLAY_ONLY === "1"` —
  inlined at build, single import site for the flag.
- `src/app/page.tsx`: when the flag is set, initial mode is `"replay"`; the
  Live/Replay toggle remains; choosing Live renders `RunLocallyCard` instead
  of mounting `LiveView` (so no `/api/profile` fetch ever fires).
- `src/components/RunLocallyCard.tsx`: static card — one line on what Live
  mode is, `git clone https://github.com/dcgoodwin2112/mcp-dojo && npm install
  && npm run dev`, link to the repo README. Matches existing panel styling.
- Presentation mode (`p`) and everything else unchanged; local dev (no flag)
  is byte-identical behavior.

## Phase 3 — open a saved log in Replay (not flag-gated; ships everywhere)

- `src/lib/log-import.ts`: `parseEventLogJson(text: string)` →
  `{ ok: true, log } | { ok: false, error }` — `JSON.parse` +
  `EventLogSchema.parse`, mapping zod issues to a short readable message
  (first few issue paths, not the full dump). Bounds, enforced before the
  expensive work so a hostile/huge file can't freeze the tab: reject files
  over `MAX_LOG_BYTES` (10 MB — the golden is 540 KB) *before* reading, and
  reject parsed logs over `MAX_LOG_EVENTS` (10 000) with the same readable
  error path.
- `src/components/ReplayView.tsx`: "Open log…" button (hidden file input,
  `.json`) plus drag-and-drop onto the replay area. The size cap is checked
  on the `File` object before `FileReader` runs. A successfully parsed log
  becomes a session-only entry in the recording `<select>` (label from
  filename) and is selected; a failed parse shows an inline dismissible error.
  No persistence, no new history — an opened log is just another `EventLog`
  handed to the same replay pipeline (invariant: UI renders the log, nothing
  else).
- **Tests** (vitest, `tests/log-import.test.ts`): valid log round-trips
  (serialize the denial fixture), malformed JSON, schema-violating log
  (readable error, names the offending path), empty file, oversize byte
  count, over-limit event count.

## Phase 4 — hosted polish

- `src/app/layout.tsx`: `metadataBase: new URL("https://mcpdojo.dev")`,
  OpenGraph/Twitter card metadata from the existing title/description.
- `src/app/not-found.tsx`: minimal branded 404 (logo + link home) so the
  public site doesn't serve Next's default; it's `.tsx`, so it survives the
  pageExtensions filter (verify it lands in `out/404.html`).
- `public/robots.txt`: static allow-all (single-page site; no sitemap needed).
  Also delete the leftover create-next-app template SVGs from `public/`
  (`next.svg`, `vercel.svg`, `file.svg`, `globe.svg`, `window.svg`) — they
  currently ship in the export.
- `README.md`: add the hosted URL up top ("try it without installing");
  note that ↓ Save .json files replay on mcpdojo.dev.
- `AGENTS.md`: map row for `replay-only.ts`/`log-import.ts`, workflow note
  for `build:static` and the flag, and the constraint that route handlers
  stay `.ts` / dynamic metadata files can't be `.ts` (pageExtensions filter).

## Phase 5 — deploy + domains

- **Netlify, Git integration** (user's existing platform): connect the
  `dcgoodwin2112/mcp-dojo` repo. Every push to main auto-deploys; PRs get
  Deploy Previews. No GitHub Actions needed.
- `netlify.toml` (committed): build command `npm run build:static`, publish
  dir `out`, Node 20+ via environment. Being explicit keeps Netlify's Next.js
  runtime auto-detection from wrapping the site in serverless machinery — this
  is a plain static deploy.
- **mcpdojo.dev**: add as custom domain on the site; DNS via Netlify DNS or a
  CNAME/ALIAS at the registrar (user-side checklist below). `.dev` is
  HSTS-preloaded; Netlify's automatic Let's Encrypt certs cover it, so no
  extra TLS work.
- **mcpdojo.app → mcpdojo.dev**: add mcpdojo.app as a domain alias on the same
  site, then a domain-level rule in `netlify.toml`:
  `[[redirects]] from = "https://mcpdojo.app/*" to =
  "https://mcpdojo.dev/:splat" status = 301 force = true` — versioned in the
  repo, no registrar forwarding needed. Static export forbids Next-level
  redirects; Netlify-level rules are the right layer anyway.
- **User-side checklist** (things only the user can do): connect the repo in
  Netlify, add both domains, point DNS for both, confirm the redirect.

## Verification

1. `npm test && npm run typecheck && npm run build` (server build unchanged)
   and `npm run validate:fixture`.
2. `npm run build:static` (includes the `check-static-out` guard); serve
   `out/` (`npx serve out`) and in a real browser: replay defaults on, both
   bundled recordings play, diagram/frames drawers work, Live tab shows the
   card, "Open log…" round-trips a freshly saved Live log from local dev, a
   corrupted file shows the readable error, an unknown path serves the
   branded 404.
3. Local dev regression pass without the flag: Live mode against DKAN
   unchanged.
4. After deploy: same browser pass on https://mcpdojo.dev, plus
   https://mcpdojo.app 301 check (`curl -sI`).

## Out of scope

- Any hosted Live mode (public MCP proxy, hosted DKAN, API-key protection).
- Persisting opened logs (localStorage/share links) — possible fast-follow.
- Guided lesson mode / landing-page marketing content beyond the metadata and
  RunLocallyCard.
