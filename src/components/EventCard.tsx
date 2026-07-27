"use client";

import { useState } from "react";
import type { CapabilityItem, InspectorEvent, Primitive } from "@/lib/events";
import { specNote, type SpecNote } from "@/lib/spec-notes";
import { inBandError } from "@/lib/tool-result";
import type { CapabilitiesListed } from "@/lib/timeline-rows";
import { PRIMITIVE_STYLES } from "@/lib/ui";
import { JsonBlock } from "./JsonBlock";
import { Markdown } from "./Markdown";

function CapChips({ items }: { items: CapabilityItem[] }) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item.name}
          className={`rounded border border-zinc-200 px-1.5 py-0.5 font-mono text-xs dark:border-zinc-700 ${
            item.isTemplate ? "italic" : ""
          }`}
          title={item.description}
        >
          {item.name}
        </span>
      ))}
    </div>
  );
}

function Json({ data }: { data: unknown }) {
  // Long escaped-JSON strings render as one huge line — wrap them and cap the
  // block's height with its own scrollbar so everything stays reachable.
  return (
    <JsonBlock
      data={data}
      className="mt-1 max-h-72 overflow-y-auto whitespace-pre-wrap break-all rounded bg-zinc-100 p-2 font-mono text-xs leading-relaxed dark:bg-zinc-900"
    />
  );
}

function Raw({ summary, data }: { summary: string; data: unknown }) {
  return (
    <details className="mt-1">
      <summary className="cursor-pointer select-none text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300">
        {summary}
      </summary>
      <Json data={data} />
    </details>
  );
}

/**
 * Tool-result views: the text the model reads, the structuredContent that
 * mirrors it, the outputSchema it promises to match, and the raw frame.
 */
function ResultTabs({ result, outputSchema }: { result: unknown; outputSchema?: unknown }) {
  const r = result as
    | { content?: Array<{ type: string; text?: string }>; structuredContent?: unknown }
    | undefined;
  const text = (r?.content ?? [])
    .map((c) => c.text ?? "")
    .filter(Boolean)
    .join("\n");
  const tabs = [
    { id: "text", label: "text content", show: true },
    { id: "structured", label: "structuredContent", show: r?.structuredContent !== undefined },
    { id: "schema", label: "outputSchema", show: outputSchema !== undefined },
    { id: "raw", label: "raw result", show: true },
  ].filter((t) => t.show);
  const [tab, setTab] = useState("text");
  const active = tabs.some((t) => t.id === tab) ? tab : "text";
  return (
    <details className="mt-1">
      <summary className="cursor-pointer select-none text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300">
        result
      </summary>
      <div className="mt-1 flex flex-wrap gap-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-pressed={active === t.id}
            className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${
              active === t.id
                ? "border-cyan-500 bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300"
                : "border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {active === "text" ? (
        <pre className="mt-1 max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded bg-zinc-100 p-2 font-mono text-xs leading-relaxed dark:bg-zinc-900">
          {text || "(no text content)"}
        </pre>
      ) : active === "structured" ? (
        <Json data={r?.structuredContent} />
      ) : active === "schema" ? (
        <Json data={outputSchema} />
      ) : (
        <Json data={result} />
      )}
    </details>
  );
}

function PrimitiveTag({ primitive }: { primitive: Primitive }) {
  const s = PRIMITIVE_STYLES[primitive];
  return <span className={`text-xs font-semibold uppercase ${s.text}`}>{s.label}</span>;
}

