# P1 — Profile registry + auth strategies

Goal: replace the single hard-coded DKAN profile (mandatory OAuth
client_credentials, exactly two personas) with a declarative profile list so
MCP Dojo connects to any streamable-HTTP MCP server: DKAN, other Drupal
servers, and no-auth/bearer non-Drupal servers. Foundation for stdio (P3)
and dual-version protocol (P4).

## Design

### Config file

`profiles.config.json` at repo root, committed. Secrets never appear
literally — secret-bearing fields must be `${ENV_VAR}` references resolved
from `.env.local` at load time. `${ENV_VAR:-fallback}` supplies a default
for optional vars. Validation (zod) fails fast with the profile id + field
path when a referenced var is missing or a secret field holds a literal.

```jsonc
{
  "profiles": [
    {
      "id": "dkan-demo",
      "name": "${DKAN_PROFILE_NAME:-DKAN demo site}",
      "transport": { "kind": "streamable-http", "url": "${DKAN_MCP_URL}" },
      "allowSelfSigned": "${DKAN_ALLOW_SELF_SIGNED:-0}",
      "auth": {
        "type": "oauth-client-credentials",
        "tokenUrl": "${DKAN_OAUTH_TOKEN_URL}",
        "personas": [
          { "key": "read-only", "label": "Read-only",
            "clientId": "${PERSONA_READONLY_CLIENT_ID}",
            "clientSecret": "${PERSONA_READONLY_CLIENT_SECRET}",
            "scope": "${PERSONA_READONLY_SCOPE}" },
          { "key": "editor", "label": "Editor",
            "clientId": "${PERSONA_EDITOR_CLIENT_ID}",
            "clientSecret": "${PERSONA_EDITOR_CLIENT_SECRET}",
            "scope": "${PERSONA_EDITOR_SCOPE}" }
        ]
      }
    },
    {
      "id": "everything",
      "name": "Reference server (everything)",
      "transport": { "kind": "streamable-http", "url": "http://localhost:3001/mcp" },
      "auth": { "type": "none" }
    }
  ]
}
```

The committed default references the existing `DKAN_*`/`PERSONA_*` env
names — current `.env.local` files keep working unchanged.

### Schema (zod, `src/lib/profile-config.ts` — pure, unit-tested)

Personas nest under the auth strategy so invalid combinations are
unrepresentable:

```ts
auth:
  | { type: "none" }                       // one implicit persona "default"
  | { type: "bearer";
      personas: { key; label; token }[] }  // token: ${ENV} required
  | { type: "oauth-client-credentials"; tokenUrl;
      personas: { key; label; clientId; clientSecret; scope }[] }
      // clientSecret: ${ENV} required
transport: { kind: "streamable-http"; url }   // "stdio" arrives in P3
protocolVersion?: string                       // default "2025-06-18"; P4 uses it
allowSelfSigned?: boolean                      // per profile; "1"/"true" coerced
```

Because `profiles[].id` and `personas[].key` become routing and cache
keys (`profileId:personaKey`), the schema `superRefine`s uniqueness:
profile ids globally unique, persona keys unique within their profile —
violations error with the profile id + field path like every other
validation failure.

`PublicProfile` (browser-facing): id, name, url, transport kind, authType,
personas as `{key, label, scope?}` only. A unit test asserts no
secret-bearing field survives the mapping.

### Server changes

- `src/lib/profiles.ts` → loads + validates `profiles.config.json`,
  exports `getProfiles()` / `getPublicProfiles()`; legacy `getProfile()`
  removed.
- `/api/profile` returns the list.
- `/api/mcp` request gains `profileId`; auth dispatch per profile:
  `none` → no Authorization header; `bearer` → static header;
  `oauth-client-credentials` → existing mint/cache path. Token cache key
  becomes `profileId:personaKey` (today's `personaKey`-only key would
  collide across profiles). `auth.token.received` events only on oauth
  mints — the log stays truthful for none/bearer profiles.
