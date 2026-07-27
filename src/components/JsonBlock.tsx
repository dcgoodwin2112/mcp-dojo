"use client";

import { useMemo } from "react";
import { tokenizeJson, type JsonTokenType } from "@/lib/json-highlight";

const TOKEN_STYLES: Record<JsonTokenType, string> = {
  key: "text-sky-700 dark:text-sky-400",
  string: "text-emerald-700 dark:text-emerald-400",
  number: "text-amber-700 dark:text-amber-400",
  literal: "text-purple-700 dark:text-purple-400",
  punct: "text-zinc-500 dark:text-zinc-400",
};

/**
 * Syntax-highlighted JSON <pre>. Callers pass their own className for
 * sizing/background; wrapping and scroll behavior stay with the caller.
 */
export function JsonBlock({
  data,
  indent = 2,
  className,
}: {
  data: unknown;
  indent?: number;
  className?: string;
}) {
  const tokens = useMemo(
    () => tokenizeJson(JSON.stringify(data, null, indent) ?? ""),
    [data, indent],
  );
  return (
    <pre className={className}>
      {tokens.map((t, i) => (
        <span key={i} className={TOKEN_STYLES[t.type]}>
          {t.text}
        </span>
      ))}
    </pre>
  );
}
