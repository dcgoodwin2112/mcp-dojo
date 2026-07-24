"use client";

import { useMemo, useRef, useState } from "react";
import type { CapabilityItem } from "@/lib/events";
import type { ResourceContent } from "@/lib/live";

/**
 * App-controlled primitive, browsable: templated URIs get inputs for their
 * {vars}; Preview reads the resource (logged as resource.read) and shows its
 * contents; Attach adds it to the model's context — reusing the previewed
 * read, no second fetch. The attached list shows what the model will receive.
 */

function ContentView({ blocks }: { blocks: ResourceContent[] }) {
  return (
    <div className="mt-2 space-y-1.5">
      {blocks.map((b, i) => {
        let pretty = b.text ?? "(no text content)";
        try {
          pretty = JSON.stringify(JSON.parse(b.text ?? ""), null, 2);
        } catch {
          /* not JSON — show as-is */
        }
        return (
          <div key={i}>
            <span className="text-[10px] uppercase text-zinc-500 dark:text-zinc-400">
              {b.mimeType ?? "content"} · {b.uri}
            </span>
            <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap break-all rounded bg-zinc-100 p-1.5 font-mono text-[11px] leading-relaxed dark:bg-zinc-950">
              {pretty}
            </pre>
          </div>
        );
      })}
    </div>
  );
}

