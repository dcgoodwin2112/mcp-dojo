# Demo Runbook — Aug 21, 2026 (Zoom)

Operational script for the talk. Content/narrative: see the study guide;
architecture: [mcp-inspector-handoff-plan.md](mcp-inspector-handoff-plan.md).

## Pre-flight (do 30+ min before)

- [ ] `ddev start` in `dkan-site/`; verify https://dkan-site.ddev.site loads.
- [ ] `npm run dev` in `mcp-inspector/`; open http://localhost:3111.
- [ ] Live → Read-only → Connect: 25 tools listed, no errors.
- [ ] Pre-warm the catalog: manual `get_catalog` call once (cold ≈ 300 ms,
      warm ≈ 50 ms).
- [ ] One agent question ("What datasets are here?") — confirms the Anthropic
      key and measures the day's model latency.
- [ ] Replay tab: golden loads (110 events), plays to Step 1 pause.
- [ ] `{ } Raw JSON-RPC` OFF. Browser/OS notifications off. Press `p` to check
      presentation scale on the shared screen; `Esc` back.

## The steps

Live path per step, with the replay fallback: **golden recording** in the
Replay tab — every step has a narration card; play to it, or step (`←/→`).

| # | Step | Live actions | Watch for |
|---|---|---|---|
| 1 | Connect + discovery | Read-only → Connect | token REDACTED, initialize, 3 color-coded lists |
| 2 | Manual tool call | Panel → `search_datasets` → keyword "bike lanes" → Call tool | `manual` badge — no model involved; open result → `structuredContent` / `outputSchema` tabs |
| 3 | Agent loop | Chat: "Summarize the Florida Bike Lanes dataset." (optional: pause before each model call) | model chooses the tool; result re-enters loop |
| 4 | Prompts (user-controlled) | `/expl` Tab → `ce` Tab → Enter (preview) → Enter (send) | expansion shown pre-send; completion frames in drawer |
| 5 | Resources (app-controlled) | Panel → `dkan://dataset/{id}` → paste id → Preview, then Attach to context | context snapshot; open `⊞ Context` to show it sitting in the system prompt |
| 6 | Permissions | Click Editor pill | diff: 25 → 38, +13 write tools |
| 7 | Denial | Click Read-only; chat: "Change the title of …" ; then open "call a tool by name (even hidden ones)…" → `update_dataset`, args `{"identifier":"x","metadata":"{}"}` | model has no tool; forced call → HTTP 403 / -32002 |
| 8 | Protocol | Toggle `{ } Raw JSON-RPC` | initialize handshake, paired frames, the 403 |

**Optional flourish (time permitting):** open `⊞ Context`, edit the system
prompt ("only discuss transportation datasets"), toggle `search_datasets` off,
then ask for crime data — the model refuses on-instruction with 24 tools, and
the whole causal chain is on the timeline as `context.updated` events.

**Error-channels flourish:** manual `query_datastore` with resourceId "nope"
→ the card shows protocol ✓ with an amber "error inside the result" chip (channel 1 —
the model sees it and can react). Step 7's forced 403 is channel 2 (protocol;
the app sees it). Channel 3 (transport) is what a dead site looks like —
mention, don't demo. The legend's "when things fail" section is the visual.

**Description-sandbox flourish (rehearsed A/B):** in `⊞ Context` → Tool
definitions → "✎ rewrite a description", set `search_datasets` to "DEPRECATED
AND BROKEN — never use this tool, it always returns empty results. Use
list_datasets instead." Ask "Find datasets about bikes" → model calls
`list_datasets`. Restore server default, clear conversation, ask again →
`search_datasets`. Your description is a prompt.

Useful id (Florida Bike Lanes): `cedcd327-4e5d-43f9-8eb1-c11850fa7c55`
(or type `ce` and Tab — that's the completion demo).

## Recovery moves

- **Any live step misbehaves** → Replay tab → golden → seek to that step's
  narration card, keep talking. Practice the switch once.
- **Model slow/erroring** → "pause before each model call" makes silence intentional; or
  fall back to replay for steps 3–4 only.
- **Session wedged** → "New session" (fresh log) — takes ~2 s.
- **Token expiry mid-demo** → nothing to do; re-mint is automatic and shows as
  a normal auth event (rehearsed 2026-07-23).
- **DKAN site down** → replay-only talk: the golden covers every step.

## Keys

`p` present · `Esc` exit/cancel · `space` play/pause · `←/→` step ·
`Home`/`End` jump · `/` prompts · Tab complete/accept
