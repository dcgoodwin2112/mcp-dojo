"use client";

import { useMemo } from "react";
import type { InspectorEvent } from "@/lib/events";
import { JsonBlock } from "./JsonBlock";

type RpcRequest = Extract<InspectorEvent, { type: "rpc.request" }>;
type RpcResponse = Extract<InspectorEvent, { type: "rpc.response" }>;
type RpcNotification = Extract<InspectorEvent, { type: "rpc.notification" }>;

interface Pair {
  key: string;
  seq: number;
  method?: string;
  requestId?: string;
  request?: RpcRequest | RpcNotification;
  response?: RpcResponse;
  notification?: boolean;
}

function Frame({ label, data }: { label: string; data: unknown }) {
  if (data === undefined || data === null) return null;
  return (
    <div>
      <span className="text-[10px] font-semibold uppercase text-zinc-500 dark:text-zinc-400">{label}</span>
      <JsonBlock
        data={data}
        className="mt-0.5 max-h-56 overflow-y-auto whitespace-pre-wrap break-all rounded bg-zinc-100 p-1.5 font-mono text-[11px] leading-relaxed dark:bg-zinc-950"
      />
    </div>
  );
}

/**
 * Raw JSON-RPC drawer: the exchanges, paired request/response by requestId —
 * including the initialize handshake. Teaches the protocol from real frames.
 * A pure rendering of the rpc.* events in the log.
 */
export function FramesDrawer({ events }: { events: InspectorEvent[] }) {
  const pairs = useMemo(() => {
    const byId = new Map<string, Pair>();
    const out: Pair[] = [];
    for (const e of events) {
      if (e.type === "rpc.request" || e.type === "rpc.response") {
        const id = e.requestId ?? `anon-${e.seq}`;
        let p = byId.get(id);
        if (!p) {
          p = { key: id, seq: e.seq, requestId: e.requestId };
          byId.set(id, p);
          out.push(p);
        }
        if (e.type === "rpc.request") {
          p.request = e;
          p.method = e.method ?? p.method;
        } else {
          p.response = e;
        }
      } else if (e.type === "rpc.notification") {
        out.push({
          key: `n-${e.seq}`,
          seq: e.seq,
          method: e.method,
          request: e,
          notification: true,
        });
      }
    }
    return out;
  }, [events]);

  return (
    <div className="flex h-full min-h-0 flex-col rounded-t-md border border-b-0 border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/80">
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-200 px-3 py-1.5 dark:border-zinc-800">
        <span className="font-mono text-xs font-semibold text-zinc-500 dark:text-zinc-400">{"{ }"}</span>
        <span className="text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-400">
          Raw JSON-RPC
        </span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {pairs.length} exchange{pairs.length === 1 ? "" : "s"} · paired by request id
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1.5">
        {pairs.length === 0 ? (
          <p className="py-4 text-center text-xs text-zinc-500 dark:text-zinc-400">No frames yet.</p>
        ) : (
          <ul className="space-y-1">
            {pairs.map((p) => (
              <li key={p.key}>
                <details className="rounded border border-zinc-200 bg-white px-2 py-1 dark:border-zinc-800 dark:bg-zinc-900">
                  <summary className="flex cursor-pointer select-none items-center gap-2 font-mono text-xs">
                    <span className="text-zinc-500 dark:text-zinc-400">{p.notification ? "⋯" : "⇄"}</span>
                    <span className="font-medium">{p.method ?? "(unknown)"}</span>
                    {p.requestId && <span className="text-zinc-500 dark:text-zinc-400">{p.requestId}</span>}
                    {p.notification && (
                      <span className="text-[10px] uppercase text-zinc-500 dark:text-zinc-400">notification</span>
                    )}
                    {p.response?.http && (
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          p.response.http.status >= 200 && p.response.http.status < 300
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                        }`}
                      >
                        HTTP {p.response.http.status}
                      </span>
                    )}
                    {p.response?.http?.sse && (
                      <span className="text-[10px] text-zinc-500 dark:text-zinc-400">SSE</span>
                    )}
                    {!p.response && !p.notification && (
                      <span className="text-[10px] text-zinc-500 dark:text-zinc-400">no response</span>
                    )}
                  </summary>
                  <div className="mt-1.5 space-y-1.5">
                    <Frame label="→ request" data={p.request?.raw} />
                    <Frame label="← response" data={p.response?.raw} />
                    <Frame label="http headers (allowlisted)" data={p.response?.http?.headers} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
