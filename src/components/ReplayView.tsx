"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { EventLog } from "@/lib/events";
import { RECORDINGS } from "@/lib/fixtures";
import { MAX_LOG_BYTES, parseEventLogJson } from "@/lib/log-import";
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
  /** Logs opened from disk this session — never persisted, just EventLogs. */
  const [opened, setOpened] = useState<Array<{ id: string; label: string; log: EventLog }>>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const openedSeq = useRef(0);
  const log =
    selected === "__prop"
      ? propLog
      : (opened.find((o) => o.id === selected)?.log ??
        RECORDINGS.find((r) => r.id === selected)?.log ??
        propLog);

  async function openLogFile(file: File) {
    if (file.size > MAX_LOG_BYTES) {
      setImportError(`${file.name} is larger than ${MAX_LOG_BYTES / 1024 / 1024} MB`);
      return;
    }
    const result = parseEventLogJson(await file.text());
    if (!result.ok) {
      setImportError(`${file.name}: ${result.error}`);
      return;
    }
    const id = `opened-${++openedSeq.current}`;
    setOpened((prev) => [...prev, { id, label: file.name, log: result.log }]);
    setSelected(id);
    setImportError(null);
  }
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
      if (document.documentElement.dataset.dialogOpen) return;
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
    <div
      className={`flex min-h-0 flex-1 flex-col ${drawer.dragging ? "select-none" : ""}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        const file = e.dataTransfer.files?.[0];
        if (file) {
          e.preventDefault();
          void openLogFile(file);
        }
      }}
    >
      {present ? (
        <div className="fixed bottom-4 left-1/2 z-20 max-w-[95vw] -translate-x-1/2 overflow-x-auto rounded-full border border-zinc-300 bg-white/85 px-4 py-2 opacity-60 shadow-lg backdrop-blur transition-opacity hover:opacity-100 dark:border-zinc-700 dark:bg-zinc-900/85">
          <ReplayControls
            controller={controller}
            state={state}
            skipEvent={skipEvent}
            onNavigate={onNavigate}
            nowrap
          />
        </div>
      ) : (
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-zinc-200 py-2.5 dark:border-zinc-800">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="__prop">This session&#39;s recording</option>
          {RECORDINGS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
          {opened.map((o) => (
            <option key={o.id} value={o.id}>
              Opened: {o.label}
            </option>
          ))}
        </select>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void openLogFile(file);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          title="Open a log saved with ↓ Save .json (or drop the file anywhere here)"
          className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          ↑ Open log…
        </button>
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
          title="Show the raw JSON-RPC messages"
          className={`rounded-md border px-2.5 py-1 font-mono text-xs ${
            view === "frames"
              ? "border-cyan-500 bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300"
              : "border-zinc-300 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          }`}
        >
          {"{ }"} Raw JSON-RPC
        </button>
      </div>
      )}
      {importError && (
        <div className="mt-2 flex shrink-0 items-center gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          <span className="min-w-0 flex-1 truncate" title={importError}>
            {importError}
          </span>
          <button
            type="button"
            onClick={() => setImportError(null)}
            className="shrink-0 font-medium hover:underline"
          >
            dismiss
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
