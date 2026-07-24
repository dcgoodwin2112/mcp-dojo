/**
 * Chips derived from MCP tool annotations (readOnlyHint, destructiveHint,
 * idempotentHint, openWorldHint). Annotations are ADVISORY metadata for
 * hosts — the spec forbids treating them as security; the server's
 * permission filtering is the real enforcement.
 */

export type ChipTone = "read" | "danger" | "caution";

export interface AnnotationChip {
  label: string;
  tone: ChipTone;
  /** Plain-English tooltip meaning. */
  meaning: string;
}

export function annotationChips(annotations?: Record<string, unknown>): AnnotationChip[] {
  if (!annotations) return [];
  const chips: AnnotationChip[] = [];
  if (annotations.readOnlyHint === true) {
    chips.push({ label: "read-only", tone: "read", meaning: "does not modify anything" });
  }
  if (annotations.destructiveHint === true) {
    chips.push({ label: "destructive", tone: "danger", meaning: "may delete or overwrite data" });
  }
  if (annotations.idempotentHint === false) {
    chips.push({
      label: "non-idempotent",
      tone: "caution",
      meaning: "repeating it may have different results",
    });
  }
  if (annotations.openWorldHint === true) {
    chips.push({
      label: "open-world",
      tone: "caution",
      meaning: "reaches out to external systems",
    });
  }
  return chips;
}
