"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { InspectorEvent } from "@/lib/events";
import { diagramRows, LANES, type DiagramRow } from "@/lib/sequence";
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
  const color = row.tone === "error" ? "text-red-700 dark:text-red-400" : "text-zinc-600 dark:text-zinc-300";
  const line = row.tone === "error" ? "border-red-400 dark:border-red-700" : "border-zinc-400 dark:border-zinc-600";
  return (
    <div className="relative h-9" role="listitem">
      <div
        className={`absolute top-4 ${line} ${row.dashed ? "border-t border-dashed" : "border-t-2"}`}
        style={{ left: `${left}%`, width: `${width}%` }}
      />
      {/* -50% centers the box on the line's top edge; +1.5px compensates for
          the glyph ink sitting high in its em box and the border's downward
          growth, so the tip lands on the line's visual center. */}
      <span
        className={`absolute top-4 translate-y-[calc(-50%+1.5px)] text-[9px] leading-none ${color}`}
        style={rightward ? { left: `calc(${to}% - 7px)` } : { left: `${to}%` }}
      >
        {rightward ? "▶" : "◀"}
      </span>
      <span
        className={`absolute top-0 max-w-full -translate-x-1/2 truncate font-mono text-[10px] ${color}`}
        style={{ left: `${left + width / 2}%`, maxWidth: `${Math.max(width, 22)}%` }}
        title={row.label}
      >
        {row.label}
      </span>
    </div>
  );
}

function Note({ row }: { row: Extract<DiagramRow, { kind: "note" }> }) {
  return (
    <div className="relative h-7" role="listitem">
      <span
        className="absolute top-0.5 max-w-[24%] -translate-x-1/2 truncate rounded border border-zinc-300 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
        style={{ left: `${center(row.lane)}%` }}
        title={row.label}
      >
        {row.label}
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

export function SequenceDiagram({ events }: { events: InspectorEvent[] }) {
  const rows = useMemo(() => diagramRows(events), [events]);
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
      <div className="relative z-10 flex shrink-0 border-b border-zinc-200 pb-1.5 dark:border-zinc-800">
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
                className="absolute bottom-0 top-0 border-l border-dashed border-zinc-200 dark:border-zinc-800"
                style={{ left: `${center(lane)}%` }}
              />
            ))}
          </div>
          <div role="list" aria-label="Sequence diagram" className="relative py-2">
            {rows.map((row) =>
              row.kind === "arrow" ? (
                <Arrow key={row.id} row={row} />
              ) : row.kind === "note" ? (
                <Note key={row.id} row={row} />
              ) : (
                <Banner key={row.id} row={row} />
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