export function ResourceBrowser({
  resource,
  busy,
  attached,
  onPreview,
  onAttach,
  onClose,
  onComplete,
}: {
  resource: CapabilityItem;
  busy: boolean;
  attached: Array<{ uri: string; name: string }>;
  onPreview: (uri: string) => Promise<{ contents: ResourceContent[] } | { error: string }>;
  onAttach: (uri: string, name: string, previewed: ResourceContent[] | null) => void;
  onClose: () => void;
  /** MCP completion/complete for a template variable (ref/resource). */
  onComplete?: (argName: string, value: string) => Promise<string[]>;
}) {
  const vars = useMemo(
    () => [...(resource.uriTemplate ?? "").matchAll(/\{(\w+)\}/g)].map((m) => m[1]),
    [resource.uriTemplate],
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{ uri: string; blocks: ResourceContent[] } | null>(null);
  const [previewError, setPreviewError] = useState<{ uri: string; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  /** Value typeahead for template {vars} via MCP completion/complete. */
  const [sugVar, setSugVar] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [highlight, setHighlight] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function fetchSuggestions(varName: string, value: string) {
    if (!onComplete) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // Empty input completes immediately (the server suggests all values).
    debounceRef.current = setTimeout(
      async () => {
        const vals = await onComplete(varName, value);
        const useful = vals.length === 1 && vals[0] === value ? [] : vals;
        setSuggestions(useful);
        setHighlight(0);
      },
      value === "" ? 0 : 300,
    );
  }

  function acceptSuggestion(varName: string, v: string) {
    setValues((s) => ({ ...s, [varName]: v }));
    setSuggestions([]);
    setSugVar(null);
  }

  function onVarKeyDown(e: React.KeyboardEvent, varName: string) {
    if (sugVar !== varName || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Tab" || e.key === "Enter") {
      e.preventDefault();
      acceptSuggestion(varName, suggestions[Math.min(highlight, suggestions.length - 1)]);
    } else if (e.key === "Escape") {
      setSuggestions([]);
      setSugVar(null);
    }
  }

  const uri = resource.isTemplate
    ? vars.reduce(
        (u, v) => u.replace(`{${v}}`, values[v] ?? `{${v}}`),
        resource.uriTemplate ?? resource.name,
      )
    : resource.name;
  const ready = !resource.isTemplate || vars.every((v) => values[v]?.trim());
  const name = resource.title ?? resource.name;
  const isAttached = attached.some((a) => a.uri === uri);
  const currentPreview = preview?.uri === uri ? preview.blocks : null;
  const currentError = previewError?.uri === uri ? previewError.message : null;

  async function doPreview() {
    if (!ready || loading) return;
    setLoading(true);
    try {
      const r = await onPreview(uri);
      if ("contents" in r) {
        setPreview({ uri, blocks: r.contents });
        setPreviewError(null);
      } else {
        setPreviewError({ uri, message: r.error });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-md border border-indigo-300 bg-indigo-50/50 p-3 dark:border-indigo-900 dark:bg-indigo-950/20">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-semibold uppercase text-indigo-700 dark:text-indigo-400">
          resource
        </span>
        <span className="min-w-0 truncate font-mono text-sm font-medium">{uri}</span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto shrink-0 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
        >
          ✕ close
        </button>
      </div>
      {resource.description && (
        <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">{resource.description}</p>
      )}
      {vars.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {vars.map((v) => (
            <label key={v} className="block text-xs">
              <span className="font-mono">{`{${v}}`}</span>
              <div className="relative">
                <input
                  type="text"
                  value={values[v] ?? ""}
                  aria-label={`Value for template variable ${v}`}
                  autoComplete="off"
                  onChange={(e) => {
                    setValues((s) => ({ ...s, [v]: e.target.value }));
                    setSugVar(v);
                    fetchSuggestions(v, e.target.value);
                  }}
                  onFocus={() => {
                    setSugVar(v);
                    fetchSuggestions(v, values[v] ?? "");
                  }}
                  onBlur={() => {
                    // mousedown on a suggestion fires before blur, so accepts win.
                    if (debounceRef.current) clearTimeout(debounceRef.current);
                    setSuggestions([]);
                    setSugVar(null);
                  }}
                  onKeyDown={(e) => onVarKeyDown(e, v)}
                  className="mt-1 w-full rounded border border-zinc-300 bg-white p-1.5 font-mono dark:border-zinc-700 dark:bg-zinc-900 placeholder:text-zinc-500 dark:placeholder:text-zinc-400"
                />
                {sugVar === v && suggestions.length > 0 && (
                  <ul className="absolute left-0 top-full z-20 mt-0.5 max-h-48 w-full overflow-y-auto rounded-md border border-indigo-300 bg-white shadow-lg dark:border-indigo-800 dark:bg-zinc-900">
                    {suggestions.map((s, i) => (
                      <li key={s}>
                        <button
                          type="button"
                          onMouseDown={() => acceptSuggestion(v, s)}
                          className={`w-full truncate px-2 py-1 text-left font-mono text-xs ${
                            i === highlight
                              ? "bg-indigo-100 dark:bg-indigo-950/60"
                              : "hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
                          }`}
                        >
                          {s}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </label>
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void doPreview()}
          disabled={busy || loading || !ready}
          className="rounded-md border border-indigo-500 px-4 py-1 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 dark:text-indigo-300 dark:hover:bg-indigo-950/60"
        >
          {loading ? "Reading…" : "Preview"}
        </button>
        <button
          type="button"
          onClick={() => onAttach(uri, name, currentPreview)}
          disabled={busy || !ready || isAttached}
          className="rounded-md bg-indigo-700 px-4 py-1 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-50"
        >
          {isAttached ? "Attached ✓" : "Attach to context"}
        </button>
      </div>

      {currentError && (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-800 dark:bg-red-950/50 dark:text-red-300">
          ✗ {currentError}
        </p>
      )}

      {currentPreview && <ContentView blocks={currentPreview} />}

      {attached.length > 0 && (
        <div className="mt-3 border-t border-indigo-200 pt-2 dark:border-indigo-900">
          <span className="text-[10px] font-semibold uppercase text-zinc-500 dark:text-zinc-400">
            attached to context ({attached.length})
          </span>
          <div className="mt-1 flex flex-wrap gap-1">
            {attached.map((a) => (
              <span
                key={a.uri}
                title={a.uri}
                className="rounded bg-indigo-100 px-1.5 py-0.5 font-mono text-[11px] text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300"
              >
                {a.uri}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
