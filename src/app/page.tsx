"use client";

import { useEffect, useState } from "react";
import type { EventLog } from "@/lib/events";
import { RECORDINGS } from "@/lib/fixtures";
import { HelpDialog } from "@/components/HelpDialog";
import { LiveView } from "@/components/LiveView";
import { Logo } from "@/components/Logo";
import { ReplayView } from "@/components/ReplayView";
import { RunLocallyCard } from "@/components/RunLocallyCard";
import { REPLAY_ONLY } from "@/lib/replay-only";

type Mode = "live" | "replay";

// localStorage can throw in restricted modes — degrade to showing the
// hosted welcome once per page load.
function readHelpSeen(): string | null {
  try {
    return localStorage.getItem("inspector.helpSeen");
  } catch {
    return null;
  }
}
function markHelpSeen(): void {
  try {
    localStorage.setItem("inspector.helpSeen", "1");
  } catch {
    // best effort
  }
}

export default function Home() {
  const [mode, setMode] = useState<Mode>(REPLAY_ONLY ? "replay" : "live");
  const [replayLog, setReplayLog] = useState<EventLog | null>(null);
  const [present, setPresent] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // Hosted first visit: the help dialog is the welcome screen. Decided in
  // an effect so the prerendered output stays deterministic.
  useEffect(() => {
    if (REPLAY_ONLY && readHelpSeen() !== "1") setHelpOpen(true);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (document.documentElement.dataset.dialogOpen) return;
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
          <Logo className="size-7 shrink-0" />
          <h1 className="text-lg font-semibold">MCP Dojo</h1>
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
          <span className="hidden text-sm text-zinc-400 dark:text-zinc-500 lg:inline">
            a practice space for the Model Context Protocol
          </span>
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            title="Help — what is this?"
            className="ml-auto rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            ? Help
          </button>
          <button
            type="button"
            onClick={() => setPresent(true)}
            title="Presentation mode (p)"
            className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            ⊡ Present
          </button>
        </header>
      )}
      {present && (
        <>
          <button
            type="button"
            onClick={() => setPresent(false)}
            title="Exit presentation (Esc)"
            className="fixed right-3 top-3 z-30 rounded-full border border-zinc-300 bg-white/70 px-3 py-1 text-xs text-zinc-500 opacity-40 backdrop-blur transition-opacity hover:opacity-100 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-400"
          >
            ✕ Esc
          </button>
          <div className="pointer-events-none fixed bottom-3 left-3 z-30 flex items-center gap-1.5 opacity-40">
            <Logo className="size-4" />
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">mcpdojo.dev</span>
          </div>
        </>
      )}
      {REPLAY_ONLY ? (
        mode === "live" && <RunLocallyCard />
      ) : (
        <div className={mode === "live" ? "flex min-h-0 flex-1" : "hidden"}>
          <LiveView
            present={present}
            onReplay={(log) => {
              setReplayLog(log);
              setMode("replay");
            }}
          />
        </div>
      )}
      {mode === "replay" && (
        <ReplayView log={replayLog ?? RECORDINGS[0].log} present={present} />
      )}
      <HelpDialog
        open={helpOpen}
        onClose={() => {
          markHelpSeen();
          setHelpOpen(false);
        }}
      />
    </div>
  );
}