function Card({
  primitive,
  tone,
  info,
  children,
}: {
  primitive?: Primitive;
  tone?: "error" | "system";
  info?: SpecNote;
  children: React.ReactNode;
}) {
  const border = primitive ? `border-l-2 ${PRIMITIVE_STYLES[primitive].border}` : "";
  const toneCls =
    tone === "error"
      ? "border border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40"
      : tone === "system"
        ? "bg-zinc-50 dark:bg-zinc-900/60"
        : "bg-white shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800";
  return (
    <div className={`rounded-md px-3 py-2 text-sm ${toneCls} ${border}`}>
      {children}
      {info && (
        <details className="mt-1">
          <summary className="cursor-pointer select-none text-[10px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300">
            ⓘ what is this?
          </summary>
          <p className="mt-0.5 max-w-prose text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
            {info.text}
            {info.href && (
              <>
                {" "}
                <a
                  href={info.href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-cyan-700 underline dark:text-cyan-400"
                >
                  spec →
                </a>
              </>
            )}
          </p>
        </details>
      )}
    </div>
  );
}

function HttpStatus({ status }: { status: number }) {
  const ok = status >= 200 && status < 300;
  return (
    <span
      className={`rounded px-1.5 py-0.5 font-mono text-xs font-semibold ${
        ok
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
          : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
      }`}
    >
      HTTP {status}
    </span>
  );
}

export function EventCard({
  event,
  mergedTemplates,
  compact = false,
}: {
  event: InspectorEvent;
  /** For a direct-resources listing: the templates listing folded into it. */
  mergedTemplates?: CapabilitiesListed;
  /** Repeat listing (persona switch) — render as a collapsed summary. */
  compact?: boolean;
}) {
  const info = specNote(event);
  switch (event.type) {
    case "session.started":
      return (
        <Card info={info} tone="system">
          <span className="font-medium">Session started</span> — profile{" "}
          <span className="font-medium">{event.profile}</span>{" "}
          <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{event.serverUrl}</span>{" "}
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            ({event.transport}, {event.mode})
          </span>
        </Card>
      );

    case "session.ended":
      return (
        <Card info={info} tone="system">
          <span className="font-medium">Session ended</span>{" "}
          <span className="text-xs text-zinc-500 dark:text-zinc-400">({event.reason})</span>
        </Card>
      );

    case "mcp.initialized":
      return (
        <Card info={info} tone="system">
          <span className="font-medium">MCP initialized</span> — {event.serverInfo.name} v
          {event.serverInfo.version}
          {event.mcpSessionId && (
            <span className="ml-2 font-mono text-xs text-zinc-500 dark:text-zinc-400">{event.mcpSessionId}</span>
          )}
          {event.instructions && (
            <details className="mt-1">
              <summary className="cursor-pointer select-none text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300">
                instructions — server guidance, folded into the model&apos;s system prompt
              </summary>
              <pre className="mt-1 max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded bg-zinc-100 p-2 font-mono text-xs leading-relaxed dark:bg-zinc-900">
                {event.instructions}
              </pre>
            </details>
          )}
          <Raw summary="capabilities" data={event.capabilities} />
        </Card>
      );

    case "auth.persona.selected":
      return (
        <Card info={info} tone="system">
          Persona selected: <span className="font-medium">{event.label}</span>
        </Card>
      );

    case "auth.oauth.step":
      return (
        <Card info={info} tone="system">
          OAuth <span className="font-mono text-xs">{event.step}</span>
          {event.detail && <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">{event.detail}</span>}
        </Card>
      );

    case "auth.token.received":
      return (
        <Card info={info} tone="system">
          Token received — scopes{" "}
          <span className="font-mono text-xs">{event.scopes.join(", ")}</span>
          <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">
            expires {new Date(event.expiresAt).toLocaleTimeString()}
          </span>
          <span className="ml-2 rounded bg-zinc-200 px-1 font-mono text-xs dark:bg-zinc-700">
            {event.tokenPreview}
          </span>
        </Card>
      );

    case "capabilities.listed": {
      const s = PRIMITIVE_STYLES[event.primitive];
      const items = mergedTemplates ? [...event.items, ...mergedTemplates.items] : event.items;
      const title = (
        <>
          <span className="font-medium">
            {items.length} {s.label}
            {items.length === 1 ? "" : "s"} listed
          </span>{" "}
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            persona: {event.persona}
            {mergedTemplates && (
              <>
                {" "}
                · {event.items.length} direct + {mergedTemplates.items.length} templates
              </>
            )}
          </span>
        </>
      );
      if (compact) {
        return (
          <Card info={info} primitive={event.primitive}>
            <details>
              <summary className="cursor-pointer select-none">
                {title} <span className="text-xs text-zinc-500 dark:text-zinc-400">· re-listed</span>
              </summary>
              <CapChips items={items} />
            </details>
          </Card>
        );
      }
      return (
        <Card info={info} primitive={event.primitive}>
          {title}
          <CapChips items={items} />
        </Card>
      );
    }

    case "turn.started":
      return (
        <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
          {event.turnId} · {event.trigger}
          <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
        </div>
      );

    case "user.message":
      return (
        <Card info={info}>
          <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            user
          </span>
          <p className="mt-0.5">{event.text}</p>
        </Card>
      );

    case "model.text":
      return (
        <Card info={info}>
          <span className="text-xs font-semibold text-fuchsia-700 dark:text-fuchsia-400">
            model
          </span>
          <div className="mt-0.5">
            <Markdown>{event.text}</Markdown>
          </div>
        </Card>
      );

    case "context.snapshot":
      return (
        <Card info={info} tone="system">
          <span className="font-medium">Context snapshot</span>{" "}
          <span className="text-xs text-zinc-500 dark:text-zinc-400">what the model receives · {event.turnId}</span>
          <ul className="mt-1 space-y-0.5 text-xs">
            {event.blocks.map((b, i) => (
              <li key={i} className="text-zinc-600 dark:text-zinc-400">
                {b.kind === "system" && <>§ system: {b.summary}</>}
                {b.kind === "message" && (
                  <>
                    ↳ {b.role}: {b.summary}
                  </>
                )}
                {b.kind === "tool_definitions" && (
                  <>
                    ⚙ {b.count} tool definitions:{" "}
                    <span className="font-mono">{b.names.join(", ")}</span>
                  </>
                )}
                {b.kind === "attached_resource" && (
                  <>
                    ⊕ resource: {b.name} <span className="font-mono">{b.uri}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </Card>
      );

    case "tool.call.requested":
      return (
        <Card info={info} primitive="tool">
          <div className="flex items-center gap-2">
            <PrimitiveTag primitive="tool" />
            <span className="font-mono font-medium">{event.toolName}</span>
            {event.turnId === undefined && (
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                manual
              </span>
            )}
          </div>
          <Json data={event.args} />
        </Card>
      );

    case "tool.call.completed": {
      const inBand = inBandError(event.result);
      return (
        <Card info={info} primitive="tool" tone={event.isError ? "error" : undefined}>
          <div className="flex flex-wrap items-center gap-2">
            <PrimitiveTag primitive="tool" />
            <span className="font-mono font-medium">{event.toolName}</span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">{event.latencyMs} ms</span>
            {event.isError ? (
              <span className="text-xs font-semibold text-red-600 dark:text-red-400">
                isError
              </span>
            ) : (
              <span className="text-xs text-emerald-600 dark:text-emerald-400">✓</span>
            )}
            {!event.isError && inBand !== undefined && (
              <span
                title={inBand}
                className="rounded bg-amber-100 px-1 py-0.5 font-mono text-[10px] text-amber-800 dark:bg-amber-950 dark:text-amber-300"
              >
                error inside the result — call succeeded
              </span>
            )}
          </div>
          <ResultTabs result={event.result} outputSchema={event.outputSchema} />
        </Card>
      );
    }

    case "resource.read":
      return (
        <Card info={info} primitive="resource">
          <PrimitiveTag primitive="resource" />{" "}
          <span className="font-mono font-medium">{event.uri}</span>{" "}
          <span className="text-xs text-zinc-500 dark:text-zinc-400">{event.latencyMs} ms</span>
          <Raw summary="contents" data={event.contents} />
        </Card>
      );

    case "resource.attached":
      return (
        <Card info={info} primitive="resource">
          <PrimitiveTag primitive="resource" /> attached:{" "}
          <span className="font-medium">{event.name}</span>{" "}
          <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{event.uri}</span>
        </Card>
      );

    case "resource.detached":
      return (
        <Card info={info} primitive="resource">
          <PrimitiveTag primitive="resource" /> detached:{" "}
          <span className="font-medium line-through">{event.name}</span>{" "}
          <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{event.uri}</span>
        </Card>
      );

    case "context.updated":
      return (
        <Card info={info} tone="system">
          <span className="font-medium">Context updated</span>{" "}
          <span className="text-xs text-zinc-500 dark:text-zinc-400">({event.field})</span> — {event.detail}
          {event.text !== undefined && <Raw summary="new value" data={event.text} />}
        </Card>
      );

    case "prompt.invoked":
      return (
        <Card info={info} primitive="prompt">
          <PrimitiveTag primitive="prompt" />{" "}
          <span className="font-mono font-medium">{event.promptName}</span>
          <Json data={event.args} />
        </Card>
      );

    case "prompt.expanded":
      return (
        <Card info={info} primitive="prompt">
          <PrimitiveTag primitive="prompt" />{" "}
          <span className="font-mono font-medium">{event.promptName}</span>{" "}
          <span className="text-xs text-zinc-500 dark:text-zinc-400">expanded — shown before send</span>
          <div className="mt-1 space-y-1">
            {event.messages.map((m, i) => (
              <p key={i} className="text-xs">
                <span className="font-semibold">{m.role}:</span> {m.content}
              </p>
            ))}
          </div>
        </Card>
      );

    case "rpc.request":
    case "rpc.response":
    case "rpc.notification":
      return (
        <div className="rounded border border-dashed border-zinc-300 px-3 py-1.5 font-mono text-xs text-zinc-500 dark:text-zinc-400 dark:border-zinc-700">
          <span className="flex items-center gap-2">
            <span>{event.type === "rpc.request" ? "→" : event.type === "rpc.response" ? "←" : "⋯"}</span>
            <span>{event.type}</span>
            {event.method && <span className="text-zinc-500 dark:text-zinc-400">{event.method}</span>}
            {event.requestId && <span className="text-zinc-500 dark:text-zinc-400">{event.requestId}</span>}
            {event.type === "rpc.response" && event.http && (
              <>
                <HttpStatus status={event.http.status} />
                {event.http.sse && <span className="text-zinc-500 dark:text-zinc-400">SSE</span>}
              </>
            )}
          </span>
          <Raw summary="frame" data={event.raw} />
          {event.type === "rpc.response" && event.http && (
            <Raw summary="http headers" data={event.http.headers} />
          )}
        </div>
      );

    case "error":
      return (
        <Card info={info} tone="error">
          <span className="font-semibold text-red-700 dark:text-red-400">Error</span>{" "}
          <span className="text-xs text-zinc-500 dark:text-zinc-400">({event.scope})</span>
          <div className="mt-1 flex items-center gap-2">
            {event.httpStatus !== undefined && <HttpStatus status={event.httpStatus} />}
            {event.code !== undefined && (
              <span className="font-mono text-xs">code {event.code}</span>
            )}
            <span className="font-mono text-sm">{event.message}</span>
          </div>
        </Card>
      );

    case "annotation":
      return (
        <div className="annotation-card rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
          <span className="mr-2">¶</span>
          {event.text}
          {event.pauseOnReplay && (
            <span className="ml-2 rounded bg-amber-200 px-1.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900 dark:text-amber-200">
              replay pauses here
            </span>
          )}
        </div>
      );
  }
}
