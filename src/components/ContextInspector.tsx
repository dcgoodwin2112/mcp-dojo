"use client";

import { useState } from "react";
import type { AgentLoop, ContentBlock } from "@/lib/agent";
import type { InspectorEvent } from "@/lib/events";
import { AGENT_SYSTEM_SUMMARY, type LiveSession } from "@/lib/live";
import { ContextMeter } from "./ContextMeter";
import { JsonBlock } from "./JsonBlock";

/**
 * The EXACT context the next model call will send — read live from the agent
 * loop, never a parallel copy. Phase 2 makes it editable: system instructions,
 * resource detach, host-side tool toggles, and clearing history. Every edit
 * is appended to the event log (context.updated / resource.detached).
 */

/** Rough size estimate: ~4 chars per token, labeled as an estimate in the UI. */
function tok(chars: number): string {
  return `~${Math.max(1, Math.round(chars / 4)).toLocaleString()} tok`;
}

function Section({
  title,
  size,
  children,
  action,
  open = false,
}: {
  title: string;
  size: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  open?: boolean;
}) {
  return (
    <details open={open} className="rounded border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <summary className="flex cursor-pointer select-none items-center gap-2 px-2 py-1.5 text-xs">
        <span className="font-semibold">{title}</span>
        <span className="ml-auto flex items-center gap-2">
          {action}
          <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">{size}</span>
        </span>
      </summary>
      <div className="border-t border-zinc-100 px-2 py-1.5 dark:border-zinc-800">{children}</div>
    </details>
  );
}

function SmallBtn({
  onClick,
  disabled,
  children,
  tone = "neutral",
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  tone?: "neutral" | "danger";
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault(); // keep the <summary> from toggling
        e.stopPropagation();
        onClick();
      }}
      className={`rounded border px-1.5 py-0.5 text-[10px] disabled:opacity-40 ${
        tone === "danger"
          ? "border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
          : "border-zinc-300 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
      }`}
    >
      {children}
    </button>
  );
}

function Blocks({ content }: { content: unknown }) {
  if (typeof content === "string") {
    return (
      <pre className="whitespace-pre-wrap break-words rounded bg-zinc-50 p-1.5 font-mono text-[11px] leading-relaxed dark:bg-zinc-950">
        {content}
      </pre>
    );
  }
  const blocks = (content as ContentBlock[]) ?? [];
  return (
    <div className="space-y-1">
      {blocks.map((b, i) => {
        if (b.type === "text") {
          return (
            <pre
              key={i}
              className="whitespace-pre-wrap break-words rounded bg-zinc-50 p-1.5 font-mono text-[11px] leading-relaxed dark:bg-zinc-950"
            >
              {b.text}
            </pre>
          );
        }
        if (b.type === "tool_use") {
          return (
            <div key={i} className="rounded border-l-2 border-cyan-500 bg-zinc-50 p-1.5 dark:bg-zinc-950">
              <span className="font-mono text-[11px] font-semibold">⚙ tool_use · {b.name}</span>
              <JsonBlock
                data={b.input}
                indent={1}
                className="mt-0.5 whitespace-pre-wrap break-all font-mono text-[10px]"
              />
            </div>
          );
        }
        const generic = b as unknown as {
          type: string;
          is_error?: boolean;
          content?: Array<{ text?: string }>;
        };
        if (generic.type === "tool_result") {
          return (
            <div
              key={i}
              className={`rounded border-l-2 p-1.5 ${
                generic.is_error
                  ? "border-red-500 bg-red-50 dark:bg-red-950/30"
                  : "border-emerald-500 bg-zinc-50 dark:bg-zinc-950"
              }`}
            >
              <span className="font-mono text-[11px] font-semibold">
                ↩ tool_result{generic.is_error ? " · error" : ""}
              </span>
              <pre className="mt-0.5 whitespace-pre-wrap break-all font-mono text-[10px]">
                {generic.content?.map((c) => c.text).join("\n") ?? ""}
              </pre>
            </div>
          );
        }
        if (generic.type === "thinking") {
          const think = b as unknown as { thinking?: string };
          return (
            <div key={i} className="rounded border-l-2 border-zinc-400 bg-zinc-50 p-1.5 dark:bg-zinc-950">
              <span className="font-mono text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">✦ thinking</span>
              {think.thinking ? (
                <pre className="mt-0.5 whitespace-pre-wrap break-words font-mono text-[10px]">
                  {think.thinking}
                </pre>
              ) : (
                <span className="ml-1 font-mono text-[10px] text-zinc-500 dark:text-zinc-400">(encrypted — sent back verbatim)</span>
              )}
            </div>
          );
        }
        return (
          <JsonBlock
            key={i}
            data={b}
            indent={1}
            className="whitespace-pre-wrap break-all font-mono text-[10px]"
          />
        );
      })}
    </div>
  );
}

