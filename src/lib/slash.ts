import type { CapabilityItem } from "./events";

/**
 * Pure logic behind the chat box's inline slash commands — parsing, command
 * matching, argument state, and suggestion acceptance. AgentChat binds these
 * to input state; kept framework-free so they are unit-testable.
 */

export interface PromptArg {
  name: string;
  description?: string;
  required?: boolean;
}

export interface SlashParse {
  name: string;
  /** Text after the command; null until the first space is typed. */
  rest: string | null;
}

export function parseSlash(text: string): SlashParse | null {
  if (!text.startsWith("/")) return null;
  const space = text.indexOf(" ");
  if (space === -1) return { name: text.slice(1), rest: null };
  return { name: text.slice(1, space), rest: text.slice(space + 1) };
}

/** Command-picker matches — only while the command itself is being typed. */
export function matchCommands(
  slash: SlashParse | null,
  prompts: CapabilityItem[],
): CapabilityItem[] {
  if (!slash || slash.rest !== null) return [];
  const q = slash.name.toLowerCase();
  return prompts.filter(
    (p) => p.name.toLowerCase().includes(q) || p.name.replace(/_/g, "-").includes(q),
  );
}

export interface ArgState {
  /** Argument values parsed so far, keyed by argument name. */
  map: Record<string, string>;
  /** The argument the trailing token targets (for the hint line). */
  currentArg?: PromptArg;
  /** Value text of the token being typed (after any `name=`). */
  currentValue: string;
  requiredFilled: boolean;
}

/**
 * Parse the text after the command: positional or key=value tokens. Each
 * positional token fills the first unfilled argument; when that argument is
 * the last one defined, it is greedy and takes the remainder of the text
 * verbatim, so free-text values (a question, a topic) need no quoting.
 * key=value is honored only for known argument names — an "=" inside
 * free text stays literal.
 */
export function computeArgState(rest: string, argDefs: PromptArg[]): ArgState {
  const map: Record<string, string> = {};
  const names = new Set(argDefs.map((a) => a.name));
  const lastDef: PromptArg | undefined = argDefs[argDefs.length - 1];
  let tail: string | null = null;
  let lastAssigned: { def?: PromptArg; value: string } | null = null;
  const tokenRe = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(rest))) {
    const tok = m[0];
    const eq = tok.indexOf("=");
    const key = eq > 0 ? tok.slice(0, eq) : "";
    if (key && names.has(key)) {
      map[key] = tok.slice(eq + 1);
      lastAssigned = {
        def: argDefs.find((a) => a.name === key),
        value: tok.slice(eq + 1),
      };
      continue;
    }
    const def = argDefs.find((a) => !(a.name in map));
    if (!def) {
      lastAssigned = { def: undefined, value: tok };
      continue;
    }
    if (def === lastDef) {
      tail = rest.slice(m.index);
      map[def.name] = tail.trim();
      lastAssigned = { def, value: map[def.name] };
      break;
    }
    map[def.name] = tok;
    lastAssigned = { def, value: tok };
  }
  const typingNew = rest === "" || /\s$/.test(rest);
  let currentArg: PromptArg | undefined;
  let currentValue = "";
  if (tail !== null) {
    currentArg = lastDef;
    currentValue = tail.trim();
  } else if (typingNew) {
    currentArg = argDefs.find((a) => !(a.name in map)) ?? lastDef;
  } else if (lastAssigned) {
    currentArg = lastAssigned.def;
    currentValue = lastAssigned.value;
  }
  const requiredFilled = argDefs
    .filter((a) => a.required)
    .every((a) => (map[a.name] ?? "").trim() !== "");
  return { map, currentArg, currentValue, requiredFilled };
}

/** Replace the token being typed with an accepted suggestion. */
export function acceptValueText(text: string, v: string): string {
  const space = text.indexOf(" ");
  const head = text.slice(0, space + 1);
  const rest = text.slice(space + 1);
  if (rest === "" || /\s$/.test(rest)) return head + rest + v;
  const toks = rest.split(/\s+/);
  const last = toks[toks.length - 1];
  const eq = last.indexOf("=");
  toks[toks.length - 1] = eq > 0 ? last.slice(0, eq + 1) + v : v;
  return head + toks.join(" ");
}
