import { spawn, type ChildProcess } from "node:child_process";
import { appendChunk, parseLine } from "./ndjson";
import type { ResolvedProfile, ResolvedTransport } from "./profile-config";
import { classifyFrames, classifyUnsolicited, type ClassifiedFrame } from "./sse";

/**
 * stdio MCP session manager — SERVER-SIDE, local single-Node-process
 * only. One child process per session; one stdout reader and one FIFO
 * request queue per session (overlapping requests can never interleave
 * writes or misattribute frames); bounded buffers throughout; children
 * get a minimal allowlisted environment (never the Next process env,
 * which holds .env.local secrets); stderr excerpts are redacted before
 * they can reach the browser-visible event log.
 */

const MAX_SESSIONS = 4;
const MAX_PENDING = 8;
// Env-overridable so integration tests don't wait 30s on timeout paths.
const REQUEST_TIMEOUT_MS = Number(process.env.MCP_DOJO_STDIO_TIMEOUT_MS ?? 30_000);
const IDLE_TTL_MS = 5 * 60_000;
const MAX_PARTIAL_LINE = 1_000_000;
const MAX_FRAMES = 500;
const MAX_OUTBOUND_BYTES = 1_000_000;
const STDERR_RING_LINES = 20;
/** What a child needs to launch — nothing more. */
const ENV_ALLOWLIST = ["PATH", "HOME", "USER", "SHELL", "TMPDIR", "LANG", "LC_ALL"];

interface Waiter {
  requestId: string;
  frames: unknown[];
  resolve: (response: unknown) => void;
  reject: (err: Error) => void;
  settled: boolean;
}

interface StdioSession {
  id: string;
  profileId: string;
  personaKey: string;
  child: ChildProcess;
  redact: string[];
  rest: string;
  idle: unknown[];
  stderrRing: string[];
  waiter: Waiter | null;
  pendingCount: number;
  chain: Promise<unknown>;
  lastUsed: number;
  dead?: string;
}

interface Registry {
  sessions: Map<string, StdioSession>;
  exitHooked: boolean;
}

// globalThis so dev HMR module reloads don't orphan children.
const g = globalThis as unknown as { __mcpDojoStdio?: Registry };

function registry(): Registry {
  if (!g.__mcpDojoStdio) {
    g.__mcpDojoStdio = { sessions: new Map(), exitHooked: false };
  }
  if (!g.__mcpDojoStdio.exitHooked) {
    g.__mcpDojoStdio.exitHooked = true;
    process.once("exit", () => {
      for (const s of g.__mcpDojoStdio?.sessions.values() ?? []) s.child.kill();
    });
  }
  return g.__mcpDojoStdio;
}

function redactText(text: string, redact: string[]): string {
  let out = text;
  for (const value of redact) {
    if (value.length > 0) out = out.split(value).join("REDACTED");
  }
  return out;
}

function stderrExcerpt(s: StdioSession): string {
  const raw = s.stderrRing.join("\n").trim();
  return raw === "" ? "" : ` — stderr: ${redactText(raw, s.redact)}`;
}

function frameCount(s: StdioSession): number {
  return s.idle.length + (s.waiter?.frames.length ?? 0);
}

function killSession(s: StdioSession, reason: string): void {
  if (s.dead) return;
  s.dead = reason;
  s.child.kill();
  registry().sessions.delete(s.id);
  s.waiter?.reject(new Error(reason + stderrExcerpt(s)));
}

function reap(): void {
  const now = Date.now();
  for (const s of [...registry().sessions.values()]) {
    if (now - s.lastUsed > IDLE_TTL_MS) killSession(s, "stdio session idle-expired");
  }
}

function deliver(s: StdioSession, frame: unknown): void {
  const w = s.waiter;
  if (w && !w.settled) {
    w.frames.push(frame);
    const f = frame as { id?: unknown; method?: unknown } | null;
    if (f && typeof f === "object" && !("method" in f) && "id" in f && String(f.id) === w.requestId) {
      w.settled = true;
      w.resolve(frame);
    }
  } else {
    s.idle.push(frame);
  }
  if (frameCount(s) > MAX_FRAMES) {
    killSession(s, "stdio session flooded (frame cap exceeded)");
  }
}

function attachStreams(s: StdioSession): void {
  s.child.stdout?.on("data", (chunk: Buffer) => {
    const { lines, rest } = appendChunk(s.rest, chunk.toString("utf8"));
    if (rest.length > MAX_PARTIAL_LINE) {
      killSession(s, "stdio session emitted an unterminated line (size cap exceeded)");
      return;
    }
    s.rest = rest;
    for (const line of lines) deliver(s, parseLine(line));
  });
  s.child.stderr?.on("data", (chunk: Buffer) => {
    for (const line of chunk.toString("utf8").split("\n")) {
      if (line.trim() === "") continue;
      s.stderrRing.push(line);
      if (s.stderrRing.length > STDERR_RING_LINES) s.stderrRing.shift();
    }
  });
  s.child.on("exit", (code) => {
    if (!s.dead) killSession(s, `stdio server exited (code ${code ?? "unknown"})`);
  });
  s.child.on("error", (err) => {
    if (!s.dead) killSession(s, `stdio spawn failed: ${err.message}`);
  });
}

export interface StdioResult {
  responseFrame: unknown;
  ordered: ClassifiedFrame[];
  unsolicited: ClassifiedFrame[];
  latencyMs: number;
}

/** Write one frame and collect stdout until its id-matched response or
 *  the deadline. MUST run at the FIFO head. */
