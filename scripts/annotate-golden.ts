/**
 * Post-process a recorded live session into the annotated golden fixture:
 * inserts presenter narration (pauseOnReplay) at each demo-beat seam,
 * renumbers seq, validates, and writes the fixture JSON.
 *
 * Usage: tsx scripts/annotate-golden.ts <recorded-log.json> [out.json]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { EventLogSchema, type InspectorEvent } from "../src/lib/events";

type Ev = Record<string, unknown> & { type: string; seq: number; t: number; wall: string };

const [inPath, outPath = "src/lib/fixtures/goldens/full-demo.json"] = process.argv.slice(2);
if (!inPath) {
  console.error("usage: tsx scripts/annotate-golden.ts <recorded-log.json> [out.json]");
  process.exit(1);
}

const log = JSON.parse(readFileSync(inPath, "utf8")) as {
  version: number;
  sessionId: string;
  recordedAt: string;
  events: Ev[];
};

interface Beat {
  text: string;
  pause: boolean;
  /** Returns true for the event this annotation should precede. */
  match: (e: Ev, seen: Record<string, number>) => boolean;
}

const BEATS: Beat[] = [
  {
    text: "Step 1 — Connect. Watch the MCP handshake: a redacted OAuth token, initialize, then discovery. Three primitives, three colors: tools, resources, prompts.",
    pause: true,
    match: (e, seen) => e.type === "auth.persona.selected" && (seen["auth.persona.selected"] ?? 0) === 0,
  },
  {
    text: "Step 2 — Manual mode. search_datasets fired by hand from a form generated from its inputSchema. No model involved: it's just a typed function over HTTP.",
    pause: true,
    match: (e) => e.type === "tool.call.requested" && e.toolName === "search_datasets" && e.actor === "user",
  },
  {
    text: "Step 3 — Agent mode. Same tool, but now the MODEL chooses to call it. Watch the loop: context → model → tool call → JSON-RPC → result → back into the loop.",
    pause: true,
    match: (e, seen) => e.type === "turn.started" && (seen["turn.started"] ?? 0) === 0,
  },
  {
    text: "Step 4 — Prompts are user-controlled. Typed as a slash command (MCP completion fills the dataset id — watch the completion/complete frames), expanded server-side, previewed BEFORE sending — then the model runs the prompt's recipe.",
    pause: true,
    match: (e) => e.type === "prompt.invoked",
  },
  {
    text: "Step 5 — Resources are app-controlled. The app reads the dataset's DCAT-US metadata and attaches it; the context snapshot shows exactly what the model receives.",
    pause: true,
    match: (e) => e.type === "rpc.request" && e.method === "resources/read",
  },
  {
    text: "Step 6 — Persona switch. A new token, a new MCP session — and 13 more tools appear. The MCP surface is permission-dependent, driven by Drupal's own permission system.",
    pause: true,
    match: (e, seen) => e.type === "auth.persona.selected" && seen["auth.persona.selected"] === 1,
  },
  {
    text: "Step 7 — Back to read-only, and ask the agent to CHANGE something. It can't: update_dataset was never in its tools/list, so the model has nothing to call.",
    pause: true,
    match: (e, seen) => e.type === "auth.persona.selected" && seen["auth.persona.selected"] === 2,
  },
  {
    text: "Defense in depth: force-call the hidden tool anyway. HTTP 403, JSON-RPC -32002 — hidden from the list AND denied at the protocol level.",
    pause: true,
    match: (e) => e.type === "tool.call.requested" && e.toolName === "update_dataset" && e.actor === "user",
  },
];

const CLOSING =
  "That's the whole story: tools are model-controlled, prompts are user-controlled, resources are app-controlled — and everything you watched is one append-only event log.";

const out: Ev[] = [];
const seen: Record<string, number> = {};
const remaining = [...BEATS];
let annotationCount = 0;

function annotation(text: string, pause: boolean, like: Ev): Ev {
  annotationCount += 1;
  return {
    id: `golden-note-${annotationCount}`,
    seq: 0, // renumbered below
    t: like.t,
    wall: like.wall,
    sessionId: log.sessionId,
    actor: "user",
    type: "annotation",
    text,
    ...(pause ? { pauseOnReplay: true } : {}),
  };
}

for (const e of log.events) {
  const idx = remaining.findIndex((b) => b.match(e, seen));
  if (idx !== -1) {
    const [beat] = remaining.splice(idx, 1);
    out.push(annotation(beat.text, beat.pause, e));
  }
  seen[e.type] = (seen[e.type] ?? 0) + 1;
  out.push(e);
}
const last = log.events[log.events.length - 1];
out.push(annotation(CLOSING, false, last));

out.forEach((e, i) => (e.seq = i + 1));

if (remaining.length > 0) {
  console.error("UNMATCHED beats:", remaining.map((b) => b.text.slice(0, 40)));
  process.exit(1);
}

const result = EventLogSchema.parse({ ...log, events: out as unknown as InspectorEvent[] });
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(result, null, 2) + "\n");
console.log(
  `✓ ${outPath}: ${result.events.length} events (${annotationCount} annotations), ` +
    `${(last.t / 1000).toFixed(1)}s`,
);