/**
 * "Descriptions are prompts": rewrite what the MODEL reads as a tool's
 * description (host-side only — the server is unchanged), then re-ask a
 * question and watch tool choice change. Edits log context.updated events.
 */
function DescriptionSandbox({ session, busy }: { session: LiveSession; busy: boolean }) {
  const [toolName, setToolName] = useState("");
  const [draft, setDraft] = useState("");

  function select(name: string) {
    setToolName(name);
    setDraft(
      name === "" ? "" : (session.effectiveTools.find((t) => t.name === name)?.description ?? ""),
    );
  }

  const serverDescription = session.toolItems.find((t) => t.name === toolName)?.description ?? "";

  return (
    <div className="mt-2 border-t border-zinc-100 pt-1.5 dark:border-zinc-800">
      <label className="block text-[10px] font-semibold uppercase text-zinc-500 dark:text-zinc-400">
        ✎ rewrite a description — what the model reads
        <select
          value={toolName}
          onChange={(e) => select(e.target.value)}
          className="mt-1 block w-full max-w-72 rounded border border-zinc-300 bg-white px-1.5 py-1 font-mono text-[11px] font-normal normal-case dark:border-zinc-700 dark:bg-zinc-950"
        >
          <option value="">choose a tool…</option>
          {session.toolItems.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
              {session.descriptionOverrides.has(t.name) ? " ✎" : ""}
            </option>
          ))}
        </select>
      </label>
      {toolName !== "" && (
        <div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            aria-label={`Description the model sees for ${toolName}`}
            className="mt-1 w-full rounded border border-zinc-300 bg-white p-1.5 font-mono text-[11px] leading-relaxed dark:border-zinc-700 dark:bg-zinc-950"
          />
          <div className="mt-1 flex gap-1.5">
            <SmallBtn onClick={() => session.overrideToolDescription(toolName, draft)} disabled={busy}>
              save
            </SmallBtn>
            <SmallBtn
              onClick={() => {
                session.overrideToolDescription(toolName, null);
                setDraft(serverDescription);
              }}
              disabled={busy || !session.descriptionOverrides.has(toolName)}
            >
              restore server default
            </SmallBtn>
          </div>
        </div>
      )}
    </div>
  );
}

