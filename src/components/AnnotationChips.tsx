import { annotationChips, type ChipTone } from "@/lib/annotations";

const TONE_STYLES: Record<ChipTone, string> = {
  read: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  danger: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  caution: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
};

/** Advisory tool-annotation hints — see src/lib/annotations.ts. */
export function AnnotationChips({
  annotations,
  showReadOnly = true,
}: {
  annotations?: Record<string, unknown>;
  showReadOnly?: boolean;
}) {
  const chips = annotationChips(annotations).filter(
    (c) => showReadOnly || c.tone !== "read",
  );
  if (chips.length === 0) return null;
  return (
    <>
      {chips.map((c) => (
        <span
          key={c.label}
          title={`${c.meaning} — advisory hint from tools/list; apps must not treat hints as security`}
          className={`shrink-0 rounded px-1 py-0.5 font-mono text-[10px] ${TONE_STYLES[c.tone]}`}
        >
          {c.label}
        </span>
      ))}
    </>
  );
}
