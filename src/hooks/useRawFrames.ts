"use client";

import { useEffect, useState } from "react";

/**
 * Radio-style view selection — at most one of Raw frames, Context, Diagram
 * is active. Persisted and shared across live and replay (replay ignores
 * "context", which only exists in live mode).
 */
export type ActiveView = "frames" | "context" | "diagram" | null;

const KEY = "inspector.view";

export function useActiveView(): [ActiveView, (v: ActiveView) => void] {
  const [view, setViewState] = useState<ActiveView>(null);
  useEffect(() => {
    const v = localStorage.getItem(KEY);
    if (v === "frames" || v === "context" || v === "diagram") setViewState(v);
  }, []);
  function setView(v: ActiveView) {
    setViewState(v);
    if (v === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, v);
  }
  return [view, setView];
}

export function isRpcEvent(e: { type: string }): boolean {
  return e.type.startsWith("rpc.");
}