export function ContextInspector({
  loop,
  session,
  events = [],
  busy = false,
}: {
  loop: AgentLoop;
  session: LiveSession;
  events?: InspectorEvent[];
  busy?: boolean;
}) {
  const [editingSystem, setEditingSystem] = useState<string | null>(null);

  const system = loop.system;
  const messages = loop.getMessages();
  const tools = session.toolItems;
  const activeTools = session.effectiveTools;
  const attached = session.attached;

  const messagesChars = JSON.stringify(messages).length;
  const toolsChars = JSON.stringify(
    activeTools.map((t) => ({ name: t.name, description: t.description, input_schema: t.schema })),
  ).length;
  const totalChars = system.length + messagesChars + toolsChars;

  return (
    <div className="flex h-full min-h-0 flex-col rounded-t-md border border-b-0 border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/80">
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-200 px-3 py-1.5 dark:border-zinc-800">
        <span className="text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-400">Context</span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          what the next model call will send — nothing else exists for the model
        </span>
        <span className="ml-auto font-mono text-[10px] text-zinc-500 dark:text-zinc-400">total {tok(totalChars)}</span>
      </div>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-2 py-1.5">
        <ContextMeter events={events} />
        <Section
          title="System prompt"
          size={tok(system.length)}
          open
          action={
            editingSystem === null ? (
              <SmallBtn onClick={() => setEditingSystem(loop.systemBase)} disabled={busy}>
                ✎ edit
              </SmallBtn>
            ) : undefined
          }
        >
          {editingSystem !== null ? (
            <div>
              <textarea
                value={editingSystem}
                onChange={(e) => setEditingSystem(e.target.value)}
                rows={4}
                className="w-full rounded border border-zinc-300 bg-white p-1.5 font-mono text-[11px] leading-relaxed dark:border-zinc-700 dark:bg-zinc-950"
              />
              <div className="mt-1 flex gap-1.5">
                <SmallBtn
                  onClick={() => {
                    loop.setSystemBase(editingSystem);
                    setEditingSystem(null);
                  }}
                >
                  save
                </SmallBtn>
                <SmallBtn
                  onClick={() => {
                    loop.setSystemBase(AGENT_SYSTEM_SUMMARY);
                    setEditingSystem(null);
                  }}
                >
                  reset to default
                </SmallBtn>
                <SmallBtn onClick={() => setEditingSystem(null)}>cancel</SmallBtn>
              </div>
            </div>
          ) : (
            <div>
              <span className="text-[10px] font-semibold uppercase text-zinc-500 dark:text-zinc-400">
                instructions{loop.systemBase !== AGENT_SYSTEM_SUMMARY ? " · edited" : ""}
              </span>
              <pre className="whitespace-pre-wrap break-words rounded bg-zinc-50 p-1.5 font-mono text-[11px] leading-relaxed dark:bg-zinc-950">
                {loop.systemBase}
              </pre>
            </div>
          )}
          {session.serverInstructions && (
            <div className="mt-1.5">
              <span
                className="text-[10px] font-semibold uppercase text-orange-700 dark:text-orange-400"
                title="Sent by the server in the initialize result — read-only; the host composes it into the system prompt"
              >
                server instructions · from initialize
              </span>
              <pre className="whitespace-pre-wrap break-words rounded border-l-2 border-orange-400 bg-orange-50/50 p-1.5 font-mono text-[11px] leading-relaxed dark:bg-orange-950/20">
                {session.serverInstructions}
              </pre>
            </div>
          )}
          {attached
            .filter((a) => a.text)
            .map((a) => (
              <div key={a.uri} className="mt-1.5">
                <span className="flex items-center gap-2 text-[10px] font-semibold uppercase text-indigo-600 dark:text-indigo-400">
                  attached data · {a.uri}
                  <SmallBtn onClick={() => session.detachResource(a.uri)} disabled={busy} tone="danger">
                    ✕ detach
                  </SmallBtn>
                </span>
                <pre className="whitespace-pre-wrap break-words rounded border-l-2 border-indigo-400 bg-indigo-50/50 p-1.5 font-mono text-[11px] leading-relaxed dark:bg-indigo-950/20">
                  {a.text}
                </pre>
              </div>
            ))}
        </Section>

        <Section
          title={`Conversation (${messages.length} message${messages.length === 1 ? "" : "s"})`}
          size={tok(messagesChars)}
          action={
            messages.length > 0 ? (
              <SmallBtn onClick={() => loop.clearConversation()} disabled={busy} tone="danger">
                clear
              </SmallBtn>
            ) : undefined
          }
        >
          {messages.length === 0 ? (
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              No conversation yet — the model has not been called this session.
            </p>
          ) : (
            <div className="space-y-1.5">
              {messages.map((m, i) => (
                <div key={i}>
                  <span
                    className={`text-[10px] font-semibold uppercase ${
                      m.role === "user"
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-fuchsia-700 dark:text-fuchsia-400"
                    }`}
                  >
                    {m.role}
                  </span>
                  <Blocks content={m.content} />
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section
          title={`Tool definitions (${activeTools.length} of ${tools.length} active)`}
          size={tok(toolsChars)}
        >
          <div className="flex flex-wrap gap-1">
            {tools.map((t) => {
              const off = session.disabledTools.has(t.name);
              const edited = session.descriptionOverrides.has(t.name);
              return (
                <button
                  key={t.name}
                  type="button"
                  disabled={busy}
                  onClick={() => session.toggleTool(t.name)}
                  aria-pressed={!off}
                  title={
                    off
                      ? "hidden from the model — click to re-enable"
                      : edited
                        ? "description rewritten for the model — click to disable"
                        : t.description
                  }
                  className={`rounded border px-1.5 py-0.5 font-mono text-[11px] disabled:opacity-40 ${
                    off
                      ? "border-zinc-200 text-zinc-500 dark:text-zinc-400 line-through opacity-60 dark:border-zinc-800"
                      : edited
                        ? "border-amber-400 hover:bg-zinc-100 dark:border-amber-700 dark:hover:bg-zinc-800"
                        : "border-zinc-200 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  }`}
                >
                  {t.name}
                  {edited && <span className="text-amber-600 dark:text-amber-400"> ✎</span>}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">
            click to toggle what the MODEL sees — the server still lists all{" "}
            {tools.length}, and manual mode can call any of them
          </p>
          <DescriptionSandbox session={session} busy={busy} />
        </Section>
      </div>
    </div>
  );
}
