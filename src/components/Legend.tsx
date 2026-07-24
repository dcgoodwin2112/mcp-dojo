import type { Actor, Primitive } from "@/lib/events";
import { PRIMITIVE_STYLES } from "@/lib/ui";
import { ActorBadge } from "./ActorBadge";

/**
 * The app's framing in one panel: MCP's three primitives and who controls
 * each, plus the actor badges the timeline uses. Visible before connecting,
 * so the color language is established before any events stream in.
 */

const PRIMITIVES: Array<{ key: Primitive; control: string; desc: string }> = [
  {
    key: "tool",
    control: "model-controlled",
    desc: "the model decides when to call one, guided by its description and schema",
  },
  {
    key: "resource",
    control: "app-controlled",
    desc: "the app reads data and attaches it to context; the model never fetches these",
  },
  {
    key: "prompt",
    control: "user-controlled",
    desc: "the user invokes them as slash commands and sees the expansion before sending",
  },
];

const ACTORS: Array<{ key: Actor; desc: string }> = [
  { key: "user", desc: "a human clicked or typed" },
  { key: "model", desc: "the LLM decided" },
  { key: "app", desc: "the inspector (the MCP host) acted" },
  { key: "server", desc: "the DKAN MCP server responded" },
];

const ERROR_CHANNELS: Array<{ label: string; dot: string; desc: string }> = [
  {
    label: "tool result",
    dot: "bg-amber-500",
    desc: "the call succeeds; the failure is inside the result data (isError or an error field) — the model sees it and can react",
  },
  {
    label: "JSON-RPC",
    dot: "bg-red-500",
    desc: "the protocol refused (-32602 invalid params, -32002 forbidden) — the app handles it; the model never sees it",
  },
  {
    label: "transport",
    dot: "bg-zinc-500",
    desc: "the HTTP request itself failed — nothing MCP-shaped came back",
  },
];

export function Legend() {
  return (
    <details className="rounded-md border border-zinc-200 dark:border-zinc-800">
      <summary className="cursor-pointer select-none px-3 py-1.5 text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300">
        ⓘ legend — who controls what
      </summary>
      <div className="space-y-2 border-t border-zinc-100 px-3 py-2 dark:border-zinc-800">
        <div className="space-y-1.5">
          {PRIMITIVES.map((p) => {
            const s = PRIMITIVE_STYLES[p.key];
            return (
              <p key={p.key} className={`border-l-2 pl-2 text-xs ${s.border}`}>
                <span className={`font-semibold uppercase ${s.text}`}>{s.label}s</span>{" "}
                <span className="font-medium">· {p.control}</span>
                <span className="block text-zinc-600 dark:text-zinc-400">{p.desc}</span>
              </p>
            );
          })}
        </div>
        <div className="space-y-1 border-t border-zinc-100 pt-2 dark:border-zinc-800">
          {ACTORS.map((a) => (
            <p key={a.key} className="flex items-center gap-2 text-xs">
              <ActorBadge actor={a.key} />
              <span className="text-zinc-600 dark:text-zinc-400">{a.desc}</span>
            </p>
          ))}
        </div>
        <div className="space-y-1.5 border-t border-zinc-100 pt-2 dark:border-zinc-800">
          <p className="text-[10px] font-semibold uppercase text-zinc-500 dark:text-zinc-400">
            when things fail — three channels
          </p>
          {ERROR_CHANNELS.map((c) => (
            <p key={c.label} className="flex items-start gap-2 text-xs">
              <span className={`mt-1 size-1.5 shrink-0 rounded-full ${c.dot}`} />
              <span className="text-zinc-600 dark:text-zinc-400">
                <span className="font-medium text-zinc-800 dark:text-zinc-200">{c.label}</span> —{" "}
                {c.desc}
              </span>
            </p>
          ))}
        </div>
      </div>
    </details>
  );
}