function performRequest(
  s: StdioSession,
  frame: Record<string, unknown>,
  deadline: number,
): Promise<StdioResult> {
  return new Promise<StdioResult>((resolve, reject) => {
    if (s.dead) {
      reject(new Error(s.dead));
      return;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      reject(new Error("stdio request timed out waiting in queue" + stderrExcerpt(s)));
      return;
    }
    const body = JSON.stringify(frame);
    if (body.length > MAX_OUTBOUND_BYTES) {
      reject(new Error("stdio request frame exceeds the 1 MB cap"));
      return;
    }
    // Idle frames arrived BEFORE this request — surfaced separately so
    // the client logs them ahead of its rpc.request event.
    const unsolicited = classifyUnsolicited(s.idle.splice(0));
    const requestId = String(frame.id ?? "");
    const t0 = performance.now();
    const timer = setTimeout(() => {
      if (s.waiter === waiter) s.waiter = null;
      waiter.settled = true;
      reject(new Error("stdio request timed out" + stderrExcerpt(s)));
    }, remaining);
    const waiter: Waiter = {
      requestId,
      frames: [],
      settled: false,
      resolve: () => {
        clearTimeout(timer);
        if (s.waiter === waiter) s.waiter = null;
        const { response, ordered } = classifyFrames(waiter.frames, requestId, { fallback: false });
        resolve({
          responseFrame: response,
          ordered,
          unsolicited,
          latencyMs: Math.round(performance.now() - t0),
        });
      },
      reject: (err) => {
        clearTimeout(timer);
        if (s.waiter === waiter) s.waiter = null;
        if (!waiter.settled) {
          waiter.settled = true;
          reject(err);
        }
      },
    };
    s.waiter = waiter;
    s.lastUsed = Date.now();
    s.child.stdin?.write(body + "\n", (err) => {
      if (err) waiter.reject(new Error(`stdio write failed: ${err.message}` + stderrExcerpt(s)));
    });
  });
}

/** FIFO-enqueue a request; the 30s deadline runs from ENQUEUE time. */
async function request(s: StdioSession, frame: Record<string, unknown>): Promise<StdioResult> {
  if (s.pendingCount >= MAX_PENDING) {
    throw new Error("stdio session has too many pending requests");
  }
  s.pendingCount++;
  const deadline = Date.now() + REQUEST_TIMEOUT_MS;
  const run = s.chain.then(() => performRequest(s, frame, deadline));
  s.chain = run.catch(() => {});
  try {
    return await run;
  } finally {
    s.pendingCount--;
    s.lastUsed = Date.now();
  }
}

function childEnv(t: Extract<ResolvedTransport, { kind: "stdio" }>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of ENV_ALLOWLIST) {
    const v = process.env[key];
    if (v !== undefined) env[key] = v;
  }
  return { ...env, ...t.env, ...t.secretEnv };
}

export interface StdioInitResult extends StdioResult {
  sessionId: string;
  initializedFrame: Record<string, unknown>;
}

export function stdioInitialize(
  profile: ResolvedProfile,
  personaKey: string,
  initFrame: Record<string, unknown>,
): Promise<StdioInitResult> {
  if (profile.transport.kind !== "stdio") throw new Error("not a stdio profile");
  reap();
  const reg = registry();
  if (reg.sessions.size >= MAX_SESSIONS) {
    throw new Error(`too many stdio sessions (max ${MAX_SESSIONS}) — disconnect one first`);
  }
  const t = profile.transport;
  const child = spawn(t.command, t.args, {
    cwd: t.cwd,
    env: childEnv(t) as NodeJS.ProcessEnv,
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const s: StdioSession = {
    id: crypto.randomUUID(),
    profileId: profile.id,
    personaKey,
    child,
    redact: t.redact,
    rest: "",
    idle: [],
    stderrRing: [],
    waiter: null,
    pendingCount: 0,
    chain: Promise.resolve(),
    lastUsed: Date.now(),
  };
  attachStreams(s);
  reg.sessions.set(s.id, s);
  return request(s, initFrame).then((result) => {
    // Complete the handshake exactly like the HTTP path — strict
    // servers treat it as incomplete without the notification.
    const initializedFrame = { jsonrpc: "2.0", method: "notifications/initialized" };
    s.child.stdin?.write(JSON.stringify(initializedFrame) + "\n");
    return { ...result, sessionId: s.id, initializedFrame };
  });
}

/** A non-initialize call on an existing session. The session is BOUND to
 *  the profile/persona that created it — profileId, persona, and session
 *  id are all browser-controlled, so a mismatch is rejected before
 *  anything is written to the child. */
export function stdioCall(
  sessionId: string | undefined,
  profileId: string,
  personaKey: string,
  frame: Record<string, unknown>,
): Promise<StdioResult> {
  reap();
  const s = sessionId ? registry().sessions.get(sessionId) : undefined;
  if (!s || s.dead) {
    throw new Error("unknown or expired stdio session — reconnect to start a new server process");
  }
  if (s.profileId !== profileId || s.personaKey !== personaKey) {
    throw new Error("stdio session belongs to a different profile — reconnect");
  }
  return request(s, frame);
}

/** Kill a session (reconnect cleanup). Unknown ids are a no-op. */
export function stdioClose(sessionId: string): void {
  const s = registry().sessions.get(sessionId);
  if (s) killSession(s, "session closed by client");
}

/** Test hook: destroy everything. */
export function stdioKillAll(): void {
  for (const s of [...registry().sessions.values()]) killSession(s, "shutdown");
}

/** Test hook: registry size. */
export function stdioSessionCount(): number {
  return registry().sessions.size;
}
