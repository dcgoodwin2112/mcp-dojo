"use client";

import { useState } from "react";
import type { CapabilityItem } from "@/lib/events";
import { PRIMITIVE_STYLES } from "@/lib/ui";
import { AnnotationChips } from "./AnnotationChips";
import { JsonBlock } from "./JsonBlock";

/** Curated subset shown by default — 38 tools is too many for one screen. */
const DEMO_TOOLS = new Set([
  "search_datasets",
  "get_dataset",
  "query_datastore",
  "get_catalog",
  "update_dataset",
  "patch_dataset",
]);

function Column({
  title,
  primitive,
  items,
  onSelect,
  selected,
}: {
  title: string;
  primitive: "tool" | "resource" | "prompt";
  items: CapabilityItem[];
  onSelect?: (item: CapabilityItem) => void;
  selected?: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const [openSchema, setOpenSchema] = useState<string | null>(null);
  const s = PRIMITIVE_STYLES[primitive];
  const curated =
    primitive === "tool" && !showAll ? items.filter((i) => DEMO_TOOLS.has(i.name)) : items;
  const hiddenCount = items.length - curated.length;

  return (
    <div className={`rounded-md border-t-2 ${s.border.replace("border-l-", "border-t-")} bg-zinc-50 p-2 dark:bg-zinc-900/60`}>
      <h3 className={`mb-1.5 text-xs font-semibold uppercase ${s.text}`}>
        {title} <span className="font-normal text-zinc-500 dark:text-zinc-400">({items.length})</span>
      </h3>
      <ul className="space-y-1">
        {curated.map((item) => (
          <li key={item.name} className="text-xs">
            <div className="flex items-center gap-1">
              {onSelect ? (
                <button
                  type="button"
                  onClick={() => onSelect(item)}
                  className={`truncate rounded px-1.5 py-0.5 text-left font-mono hover:bg-zinc-200 dark:hover:bg-zinc-800 ${
                    selected === item.name
                      ? "bg-cyan-100 font-semibold dark:bg-cyan-950"
                      : ""
                  } ${item.isTemplate ? "italic" : ""}`}
                  title={item.description}
                >
                  {item.name}
                </button>
              ) : (
                <span
                  className={`truncate px-1.5 py-0.5 font-mono ${item.isTemplate ? "italic" : ""}`}
                  title={item.description}
                >
                  {item.name}
                </span>
              )}
              {/* Only the notable hints in list rows — read-only on 25 tools is noise. */}
              <AnnotationChips annotations={item.annotations} showReadOnly={false} />
              {item.schema !== undefined && (
                <button
                  type="button"
                  onClick={() =>
                    setOpenSchema(openSchema === item.name ? null : item.name)
                  }
                  title="Toggle raw schema"
                  className={`shrink-0 rounded px-1 font-mono ${
                    openSchema === item.name
                      ? "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200"
                      : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                  }`}
                >
                  {"{}"}
                </button>
              )}
            </div>
            {openSchema === item.name && item.schema !== undefined && (
              <JsonBlock
                data={item.schema}
                indent={1}
                className="mt-1 overflow-x-auto rounded bg-zinc-100 p-1.5 font-mono text-[10px] leading-relaxed dark:bg-zinc-950"
              />
            )}
          </li>
        ))}
      </ul>
      {primitive === "tool" && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
        >
          + {hiddenCount} more…
        </button>
      )}
      {primitive === "tool" && showAll && (
        <button
          type="button"
          onClick={() => setShowAll(false)}
          className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
        >
          show curated subset
        </button>
      )}
    </div>
  );
}

export function CapabilityPanel({
  tools,
  resources,
  prompts,
  onSelectTool,
  onSelectResource,
  onSelectPrompt,
  selected,
}: {
  tools: CapabilityItem[];
  resources: CapabilityItem[];
  prompts: CapabilityItem[];
  onSelectTool: (item: CapabilityItem) => void;
  onSelectResource: (item: CapabilityItem) => void;
  onSelectPrompt: (item: CapabilityItem) => void;
  selected?: string;
}) {
  return (
    <div className="grid gap-2">
      <Column
        title="Tools · model-controlled"
        primitive="tool"
        items={tools}
        onSelect={onSelectTool}
        selected={selected}
      />
      <Column
        title="Resources · app-controlled"
        primitive="resource"
        items={resources}
        onSelect={onSelectResource}
        selected={selected}
      />
      <Column
        title="Prompts · user-controlled"
        primitive="prompt"
        items={prompts}
        onSelect={onSelectPrompt}
        selected={selected}
      />
    </div>
  );
}
