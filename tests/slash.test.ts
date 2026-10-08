import { describe, expect, it } from "vitest";
import {
  acceptValueText,
  computeArgState,
  matchCommands,
  parseSlash,
  type PromptArg,
} from "@/lib/slash";

const PROMPTS = [
  { name: "explore_dataset" },
  { name: "find_datasets" },
  { name: "dataset_health_check" },
];

describe("parseSlash", () => {
  it("returns null for non-slash text", () => {
    expect(parseSlash("hello")).toBeNull();
    expect(parseSlash("")).toBeNull();
  });

  it("keeps rest null until the first space", () => {
    expect(parseSlash("/expl")).toEqual({ name: "expl", rest: null });
    expect(parseSlash("/explore_dataset ")).toEqual({ name: "explore_dataset", rest: "" });
    expect(parseSlash("/explore_dataset abc def")).toEqual({
      name: "explore_dataset",
      rest: "abc def",
    });
  });
});

describe("matchCommands", () => {
  it("matches by substring while the command is being typed", () => {
    expect(matchCommands(parseSlash("/expl"), PROMPTS).map((p) => p.name)).toEqual([
      "explore_dataset",
    ]);
    expect(matchCommands(parseSlash("/data"), PROMPTS)).toHaveLength(3);
  });

  it("matches dash-typed names against underscore names", () => {
    expect(matchCommands(parseSlash("/health-check"), PROMPTS)).toHaveLength(1);
  });

  it("closes once args are being typed", () => {
    expect(matchCommands(parseSlash("/explore_dataset x"), PROMPTS)).toEqual([]);
    expect(matchCommands(null, PROMPTS)).toEqual([]);
  });
});

describe("computeArgState", () => {
  const args: PromptArg[] = [
    { name: "dataset_id", required: true },
    { name: "focus", required: false },
  ];

  it("maps positional tokens in schema order", () => {
    const s = computeArgState("abc columns", args);
    expect(s.map).toEqual({ dataset_id: "abc", focus: "columns" });
    expect(s.requiredFilled).toBe(true);
  });

  it("maps key=value tokens by name", () => {
    const s = computeArgState("focus=columns dataset_id=abc", args);
    expect(s.map).toEqual({ focus: "columns", dataset_id: "abc" });
    expect(s.requiredFilled).toBe(true);
  });

  it("tracks the token being typed for completion", () => {
    const s = computeArgState("ce", args);
    expect(s.currentArg?.name).toBe("dataset_id");
    expect(s.currentValue).toBe("ce");
  });

  it("targets the next argument after a trailing space", () => {
    const s = computeArgState("abc ", args);
    expect(s.currentArg?.name).toBe("focus");
    expect(s.currentValue).toBe("");
  });

  it("extracts the value part of a key=value token", () => {
    const s = computeArgState("dataset_id=ce", args);
    expect(s.currentArg?.name).toBe("dataset_id");
    expect(s.currentValue).toBe("ce");
  });

  it("reports unfilled required args", () => {
    expect(computeArgState("", args).requiredFilled).toBe(false);
    expect(computeArgState("focus=columns", args).requiredFilled).toBe(false);
  });

  it("handles prompts with no arguments", () => {
    const s = computeArgState("", []);
    expect(s.currentArg).toBeUndefined();
    expect(s.requiredFilled).toBe(true);
  });

  describe("greedy last argument (free-text values)", () => {
    const qArgs: PromptArg[] = [
      { name: "dataset_id", required: true },
      { name: "question", required: true },
    ];

    it("gives the last argument the remainder, spaces included", () => {
      const s = computeArgState("abc which parks had the most sightings", qArgs);
      expect(s.map).toEqual({
        dataset_id: "abc",
        question: "which parks had the most sightings",
      });
      expect(s.requiredFilled).toBe(true);
    });

    it("keeps targeting the last argument as more words are typed", () => {
      const s = computeArgState("abc which parks ", qArgs);
      expect(s.currentArg?.name).toBe("question");
      expect(s.currentValue).toBe("which parks");
    });

    it("takes the whole rest for a single free-text argument", () => {
      const s = computeArgState("bike lanes", [{ name: "topic", required: true }]);
      expect(s.map).toEqual({ topic: "bike lanes" });
      expect(s.currentArg?.name).toBe("topic");
      expect(s.currentValue).toBe("bike lanes");
    });

    it("fills the greedy tail after an earlier key=value token", () => {
      const s = computeArgState("dataset_id=abc which parks are best", qArgs);
      expect(s.map).toEqual({ dataset_id: "abc", question: "which parks are best" });
    });

    it("keeps an = inside free text literal", () => {
      const s = computeArgState("abc is weight=100 common", qArgs);
      expect(s.map.question).toBe("is weight=100 common");
    });
  });
});

describe("acceptValueText", () => {
  it("replaces the trailing positional token", () => {
    expect(acceptValueText("/explore_dataset ce", "ced-123")).toBe("/explore_dataset ced-123");
  });

  it("replaces only the value of a key=value token", () => {
    expect(acceptValueText("/explore_dataset dataset_id=ce", "ced-123")).toBe(
      "/explore_dataset dataset_id=ced-123",
    );
  });

  it("appends after a trailing space", () => {
    expect(acceptValueText("/explore_dataset abc ", "columns")).toBe(
      "/explore_dataset abc columns",
    );
  });

  it("preserves earlier tokens", () => {
    expect(acceptValueText("/build_query abc rows=10 co", "columns")).toBe(
      "/build_query abc rows=10 columns",
    );
  });
});
