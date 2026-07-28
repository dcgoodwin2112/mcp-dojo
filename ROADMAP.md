# Roadmap — learning-tool features

Feature backlog from the 2026-07-23 research pass: how to grow MCP Dojo from
demo client into a fuller MCP learning tool.
Decision history: [mcp-inspector-handoff-plan.md](mcp-inspector-handoff-plan.md).

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
  the actor badges; rows derived by `src/lib/sequence.ts`)
- Three-error-channels lesson (in-band chip on tool results — DKAN returns
  structured error payloads with isError:false; channel-numbered ⓘ notes;
  "when things fail" legend section)
- Context-growth meter (stacked bars per model call in the ⊞ Context drawer;
  sizes recorded on context.snapshot events — tool defs are the flat
  baseline, conversation is what grows)

All initial roadmap items are shipped.

## Backlog

From the 2026-07-27 research pass (spec-transition + hosting):

- **Hosted replay-only deployment** — replay + goldens need no server,
  OAuth, or API keys; deploy at mcpdojo.dev as the public entry point.
- **Spec-transition ⓘ annotations** — mark cards teaching 2026-07-28-changed
  behavior (initialize handshake and Mcp-Session-Id removed in the stateless
  core; OAuth hardening) via `spec-notes.ts`.
- **Tasks over DKAN harvest/import** — the 2026-07-28 Tasks extension fits
  DKAN's genuinely long-running ops (`run_harvest`, `import_resource`);
  cross-repo; subsumes a notifications/progress pane.

Earlier backlog:

- **Guided lesson mode** — "Learn" tab with checkpoints verified against the
  live log. The flagship conversion from demo to tutorial.
- **Authored elicitation fixtures** — narrated synthetic recordings for
  flows DKAN doesn't implement, targeting the final 2026-07-28 spec's
  multi-round-trip `InputRequiredResult` shape (sampling is deprecated
  there; no fixture for it).
- **Challenge mode** — log-verified exercises ("trigger a 403", "answer
  without search_datasets").
- **Session export** — annotated markdown writeup of any session.
- **Real elicitation in dkan_mcp_server** — cross-repo; the 2026-07-28 spec
  is final (protocol logging is deprecated in it — dropped from this item).
- **Multi-server composition** — namespaced tools from two servers; large
  proxy/profile rework.
- Deferred a11y: aria-live timeline region, keyboard-resizable drag handles.
