"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { InspectorEvent } from "@/lib/events";
import { groupTimelineRows } from "@/lib/timeline-rows";
import { formatClock } from "@/lib/ui";
import { ActorBadge } from "./ActorBadge";
import { EventCard } from "./EventCard";
import { Enso } from "./Logo";

/**
 * Pure rendering of a list of events — live mode and replay feed the same
 * component. Owns its scroll: auto-follows the tail while pinned to the
 * bottom; scrolling up unpins and shows a "↓ latest" jump pill.
 */
export function Timeline({
  events,
  emptyHint = "No events yet.",
  jumpNonce,
  present = false,
}: {
  events: InspectorEvent[];
  emptyHint?: string;
  /** Increment to force-scroll to the tail (explicit seek/step navigation). */
  jumpNonce?: number;
  /** Presentation mode — leave room to scroll past the floating controls. */
  present?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);

  const rows = useMemo(() => groupTimelineRows(events), [events]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && atBottom) el.scrollTop = el.scrollHeight;
  }, [events.length, atBottom]);

  useEffect(() => {
    if (jumpNonce === undefined) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setAtBottom(true);
  }, [jumpNonce]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  }

  function jumpToLatest() {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setAtBottom(true);
  }

  return (
    <div className="relative h-full min-h-0">
      <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto pr-1">
        {events.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-16">
            <Enso className="size-16 text-zinc-200 dark:text-zinc-800" />
            <p className="max-w-sm text-center text-sm text-zinc-500 dark:text-zinc-400">{emptyHint}</p>
          </div>
        ) : (
          <ol className={`space-y-2 ${present ? "pb-32" : "pb-4"}`}>
            {rows.map((row, i) => {
              const event = row.event;
              const delta = i === 0 ? event.t : event.t - rows[i - 1].event.t;
              return (
                <li key={event.id} className="flex items-start gap-3">
                  <div className="w-16 shrink-0 pt-1.5 text-right">
                    <div className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                      {formatClock(event.t)}
                    </div>
                    {delta > 0 && (
                      <div className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                        +{(delta / 1000).toFixed(1)}s
                      </div>
                    )}
                  </div>
                  <div className="w-16 shrink-0 pt-1">
                    <ActorBadge actor={event.actor} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <EventCard
                      event={event}
                      mergedTemplates={row.mergedTemplates}
                      compact={row.compact}
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
      {!atBottom && events.length > 0 && (
        <button
          type="button"
          onClick={jumpToLatest}
          className="absolute bottom-3 right-4 rounded-full bg-zinc-900 px-3 py-1 text-xs font-medium text-white shadow-lg hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          ↓ latest
        </button>
      )}
    </div>
  );
}
