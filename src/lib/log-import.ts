import { EventLogSchema, type EventLog } from "./events";

/**
 * Parse a user-supplied saved log (Live's ↓ Save .json) into an EventLog.
 * Bounds are enforced before the expensive work so a huge or hostile file
 * can't freeze the tab; callers should check MAX_LOG_BYTES against the File
 * before reading it at all.
 */

export const MAX_LOG_BYTES = 10 * 1024 * 1024; // golden fixture is ~540 KB
export const MAX_LOG_EVENTS = 10_000;

export type LogImportResult =
  | { ok: true; log: EventLog }
  | { ok: false; error: string };

export function parseEventLogJson(text: string): LogImportResult {
  if (text.length > MAX_LOG_BYTES) {
    return { ok: false, error: `file is larger than ${MAX_LOG_BYTES / 1024 / 1024} MB` };
  }
  if (text.trim() === "") {
    return { ok: false, error: "file is empty" };
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  const eventCount =
    typeof data === "object" && data !== null && Array.isArray((data as { events?: unknown }).events)
      ? (data as { events: unknown[] }).events.length
      : 0;
  if (eventCount > MAX_LOG_EVENTS) {
    return { ok: false, error: `log has ${eventCount} events (limit ${MAX_LOG_EVENTS})` };
  }
  const parsed = EventLogSchema.safeParse(data);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    const more = parsed.error.issues.length > 3 ? ` (+${parsed.error.issues.length - 3} more)` : "";
    return { ok: false, error: `not a valid event log — ${issues.join("; ")}${more}` };
  }
  return { ok: true, log: parsed.data };
}
