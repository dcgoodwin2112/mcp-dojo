import { describe, expect, it } from "vitest";
import { appendChunk, parseLine } from "@/lib/ndjson";

describe("appendChunk", () => {
  it("splits complete lines and keeps the partial tail", () => {
    const r = appendChunk("", '{"a":1}\n{"b":2}\n{"c"');
    expect(r.lines).toEqual(['{"a":1}', '{"b":2}']);
    expect(r.rest).toBe('{"c"');
  });

  it("joins a previous partial line with the next chunk", () => {
    const r = appendChunk('{"c"', ':3}\n');
    expect(r.lines).toEqual(['{"c":3}']);
    expect(r.rest).toBe("");
  });

  it("strips CRLF and skips blank lines", () => {
    const r = appendChunk("", '{"a":1}\r\n\r\n{"b":2}\r\n');
    expect(r.lines).toEqual(['{"a":1}', '{"b":2}']);
  });
});

describe("parseLine", () => {
  it("parses JSON and preserves garbage", () => {
    expect(parseLine('{"ok":true}')).toEqual({ ok: true });
    expect(parseLine("not json")).toEqual({ unparseable: "not json" });
  });
});
