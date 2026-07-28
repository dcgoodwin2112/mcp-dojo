"use client";

import { useEffect, useRef } from "react";
import { Enso } from "./Logo";

/**
 * Help / welcome dialog. Native <dialog> via showModal() supplies the modal
 * semantics (top layer, focus trap, inert background, Esc → cancel → close).
 * While open, `document.documentElement.dataset.dialogOpen` gates the
 * window-level hotkeys in page.tsx and ReplayView — <dialog> inertness does
 * not block window listeners.
 */

function Key({ children }: { children: string }) {
  return (
    <kbd className="rounded border border-zinc-300 bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
      {children}
    </kbd>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      document.documentElement.dataset.dialogOpen = "1";
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    return () => {
      delete document.documentElement.dataset.dialogOpen;
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-label="Help"
      onClose={() => {
        delete document.documentElement.dataset.dialogOpen;
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      className="max-h-[85dvh] w-[min(34rem,92vw)] overflow-y-auto rounded-lg border border-zinc-200 bg-white p-0 text-zinc-800 backdrop:bg-black/50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 m-auto"
    >
      <div className="space-y-5 p-6 text-sm">
        <div className="flex items-center gap-2.5">
          <Enso className="size-6 shrink-0 text-sky-500" />
          <h2 className="text-base font-semibold">Welcome to MCP Dojo</h2>
          <button
            type="button"
            autoFocus
            onClick={() => ref.current?.close()}
            className="ml-auto rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            ✕ close
          </button>
        </div>

        <Section title="What you're looking at">
          <p className="leading-relaxed text-zinc-600 dark:text-zinc-300">
            MCP Dojo is a practice space for the Model Context Protocol. A recording is a
            real session between a user, a model, an app, and an MCP server — every
            exchange captured in an append-only event log, replayed here exactly as it
            happened.
          </p>
        </Section>

        <Section title="Quick start">
          <ul className="list-disc space-y-1 pl-5 leading-relaxed text-zinc-600 dark:text-zinc-300">
            <li>Press ▶ Play — the log streams in; narration cards pause it at each demo step.</li>
            <li>
              Expand <span className="whitespace-nowrap">"ⓘ what is this?"</span> on any card
              for an explanation with a spec link — amber notes mark behavior the
              2026-07-28 revision changes.
            </li>
            <li>⇄ Diagram redraws the log as a sequence diagram; {"{ }"} Raw JSON-RPC shows the wire frames.</li>
            <li>The picker top-left switches recordings.</li>
          </ul>
        </Section>

        <Section title="Keyboard">
          <p className="space-x-3 leading-loose">
            <span>
              <Key>space</Key> play / pause
            </span>
            <span>
              <Key>←</Key> <Key>→</Key> step
            </span>
            <span>
              <Key>Home</Key> <Key>End</Key> jump
            </span>
            <span>
              <Key>p</Key> presentation mode
            </span>
            <span>
              <Key>Esc</Key> close / exit
            </span>
          </p>
        </Section>

        <Section title="Going further">
          <p className="leading-relaxed text-zinc-600 dark:text-zinc-300">
            ↑ Open log… replays any session saved with ↓ Save .json. Live mode connects to
            MCP servers you run yourself — clone and run locally:
          </p>
          <pre className="mt-2 overflow-x-auto rounded-md bg-zinc-100 p-3 font-mono text-xs text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
            {`git clone https://github.com/dcgoodwin2112/mcp-dojo\ncd mcp-dojo && npm install && npm run dev`}
          </pre>
          <p className="mt-2 text-zinc-600 dark:text-zinc-300">
            Details in the{" "}
            <a
              href="https://github.com/dcgoodwin2112/mcp-dojo#readme"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-sky-700 underline dark:text-sky-400"
            >
              README
            </a>
            .
          </p>
        </Section>
      </div>
    </dialog>
  );
}
