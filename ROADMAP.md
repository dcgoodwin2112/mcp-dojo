# Roadmap

How MCP Dojo grows from demo client into a server-agnostic MCP learning
tool. Decision history: [mcp-inspector-handoff-plan.md](mcp-inspector-handoff-plan.md).

## Shipped

- Spec-linked event cards ("ⓘ what is this?" + spec links, `src/lib/spec-notes.ts`)
- Concepts legend (primitives + control planes + actor badges, pre-connect)
- Tool-result tabs (text / structuredContent / outputSchema / raw)
- Tool annotation chips (destructive/open-world/non-idempotent in panel rows,
  full set in the manual-call header; `src/lib/annotations.ts`)
- Description-engineering sandbox (rewrite a tool description host-side in
  the Context inspector; verified A/B: poisoned search_datasets description
  → model switches to list_datasets, restore → back to search_datasets)
- Sequence-diagram view (⇄ Diagram toggle in live + replay; swimlanes match
  the actor badges; actor-colored arrows + activation bars; rows derived by
  `src/lib/sequence.ts`)
- Three-error-channels lesson (in-band chip on tool results — DKAN returns
  structured error payloads with isError:false; channel-numbered ⓘ notes;
  "when things fail" legend section)
- Context-growth meter (stacked bars per model call in the ⊞ Context drawer)
- JSON syntax highlighting across request/response views (`JsonBlock`)
- **P1 — Profile registry + auth strategies** (2026-07-28): declarative
  `profiles.config.json`, auth `none`/`bearer`/`oauth-client-credentials`,
  profile picker; [plans/p1-profile-registry.md](plans/p1-profile-registry.md)
- **P2 — Honest streamable-HTTP** (2026-07-28): every SSE frame kept and
  classified in wire order, `MCP-Protocol-Version` sent, progressToken;
  [plans/p2-honest-streamable-http.md](plans/p2-honest-streamable-http.md)
- **P3 — stdio transport** (2026-07-28): config-declared child processes,
  minimal env, bounded FIFO sessions, verified against `ddev drush` and
  the reference server; [plans/p3-stdio-transport.md](plans/p3-stdio-transport.md)

## Connection & protocol (remaining)

4. **P4 — Dual-version protocol (2026-07-28 spec).** Per-profile
   protocolVersion with two frame-builders: 2025-06-18 (handshake +
   Mcp-Session-Id) and the stateless core (`_meta` client info,
   `InputRequiredResult` round-trips). "Same server, two protocol
   generations, diff the wire traffic" is the lesson. Gated on server-side
   adoption (mcp/sdk, Drupal contrib).
5. **P5 — Tasks + notifications pane.** The 2026-07-28 Tasks extension over
   DKAN's genuinely long-running ops (`run_harvest`, `import_resource`);
   cross-repo. P2's frame capture is in place; still needs semantic
   timeline/progress UI and server-side Tasks support.
6. **P6 — Multi-server composition.** Namespaced tools from two servers;
   cheaper after P4 (the stateless spec simplifies session handling).

## Learning-tool backlog

- **Hosted replay-only deployment** — replay + goldens need no server,
  OAuth, or API keys; deploy at mcpdojo.dev as the public entry point.
- **Spec-transition ⓘ annotations** — mark cards teaching
  2026-07-28-changed behavior via `spec-notes.ts`; pairs with P4.
- **Guided lesson mode** — "Learn" tab with checkpoints verified against
  the live log. The flagship conversion from demo to tutorial.
- **Authored elicitation fixtures** — narrated synthetic recordings
  targeting the final 2026-07-28 multi-round-trip `InputRequiredResult`
  shape (sampling is deprecated there; no fixture for it).
- **Challenge mode** — log-verified exercises ("trigger a 403", "answer
  without search_datasets").
- **Session export** — annotated markdown writeup of any session.
- **Real elicitation in dkan_mcp_server** — cross-repo; the 2026-07-28
  spec is final (protocol logging is deprecated in it).
- Deferred a11y: aria-live timeline region, keyboard-resizable drag handles.
