/**
 * Newline-delimited JSON framing for stdio MCP — pure. Chunks from a
 * child's stdout can split lines anywhere; the caller keeps `rest`
 * between chunks.
 */
export function appendChunk(rest: string, chunk: string): { lines: string[]; rest: string } {
  const combined = rest + chunk;
  const parts = combined.split("\n");
  const newRest = parts.pop() ?? "";
  const lines = parts.map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l)).filter((l) => l.trim() !== "");
  return { lines, rest: newRest };
}

/** Parse one NDJSON line into a frame, preserving garbage. */
export function parseLine(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return { unparseable: line };
  }
}
