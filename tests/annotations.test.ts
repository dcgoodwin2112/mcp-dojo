import { describe, expect, it } from "vitest";
import { annotationChips } from "@/lib/annotations";

describe("annotationChips", () => {
  it("returns nothing without annotations", () => {
    expect(annotationChips(undefined)).toEqual([]);
    expect(annotationChips({})).toEqual([]);
  });

  it("maps a DKAN read tool to read-only only", () => {
    const chips = annotationChips({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
    expect(chips).toHaveLength(1);
    expect(chips[0]).toMatchObject({ label: "read-only", tone: "read" });
    expect(chips[0].meaning).toBeTruthy();
  });

  it("maps a destructive write tool", () => {
    const chips = annotationChips({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    });
    expect(chips).toHaveLength(1);
    expect(chips[0]).toMatchObject({ label: "destructive", tone: "danger" });
  });

  it("maps a non-idempotent open-world tool (harvest/import)", () => {
    const chips = annotationChips({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    });
    expect(chips.map((c) => c.label)).toEqual(["non-idempotent", "open-world"]);
  });

  it("only flags idempotency when explicitly false", () => {
    expect(annotationChips({ idempotentHint: true })).toEqual([]);
    expect(annotationChips({})).toEqual([]);
  });
});