- Auth dispatch lives in a pure helper (`src/lib/proxy-auth.ts`) the route
  calls, so the strategy matrix is unit-testable without HTTP.
- `allowSelfSigned` must be per-REQUEST, not process-global: the current
  `NODE_TLS_REJECT_UNAUTHORIZED` mutation would disable TLS verification
  for every profile once any self-signed profile is used. Replace with a
  per-profile undici `Agent` (`connect: { rejectUnauthorized: false }`)
  passed as the fetch `dispatcher` only for profiles that opt in; strict
  TLS is the untouched default path. The dispatcher applies to EVERY
  outbound fetch the profile makes — OAuth token mint, MCP JSON-RPC
  forward, and the `notifications/initialized` follow-up — since DDEV's
  self-signed cert fronts the token URL as much as the MCP endpoint.
- `buildFrame("initialize")` reads `protocolVersion` from the profile
  (plumbing only; behavior unchanged until P4).

### Client changes

- `live.ts`: `connect(profile, personaKey)` passes `profileId` on every
  proxy call; `session.started.transport` derives from the profile instead
  of the hard-coded literal; persona flow unchanged (a `none` profile has
  the single implicit persona, so the pills collapse to one).
- `LiveView` state model, explicitly: fetch `PublicProfile[]`, select the
  first profile by default, and initialize the persona to the selected
  profile's FIRST persona key — the current hard-coded `"read-only"`
  initial state would send an unknown persona for any non-DKAN profile.
  Changing profile resets persona and connection state. Profile dropdown
  above the persona pills, hidden when only one profile is configured —
  the DKAN demo flow looks exactly as today.

### Event schema

No changes. `session.started.profile` is already a string;
the transport enum already includes `stdio`. Fixtures and goldens
unaffected.

## Out of scope (explicitly)

- stdio transport (P3) — the transport discriminated union is shaped for
  it, nothing more.
- 2026-07-28 stateless frames (P4) — only the `protocolVersion` field
  lands now.
- authorization_code + PKCE — post-P1; the auth union accommodates a new
  member additively.
- UI-entered server URLs — profiles are config-file-defined only; the
  proxy must never fetch a browser-supplied URL (SSRF).

## Phases

1. `profile-config.ts`: schema, env interpolation (incl. `:-` defaults),
   literal-secret rejection, id/persona-key uniqueness + unit tests
   (valid config, missing env var, literal secret, defaults, duplicate
   profile id, duplicate persona key, public mapping leak test).
2. Server swap: `profiles.ts` loader, `/api/profile` list, `/api/mcp`
   profileId + `proxy-auth.ts` dispatch + cache key + per-profile TLS
   dispatcher. Unit tests for the dispatch matrix: none sends no
   Authorization, bearer sends the static header, oauth caches by
   `profileId:personaKey` (cross-profile persona-key collision case),
   unknown profile/persona rejected, self-signed dispatcher only for
   opted-in profiles and applied to both the token mint and the MCP
   forward paths.
3. Client + UI: `live.ts` plumbing, LiveView profile/persona state model
   (first-profile default, persona derived from profile, reset on switch),
   profile picker.
4. Verify + docs: `npm test && npm run typecheck && npm run build`;
   browser against (a) the DKAN profile — full golden-demo beats including
   persona switch, (b) a no-auth profile pointing at
   `npx @modelcontextprotocol/server-everything` (streamable HTTP) to
   prove the non-Drupal path, and (c) the single-no-auth-profile-only
   config (implicit default persona end to end). Update README setup +
   `.env.local.example` + AGENTS.md facts together.

## Risks

- **Secret leakage via /api/profile** — mitigated by the PublicProfile
  mapping test and by nesting secrets under `auth`.
- **Config/env drift** — the committed config references the same env
  names as `.env.local.example`; both updated together in phase 4.
- **Persona-diff regression** — the capability-diff demo depends on
  switching personas within one profile; phase 4 verifies the golden beats
  live.
