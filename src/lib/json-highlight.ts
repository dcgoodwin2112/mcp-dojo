export type JsonTokenType = "key" | "string" | "number" | "literal" | "punct";

export interface JsonToken {
  type: JsonTokenType;
  text: string;
}

// Strings first so quoted content can't match as numbers/literals; a string
// followed by a colon is an object key. Everything between matches (braces,
// brackets, commas, whitespace) becomes punct.
const TOKEN_RE =
  /("(?:[^"\\]|\\.)*")(\s*:)?|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\btrue\b|\bfalse\b|\bnull\b/g;

/** Tokenize JSON.stringify output into typed spans for highlighting. */
export function tokenizeJson(text: string): JsonToken[] {
  const tokens: JsonToken[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    if (m.index > last) {
      tokens.push({ type: "punct", text: text.slice(last, m.index) });
    }
    if (m[1] !== undefined) {
      tokens.push({ type: m[2] ? "key" : "string", text: m[1] });
      if (m[2]) tokens.push({ type: "punct", text: m[2] });
    } else if (m[0] === "true" || m[0] === "false" || m[0] === "null") {
      tokens.push({ type: "literal", text: m[0] });
    } else {
      tokens.push({ type: "number", text: m[0] });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    tokens.push({ type: "punct", text: text.slice(last) });
  }
  return tokens;
}
