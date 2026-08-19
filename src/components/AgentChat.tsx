"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CapabilityItem } from "@/lib/events";
import type { AgentLoop } from "@/lib/agent";
import {
  acceptValueText,
  computeArgState,
  matchCommands,
  parseSlash,
  type PromptArg,
} from "@/lib/slash";

interface Pending {
  name: string;
  messages: Array<{ role: string; content: string }>;
}

/**
 * Agent chat with inline slash commands (Discord-style), the single surface
 * for prompts:
 *   /expl → Tab completes the command → type args (value typeahead via MCP
 *   completion/complete, Tab accepts) → Enter expands & previews → Enter sends.
 * Args are positional or key=value. Esc cancels the preview.
 */
export function AgentChat({
  loop,
  busy,
  waiting,
  onSend,
  prompts = [],
  prefill,
  onExpandPrompt,
  onSendPrompt,
  completeArg,
}: {
  loop: AgentLoop;
  busy: boolean;
  waiting: boolean;
  onSend: (text: string) => void;
  prompts?: CapabilityItem[];
  prefill?: { text: string; nonce: number } | null;
  onExpandPrompt?: (
    name: string,
    args: Record<string, string>,
  ) => Promise<Array<{ role: string; content: string }> | null>;
  onSendPrompt?: (name: string, text: string) => void;
  completeArg?: (promptName: string, argName: string, value: string) => Promise<string[]>;
}) {
  const [text, setTextState] = useState("");
  const [stepMode, setStepMode] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [pending, setPending] = useState<Pending | null>(null);
  const [expanding, setExpanding] = useState(false);
  const [valueSuggest, setValueSuggest] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function setText(t: string) {
    setTextState(t);
    setPending(null); // editing cancels a pending preview
    setHighlight(0);
  }

  useEffect(() => {
    if (prefill) {
      setTextState(prefill.text);
      setPending(null);
      inputRef.current?.focus();
    }
  }, [prefill]);

  // --- slash parsing (pure logic in @/lib/slash) ---------------------------
  const slash = useMemo(() => parseSlash(text), [text]);

  const activePrompt =
    slash && slash.rest !== null ? (prompts.find((p) => p.name === slash.name) ?? null) : null;
  const argDefs = (activePrompt?.schema as PromptArg[] | undefined) ?? [];

  // Command picker: open until the first space is typed.
  const cmdMatches = useMemo(() => matchCommands(slash, prompts), [slash, prompts]);

  // Argument state: positional or key=value tokens after the command.
  const argState = useMemo(() => {
    if (!activePrompt || slash?.rest === null || slash?.rest === undefined) return null;
    return computeArgState(slash.rest, argDefs);
  }, [activePrompt, slash]);

  // Debounced value completion for the token being typed.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!argState?.currentArg || !completeArg || !activePrompt || pending) {
      setValueSuggest([]);
      return;
    }
    const { currentArg, currentValue } = argState;
    if (currentValue.trim() === "") {
      setValueSuggest([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const vals = await completeArg(activePrompt.name, currentArg.name, currentValue);
      // An exact single match means the value is already complete.
      const useful = vals.length === 1 && vals[0] === currentValue ? [] : vals;
      setValueSuggest(useful.slice(0, 8));
      setHighlight(0);
    }, 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, pending]);

  function acceptCommand(p: CapabilityItem) {
    setText(`/${p.name} `);
  }

  function acceptValue(v: string) {
    setText(acceptValueText(text, v));
    setValueSuggest([]);
  }

  async function expand() {
    if (!activePrompt || !onExpandPrompt || !argState?.requiredFilled || expanding) return;
    setExpanding(true);
    try {
      const messages = await onExpandPrompt(activePrompt.name, argState.map);
      if (messages) setPending({ name: activePrompt.name, messages });
    } finally {
      setExpanding(false);
    }
  }

  function sendPending() {
    if (!pending || !onSendPrompt) return;
    onSendPrompt(pending.name, pending.messages.map((m) => m.content).join("\n\n"));
    setPending(null);
    setTextState("");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      if (pending) {
        e.preventDefault();
        setPending(null);
      } else if (valueSuggest.length > 0) {
        setValueSuggest([]);
      } else if (slash) {
        setText("");
      }
      return;
    }
    const list = cmdMatches.length > 0 ? cmdMatches : valueSuggest;
    if (list.length === 0) {
      // A Tab while the completion fetch is still in flight must not move
      // focus out of the box — swallow it whenever a command is being composed.
      if (e.key === "Tab" && slash) e.preventDefault();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % list.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + list.length) % list.length);
    } else if (e.key === "Tab" || e.key === "Enter") {
      e.preventDefault();
      const i = Math.min(highlight, list.length - 1);
      if (cmdMatches.length > 0) acceptCommand(cmdMatches[i]);
      else acceptValue(valueSuggest[i]);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || expanding) return;
    if (pending) {
      sendPending();
      return;
    }
    if (slash) {
      if (slash.rest !== null) void expand();
      return; // command still being picked → Enter handled in onKeyDown
    }
    if (!text.trim()) return;
    onSend(text.trim());
    setTextState("");
  }

  const buttonLabel = pending ? "Send" : slash ? (expanding ? "Expanding…" : "Preview") : "Send";
  const buttonDisabled =
    busy ||
    expanding ||
    (pending
      ? false
      : slash
        ? slash.rest === null || !activePrompt || !argState?.requiredFilled
        : !text.trim());

  return (
    <div className="space-y-2">
      {pending && (
        <div className="rounded-md border border-amber-300 bg-amber-50/70 p-3 text-xs dark:border-amber-800 dark:bg-amber-950/30">
          <div className="mb-1 flex items-center gap-2">
            <span className="font-semibold uppercase text-amber-700 dark:text-amber-400">
              /{pending.name}
            </span>
            <span className="text-zinc-500 dark:text-zinc-400">expanded — this is what will be sent:</span>
            <button
              type="button"
              onClick={() => setPending(null)}
              className="ml-auto text-zinc-500 dark:text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              ✕ cancel (Esc)
            </button>
          </div>
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {pending.messages.map((m, i) => (
              <p key={i} className="whitespace-pre-wrap">
                <span className="font-semibold">{m.role}:</span> {m.content}
              </p>
            ))}
          </div>
        </div>
      )}
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase text-fuchsia-700 dark:text-fuchsia-400">
          agent
        </span>
        <div className="relative min-w-64 flex-1">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask the model — or / for prompts…"
            aria-label="Ask the model — or type / for prompt commands"
            autoComplete="off"
            className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900 placeholder:text-zinc-500 dark:placeholder:text-zinc-400"
          />
          {(cmdMatches.length > 0 || valueSuggest.length > 0) && !pending && (
            <ul className="absolute left-0 top-full z-20 mt-0.5 w-full overflow-hidden rounded-md border border-amber-300 bg-white shadow-lg dark:border-amber-800 dark:bg-zinc-900">
              {cmdMatches.length > 0
                ? cmdMatches.map((p, i) => (
                    <li key={p.name}>
                      <button
                        type="button"
                        onMouseDown={() => acceptCommand(p)}
                        className={`flex w-full items-baseline gap-2 px-2 py-1 text-left text-xs ${
                          i === highlight
                            ? "bg-amber-100 dark:bg-amber-950/60"
                            : "hover:bg-amber-50 dark:hover:bg-amber-950/30"
                        }`}
                      >
                        <span className="font-mono font-medium">/{p.name}</span>
                        <span className="truncate text-zinc-500 dark:text-zinc-400">{p.description}</span>
                      </button>
                    </li>
                  ))
                : valueSuggest.map((v, i) => (
                    <li key={v}>
                      <button
                        type="button"
                        onMouseDown={() => acceptValue(v)}
                        className={`w-full truncate px-2 py-1 text-left font-mono text-xs ${
                          i === highlight
                            ? "bg-amber-100 dark:bg-amber-950/60"
                            : "hover:bg-amber-50 dark:hover:bg-amber-950/30"
                        }`}
                      >
                        {v}
                      </button>
                    </li>
                  ))}
            </ul>
          )}
        </div>
        <button
          type="submit"
          disabled={buttonDisabled}
          className={`rounded-md px-4 py-1 text-sm font-medium text-white disabled:opacity-50 ${
            pending || slash
              ? "bg-amber-700 hover:bg-amber-800"
              : "bg-fuchsia-700 hover:bg-fuchsia-600"
          }`}
        >
          {buttonLabel}
        </button>
        <label className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
          <input
            type="checkbox"
            checked={stepMode}
            onChange={(e) => {
              setStepMode(e.target.checked);
              loop.stepMode = e.target.checked;
            }}
          />
          pause before each model call
        </label>
        {waiting && (
          <button
            type="button"
            onClick={() => loop.continueStep()}
            className="animate-pulse rounded-md border border-fuchsia-400 px-3 py-1 text-sm font-medium text-fuchsia-700 dark:border-fuchsia-700 dark:text-fuchsia-300"
          >
            Continue ▸
          </button>
        )}
      </form>
      {slash && slash.rest !== null && !pending && (
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
          {!activePrompt ? (
            <>unknown prompt “{slash.name}”</>
          ) : argState?.requiredFilled ? (
            <>all arguments set — Enter to preview</>
          ) : argState?.currentArg ? (
            <>
              <span className="font-mono">
                {argState.currentArg.name}
                {argState.currentArg.required ? "*" : ""}
              </span>
              {argState.currentArg.description && <> — {argState.currentArg.description}</>}
            </>
          ) : null}
        </p>
      )}
    </div>
  );
}
