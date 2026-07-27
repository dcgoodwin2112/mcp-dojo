import { describe, expect, it } from "vitest";
import { tokenizeJson, type JsonToken } from "@/lib/json-highlight";

function roundTrip(tokens: JsonToken[]): string {
  return tokens.map((t) => t.text).join("");
}

function stringify(data: unknown, indent = 2): string {
  return JSON.stringify(data, null, indent);
}

describe("tokenizeJson", () => {
  it("round-trips: concatenated token text equals the input", () => {
    const text = stringify({
      name: "query_datastore",
      limit: 10,
      offset: -1.5e3,
      active: true,
      note: null,
      nested: { keys: ["a", "b"], empty: {} },
    });
    expect(roundTrip(tokenizeJson(text))).toBe(text);
  });

  it("classifies keys vs string values", () => {
    const tokens = tokenizeJson(stringify({ title: "Bike Lanes" }));
    expect(tokens.find((t) => t.text === '"title"')?.type).toBe("key");
    expect(tokens.find((t) => t.text === '"Bike Lanes"')?.type).toBe("string");
  });

  it("classifies numbers and literals", () => {
    const tokens = tokenizeJson(stringify({ n: 42, x: -3.14, e: 1e-5, t: true, f: false, z: null }));
    const byText = Object.fromEntries(tokens.map((t) => [t.text, t.type]));
    expect(byText["42"]).toBe("number");
    expect(byText["-3.14"]).toBe("number");
    expect(byText["0.00001"]).toBe("number");
    expect(byText["true"]).toBe("literal");
    expect(byText["false"]).toBe("literal");
    expect(byText["null"]).toBe("literal");
  });

  it("keeps braces, brackets, commas, and whitespace as punct", () => {
    const tokens = tokenizeJson(stringify([1, 2]));
    const punct = tokens.filter((t) => t.type === "punct").map((t) => t.text).join("");
    expect(punct).toContain("[");
    expect(punct).toContain("]");
    expect(punct).toContain(",");
  });

  it("does not classify content inside strings", () => {
    const text = stringify({ desc: 'has "quotes", true, null and 123' });
    const tokens = tokenizeJson(text);
    expect(roundTrip(tokens)).toBe(text);
    // The whole escaped value stays one string token.
    expect(tokens.filter((t) => t.type === "literal")).toHaveLength(0);
    expect(tokens.filter((t) => t.type === "number")).toHaveLength(0);
    expect(tokens.filter((t) => t.type === "string")).toHaveLength(1);
  });

  it("handles escaped JSON-in-a-string (tool result payloads)", () => {
    const inner = stringify({ results: [1, 2] }, 0);
    const text = stringify({ text: inner });
    const tokens = tokenizeJson(text);
    expect(roundTrip(tokens)).toBe(text);
    expect(tokens.find((t) => t.type === "string")?.text).toBe(JSON.stringify(inner));
  });

  it("treats string values in arrays as strings, not keys", () => {
    const tokens = tokenizeJson(stringify(["a", "b"]));
    expect(tokens.filter((t) => t.type === "key")).toHaveLength(0);
    expect(tokens.filter((t) => t.type === "string")).toHaveLength(2);
  });

  it("handles top-level scalars and empty input", () => {
    expect(tokenizeJson("")).toEqual([]);
    expect(tokenizeJson('"hello"')).toEqual([{ type: "string", text: '"hello"' }]);
    expect(tokenizeJson("null")).toEqual([{ type: "literal", text: "null" }]);
  });

  it("round-trips indent-1 output (schema views)", () => {
    const text = JSON.stringify({ type: "object", required: ["id"] }, null, 1);
    expect(roundTrip(tokenizeJson(text))).toBe(text);
  });
});
