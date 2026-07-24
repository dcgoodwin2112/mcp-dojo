"use client";

import { useEffect, useMemo, useState } from "react";
import type { EventLog } from "@/lib/events";
import { RECORDINGS } from "@/lib/fixtures";
import { useDrawerResize } from "@/hooks/useDrawerResize";
import { useReplay } from "@/hooks/useReplay";
import { isRpcEvent, useActiveView } from "@/hooks/useRawFrames";
import { FramesDrawer } from "./FramesDrawer";
import { ReplayControls } from "./ReplayControls";
import { SequenceDiagram } from "./SequenceDiagram";
import { Timeline } from "./Timeline";

export function ReplayView({
  log: propLog,
  present = false,
}: {
  log: EventLog;
  present?: boolean;
}) {
  const [selected, setSelected] = useState("__prop");
  const log =
    selected === "__prop"
      ? propLog
      : (RECORDINGS.find((r) => r.id === selected)?.log ?? propLog);
  const { controller, state } = useReplay(log);
  const [view, setView] = useActiveView();
  const drawer = useDrawerResize();

  const visible = useMemo(() => log.events.slice(0, state.cursor), [log, state.cursor]);
  const timelineEvents = useMemo(() => visible.filter((e) => !isRpcEvent(e)), [visible]);
  const skipEvent = view === "frames" ? undefined : isRpcEvent;
  /** Bumped on explicit navigation so the timeline follows the seek. */
  const [jumpNonce, setJumpNonce] = useState(0);
  const onNavigate = () => setJumpNonce((n) => n + 1);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLElement && /^(input|textarea|select)$/i.test(e.target.tagName)) {
        return;
      }
      switch (e.key) {
        case " ":
          e.preventDefault();
          controller.toggle();
          break;
        case "ArrowRight":
          controller.stepForward(skipEvent);
          setJumpNonce((n) => n + 1);
          break;
        case "ArrowLeft":
          controller.stepBack(skipEvent);
          setJumpNonce((n) => n + 1);
          break;
        case "Home":
          controller.restart();
          setJumpNonce((n) => n + 1);
          break;
        case "End":
          controller.seekEnd();
          setJumpNonce((n) => n + 1);
          break;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [controller, skipEvent]);

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${drawer.dragging ? "select-none" : ""}`}>
      {present ? (
        <div className="fixed bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full border border-zinc-300 bg-white/85 px-4 py-2 opacity-60 shadow-lg backdrop-blur transition-opacity hover:opacity-100 dark:border-zinc-700 dark:bg-zinc-900/85">
          <ReplayControls controller={controller} state={state} skipEvent={skipEvent} onNavigate={onNavigate} />
        </div>
      ) : (
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-zinc-200 py-2.5 dark:border-zinc-800">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="__prop">Loaded session ({propLog.sessionId})</option>
          {RECORDINGS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
        <div className="flex-1">
          <ReplayControls controller={controller} state={state} skipEvent={skipEvent} onNavigate={onNavigate} />
        </div>
        {/* Radio group: at most one of diagram / frames active. */}
        <button
          type="button"
          onClick={() => setView(view === "diagram" ? null : "diagram")}
          aria-pressed={view === "diagram"}
          title="Render the log as a sequence diagram — who talks to whom"
          className={`rounded-md border px-2.5 py-1 font-mono text-xs ${
            view === "diagram"
              ? "border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
              : "border-zinc-300 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          }`}
        >
          ⇄ Diagram
        </button>
        <button
          type="button"
          onClick={() => setView(view === "frames" ? null : "frames")}
          aria-pressed={view === "frames"}
          title="Show raw JSON-RPC frames"
          className={`rounded-md border px-2.5 py-1 font-mono text-xs ${
            view === "frames"
              ? "border-cyan-500 bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300"
              : "border-zinc-300 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          }`}
        >
          {"{ }"} Raw frames
        </button>
      </div>
      )}
      <div className={`min-h-0 flex-1 pt-3 ${present ? "mx-auto w-full max-w-4xl" : ""}`}>
        {view === "diagram" ? (
          <SequenceDiagram events={timelineEvents} />
        ) : (
          <Timeline
            events={timelineEvents}
            emptyHint="Press ▶ (or space) to start the replay."
            jumpNonce={jumpNonce}
            present={present}
          />
        )}
      </div>
      {view === "frames" && (
        <>
          <div
            onPointerDown={drawer.startDrag}
            onDoubleClick={drawer.reset}
            title="Drag to resize · double-click to reset"
            className={`mt-2 h-1 w-full shrink-0 cursor-row-resize rounded-full ${
              drawer.dragging
                ? "bg-cyan-500"
                : "bg-zinc-200 hover:bg-cyan-400 dark:bg-zinc-800 dark:hover:bg-cyan-600"
            }`}
          />
          <div style={{ height: drawer.height }} className="shrink-0 pt-1">
            <FramesDrawer events={visible} />
          </div>
        </>
      )}
    </div>
  );
}
