"use client";

import { useEffect, useState } from "react";
import type { EventLog } from "@/lib/events";
import { RECORDINGS } from "@/lib/fixtures";
import { LiveView } from "@/components/LiveView";
import { ReplayView } from "@/components/ReplayView";

type Mode = "live" | "replay";

export default function Home() {
  const [mode, setMode] = useState<Mode>("live");
  const [replayLog, setReplayLog] = useState<EventLog | null>(null);
  const [present, setPresent] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLElement && /^(input|textarea|select)$/i.test(e.target.tagName)) {
        return;
      }
      if (e.key === "p") setPresent((v) => !v);
      if (e.key === "Escape") setPresent(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("presenting", present);
  }, [present]);

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden px-4">
      {!present && (
        <header className="flex shrink-0 items-center gap-3 border-b border-zinc-200 py-2.5 dark:border-zinc-800">
          <h1 className="text-lg font-semibold">MCP Lens</h1>
          <div className="flex rounded-md border border-zinc-300 p-0.5 dark:border-zinc-700">
            {(["live", "replay"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={`rounded px-3 py-0.5 text-xs font-semibold uppercase ${
                  mode === m
                    ? m === "live"
                      ? "bg-emerald-700 text-white"
                      : "bg-violet-600 text-white"
                    : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setPresent(true)}
            title="Presentation mode (p)"
            className="ml-auto rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            ⊡ Present
          </button>
        </header>
      )}
      {present && (
        <button
          type="button"
          onClick={() => setPresent(false)}
          title="Exit presentation (Esc)"
          className="fixed right-3 top-3 z-30 rounded-full border border-zinc-300 bg-white/70 px-3 py-1 text-xs text-zinc-500 opacity-40 backdrop-blur transition-opacity hover:opacity-100 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-400"
        >
          ✕ Esc
        </button>
      )}
      <div className={mode === "live" ? "flex min-h-0 flex-1" : "hidden"}>
        <LiveView
          present={present}
          onReplay={(log) => {
            setReplayLog(log);
            setMode("replay");
          }}
        />
      </div>
      {mode === "replay" && (
        <ReplayView log={replayLog ?? RECORDINGS[0].log} present={present} />
      )}
    </div>
  );
}
