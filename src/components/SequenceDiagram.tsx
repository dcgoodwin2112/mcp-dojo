"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { InspectorEvent } from "@/lib/events";
import {
  activeLanes,
  diagramRows,
  LANES,
  type ActivationSegment,
  type DiagramRow,
} from "@/lib/sequence";
import { ACTOR_STYLES } from "@/lib/ui";

/**
 * Swimlane rendering of the event log — who talks to whom. Same events the
 * timeline shows (live and replay); lanes match the actor badges. Pure CSS
 * positioning: lane centers sit at (i + 0.5) / 4 of the width.
 */

const LANE_COUNT = LANES.length;
const center = (lane: (typeof LANES)[number]) =>
  ((LANES.indexOf(lane) + 0.5) / LANE_COUNT) * 100;

function Arrow({ row }: { row: Extract<DiagramRow, { kind: "arrow" }> }) {
  const from = center(row.from);
  const to = center(row.to);
  const left = Math.min(from, to);
  const width = Math.abs(to - from);
  const rightward = to > from;
  const isError = row.tone === "error";
  // Line and arrowhead wear the SOURCE actor's color (errors stay red — status
  // wins over actor); the label stays neutral ink.
  const s = ACTOR_STYLES[row.from];
  const label = isError ? "text-red-700 dark:text-red-400" : "text-zinc-600 dark:text-zinc-300";
  const head = isError ? "text-red-700 dark:text-red-400" : s.arrowHead;
  const line = isError ? "border-red-400 dark:border-red-700" : s.arrowLine;
  return (
    <div
      className="group relative h-9 rounded hover:bg-zinc-100/70 dark:hover:bg-zinc-900/70"
      role="listitem"
    >
      <div
        className={`absolute top-4 ${line} ${row.dashed ? "border-t border-dashed" : "border-t-2"}`}
        style={{ left: `${left}%`, width: `${width}%` }}
      />
      {/* -50% centers the box on the line's top edge; +1.5px compensates for
          the glyph ink sitting high in its em box and the border's downward
          growth, so the tip lands on the line's visual center. */}
      <span
        className={`absolute top-4 translate-y-[calc(-50%+1.5px)] text-[9px] leading-none ${head}`}
        style={rightward ? { left: `calc(${to}% - 7px)` } : { left: `${to}%` }}
      >
        {rightward ? "▶" : "◀"}
      </span>
      {/* The span holds the fuller detail text, clipped to the lane span by
          default. Hover lifts it above neighbors, widens it (! beats the
          inline maxWidth), and lets it wrap so the whole text reads in place. */}
      <span
        className={`absolute top-0 max-w-full -translate-x-1/2 truncate font-mono text-[10px] ${label} group-hover:z-20 group-hover:max-w-[50%]! group-hover:overflow-visible! group-hover:whitespace-normal! group-hover:break-words group-hover:rounded group-hover:bg-white group-hover:px-1 group-hover:shadow-sm dark:group-hover:bg-zinc-950`}
        style={{ left: `${left + width / 2}%`, maxWidth: `${Math.max(width, 22)}%` }}
        title={row.detail ?? row.label}
      >
        {row.detail ?? row.label}
      </span>
    </div>
  );
}

function Note({ row }: { row: Extract<DiagramRow, { kind: "note" }> }) {
  const s = ACTOR_STYLES[row.lane];
  return (
    <div className="group relative h-7" role="listitem">
      <span
        className={`absolute top-0.5 max-w-[24%] -translate-x-1/2 truncate rounded border px-1.5 py-0.5 font-mono text-[10px] ${s.badge} ${s.noteBorder} group-hover:z-20 group-hover:max-w-[40%]! group-hover:overflow-visible! group-hover:whitespace-normal! group-hover:break-words`}
        style={{ left: `${center(row.lane)}%` }}
        title={row.detail ?? row.label}
      >
        {row.detail ?? row.label}
      </span>
    </div>
  );
}

function Banner({ row }: { row: Extract<DiagramRow, { kind: "banner" }> }) {
  return (
    <div className="relative z-10 mx-[4%] my-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs dark:border-amber-800 dark:bg-amber-950/80" role="listitem">
      ¶ {row.label}
    </div>
  );
}

/** Mermaid-style activation strips: the callee lane's "busy" bar segment for
    one row. Consecutive rows' segments stack into a continuous bar; start/end
    segments stop at the arrow line (top-4, +2px border) so each exchange
    reads as its own bar with gaps between exchanges. */
function ActivationStrips({ segments }: { segments: ActivationSegment[] }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {segments.map(({ lane, pos }) => (
        <div
          key={lane}
          className={`absolute w-1.5 -translate-x-1/2 ${ACTOR_STYLES[lane].activation} ${
            pos === "start"
              ? "bottom-0 top-4 rounded-t-sm"
              : pos === "end"
                ? "top-0 h-[18px] rounded-b-sm"
                : "bottom-0 top-0"
          }`}
          style={{ left: `${center(lane)}%` }}
        />
      ))}
    </div>
  );
}

export function SequenceDiagram({ events }: { events: InspectorEvent[] }) {
  const rows = useMemo(() => diagramRows(events), [events]);
  const active = useMemo(() => activeLanes(rows), [rows]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && atBottom) el.scrollTop = el.scrollHeight;
  }, [rows.length, atBottom]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  }

  if (rows.length === 0) {
    return <p className="py-16 text-center text-sm text-zinc-500 dark:text-zinc-400">No events yet.</p>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Lane headers — same actors as the timeline badges. */}
      <div className="relative z-10 flex shrink-0 border-b border-zinc-200 pb-1.5 pt-2 dark:border-zinc-800">
        {LANES.map((lane) => {
          const s = ACTOR_STYLES[lane];
          return (
            <div key={lane} className="flex flex-1 justify-center">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${s.badge}`}>
                <span className={`size-1.5 rounded-full ${s.dot}`} />
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
        {/* Inner wrapper spans the full content height, so the lifelines do
            too — anchored to the scroll container they would stop at one
            viewport-height and vanish once the log outgrows it. */}
        <div className="relative">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            {LANES.map((lane) => (
              <div
                key={lane}
                className={`absolute bottom-0 top-0 border-l border-dashed ${ACTOR_STYLES[lane].lifeline}`}
                style={{ left: `${center(lane)}%` }}
              />
            ))}
          </div>
          <div role="list" aria-label="Sequence diagram" className="relative py-2">
            {rows.map((row, i) => (
              <div key={row.id} className="relative">
                {row.kind === "arrow" ? (
                  <Arrow row={row} />
                ) : row.kind === "note" ? (
                  <Note row={row} />
                ) : (
                  <Banner row={row} />
                )}
                {/* Strips render after the row so they sit above its hover
                    background; hovered labels still win via their z-index.
                    Banners skip them — the bar passes visibly "behind". */}
                {row.kind !== "banner" && active[i].length > 0 && (
                  <ActivationStrips segments={active[i]} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
