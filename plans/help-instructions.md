# In-app instructions / help

Orient first-time visitors — especially on mcpdojo.dev, where landing
directly on the replay screen explains nothing. Decisions (settled with the
user): a welcome panel auto-shown on the hosted build only, plus a
persistent "? Help" button (all builds) that reopens the same content;
content covers what-this-is + quick start, keyboard shortcuts, and
run-locally / open-log pointers. No MCP-concepts primer (the Legend already
teaches that).

## Presentation decision

One content component, one presentation: a **centered overlay dialog**
rendered from `page.tsx`, rather than an in-flow card inside `ReplayView`.
Rationale: the Help button must work from both Live and Replay tabs; a
single dialog avoids two render paths and any timeline layout shift, and
`page.tsx` already owns cross-mode chrome (header, present mode). Auto-open
on the hosted build makes the dialog the welcome screen; the visitor reads
two short sections and clicks through to the replay.

## Changes

### `src/components/HelpDialog.tsx` (new)

Presentational only — no new lib logic, consistent with "components stay
untested"; no new unit tests.

- **Native `<dialog>` via `showModal()`** — the browser supplies the modal
  semantics we'd otherwise hand-roll: top-layer rendering, focus trap,
  background made inert, Esc-to-close (the `cancel` event). Styled to match
  existing cards (`rounded-lg border … dark:bg-zinc-900`, `::backdrop`
  dimmed); ✕ close button carries `autofocus` so initial focus lands inside;
  clicking the backdrop closes (click-target check on the dialog element).
  On close, focus is restored to the ? Help button (native behavior returns
  focus to the previously focused element; verify, and restore manually if
  the auto-open path started with focus on `<body>`). Content scrolls
  within the panel (`max-h-[85dvh] overflow-y-auto`) for projector sizes.
- Sections:
  1. **What you're looking at** — two sentences: MCP Dojo is a practice
     space for the Model Context Protocol; a recording is a real session
     between user, model, app, and an MCP server, captured as an
     append-only event log and replayed here.
  2. **Quick start** — ▶ Play (or space) streams the log; narration cards
     pause at each demo step; "ⓘ what is this?" on any card explains it
     with a spec link (amber notes mark 2026-07-28 changes); ⇄ Diagram
     shows who-talks-to-whom; { } Raw JSON-RPC shows the wire frames;
     the picker top-left switches recordings.
  3. **Keyboard** — `space` play/pause · `←/→` step · `Home`/`End` jump ·
     `p` presentation mode · `Esc` close/exit. (First place these are
     documented in the app.)
  4. **Going further** — ↑ Open log… replays a session saved from a local
     Live session (↓ Save .json); Live mode connects to servers you run
     yourself — clone-and-run snippet + GitHub link (same content as
     `RunLocallyCard`; keep both, they serve different moments).

### `src/app/page.tsx`

- `helpOpen` state. Auto-open decision in a `useEffect` (not the state
  initializer) so SSR/prerender output is deterministic — no hydration
  mismatch; the dialog pops in client-side on the hosted first visit only:
  `REPLAY_ONLY && readHelpSeen() !== "1"`.
- **Storage guards**: `readHelpSeen()` / `markHelpSeen()` helpers wrap
  `localStorage` in try/catch (restricted modes can throw). Read failure →
  treat as unseen (show once per page load); write failure → still close
  cleanly. Key `inspector.helpSeen` follows the existing `inspector.*`
  convention.
- Every close path (✕, backdrop, Esc/`cancel`) funnels through the
  dialog's `close` event → `markHelpSeen()` + `setHelpOpen(false)` — one
  handler, no per-path bookkeeping. The dialog never auto-opens locally;
  the button is the only local entry point.
- Header gains a `? Help` button styled like the ⊡ Present button, to its
  left. Hidden in present mode (whole header already is).
- **Keyboard while open**: Esc is handled by the native dialog (`cancel` →
  `close`), so the page handler needs no Esc special-casing. The remaining
  hole is `window`-level hotkeys (space/arrows in ReplayView; `p`/Escape in
  page.tsx) firing behind the modal — `<dialog>` inertness does not block
  window listeners. Gate with a data attribute: the dialog sets
  `document.documentElement.dataset.dialogOpen` while open (cleared on
  close/unmount), and both key handlers return early **as their first
  check** when it's set. Handler order in page.tsx: dialogOpen guard →
  editable-target guard → `p`/Escape presentation logic. ReplayView gets
  the same one-line guard.

### Docs

- `README.md`: one line — hosted site shows a welcome panel; ? Help
  reopens it.
- `AGENTS.md`: map row for `HelpDialog.tsx`; note the
  `inspector.helpSeen` key and the `data-dialog-open` gating convention.
- `DEMO-RUNBOOK.md` pre-flight: no change needed (local never auto-opens),
  but add "? Help exists — don't click it mid-demo" is unnecessary; skip.

## Verification

1. `npm test && npm run typecheck && npm run build && npm run build:static`.
2. Local dev browser pass: no auto-dialog; ? Help opens/closes via ✕,
   backdrop, Esc; focus lands in the dialog on open and returns to the
   Help button on close; Tab cannot reach background controls while open;
   replay hotkeys dead while open, alive after; present mode unaffected
   (Esc exits present only when dialog closed).
3. Hosted simulation (`npx serve out`): dialog auto-opens on first visit;
   dismiss → reload → stays closed; clear localStorage → reopens; Help
   button reopens it; content readable in light and dark, and at a narrow
   viewport.

## Out of scope

- Guided lesson mode / interactive tour (post-talk roadmap item).
- Moving Legend content into the dialog (Legend stays the concepts
  teacher; the dialog links attention to it implicitly via quick start).
