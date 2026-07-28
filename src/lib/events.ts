import { z } from "zod";

/**
 * MCP Dojo — Event Log Schema v2.
 *
 * Zod schemas are the source of truth; TypeScript types are inferred.
 * See mcp-inspector-handoff-plan.md for design principles: the log is the
 * single source of truth, append-only, redacted at write time.
 */

export const ActorSchema = z.enum(["user", "model", "app", "server"]);
export type Actor = z.infer<typeof ActorSchema>;

export const PrimitiveSchema = z.enum(["tool", "resource", "prompt"]);
export type Primitive = z.infer<typeof PrimitiveSchema>;

// Envelope shared by every event. `sessionId` is the INSPECTOR session, not
// the MCP Mcp-Session-Id — one log spans persona switches.
const EventBase = z.object({
  id: z.string().min(1),
  seq: z.number().int().positive(),
  t: z.number().nonnegative(),
  wall: z.string().min(1),
  sessionId: z.string().min(1),
  actor: ActorSchema,
});

// --- Session lifecycle ------------------------------------------------------

export const SessionStartedSchema = EventBase.extend({
  type: z.literal("session.started"),
  profile: z.string(),
  serverUrl: z.string(),
  transport: z.enum(["streamable-http", "sse", "stdio"]),
  mode: z.enum(["live", "replay"]),
});

export const McpInitializedSchema = EventBase.extend({
  type: z.literal("mcp.initialized"),
  requestId: z.string(),
  // Server-assigned Mcp-Session-Id. A persona switch opens a new MCP session.
  mcpSessionId: z.string().optional(),
  serverInfo: z.object({ name: z.string(), version: z.string() }),
  // MCP capabilities are object-shaped; stored verbatim.
  capabilities: z.record(z.string(), z.unknown()),
  // Optional server usage guidance from the initialize result — the host is
  // expected to surface it and fold it into the model's system context.
  instructions: z.string().optional(),
});

export const SessionEndedSchema = EventBase.extend({
  type: z.literal("session.ended"),
  reason: z.enum(["user", "error", "disconnect"]),
});

// --- Auth / personas --------------------------------------------------------

export const PersonaSelectedSchema = EventBase.extend({
  type: z.literal("auth.persona.selected"),
  persona: z.string(),
  label: z.string(),
});

export const OAuthStepSchema = EventBase.extend({
  type: z.literal("auth.oauth.step"),
  step: z.enum(["token_request", "authorize", "redirect", "code_exchange", "refresh"]),
  detail: z.string().optional(),
});

export const TokenReceivedSchema = EventBase.extend({
  type: z.literal("auth.token.received"),
  scopes: z.array(z.string()),
  expiresAt: z.string(),
  tokenPreview: z.literal("REDACTED"), // enforced at write time
});

// --- Discovery --------------------------------------------------------------

export const CapabilityItemSchema = z.object({
  name: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  schema: z.unknown().optional(),
  outputSchema: z.unknown().optional(),
  // Advisory tool hints from tools/list (readOnlyHint, destructiveHint, …).
  annotations: z.record(z.string(), z.unknown()).optional(),
  isTemplate: z.boolean().optional(),
  uriTemplate: z.string().optional(),
});
export type CapabilityItem = z.infer<typeof CapabilityItemSchema>;

export const CapabilitiesListedSchema = EventBase.extend({
  type: z.literal("capabilities.listed"),
  primitive: PrimitiveSchema,
  requestId: z.string(),
  persona: z.string(),
  items: z.array(CapabilityItemSchema),
});

// --- Agent loop -------------------------------------------------------------

export const TurnStartedSchema = EventBase.extend({
  type: z.literal("turn.started"),
  turnId: z.string(),
  trigger: z.enum(["user_message", "tool_result", "prompt_invocation"]),
});

export const UserMessageSchema = EventBase.extend({
  type: z.literal("user.message"),
  turnId: z.string(),
  text: z.string(),
});

export const ModelTextSchema = EventBase.extend({
  type: z.literal("model.text"),
  turnId: z.string(),
  text: z.string(),
});

export const ToolCallRequestedSchema = EventBase.extend({
  type: z.literal("tool.call.requested"),
  primitive: z.literal("tool"),
  turnId: z.string().optional(), // absent in manual mode
  requestId: z.string(),
  toolName: z.string(),
  args: z.record(z.string(), z.unknown()),
});

// Emitted only when the server returns a tool RESULT. A permission denial on
// dkan_mcp_server is an HTTP 403 JSON-RPC error → rpc.response + ErrorEvent.
export const ToolCallCompletedSchema = EventBase.extend({
  type: z.literal("tool.call.completed"),
  primitive: z.literal("tool"),
  requestId: z.string(),
  toolName: z.string(),
  turnId: z.string().optional(),
  latencyMs: z.number().nonnegative(),
  isError: z.boolean(),
  result: z.unknown(),
  // The tool's declared outputSchema (from tools/list), embedded at call time
  // so the result card can show what structuredContent promises to match.
  outputSchema: z.unknown().optional(),
});

export const ResourceReadSchema = EventBase.extend({
  type: z.literal("resource.read"),
  primitive: z.literal("resource"),
  requestId: z.string(),
  uri: z.string(),
  latencyMs: z.number().nonnegative(),
  contents: z.array(
    z.object({
      uri: z.string(),
      mimeType: z.string().optional(),
      text: z.string().optional(),
    }),
  ),
});

export const ResourceAttachedSchema = EventBase.extend({
  type: z.literal("resource.attached"),
  primitive: z.literal("resource"),
  uri: z.string(),
  name: z.string(),
  mimeType: z.string().optional(),
});

export const ResourceDetachedSchema = EventBase.extend({
  type: z.literal("resource.detached"),
  primitive: z.literal("resource"),
  uri: z.string(),
  name: z.string(),
});

/** A user edit to the model's context (Context Inspector phase 2). Additive
 *  to schema v2 — older recordings remain valid. */
export const ContextUpdatedSchema = EventBase.extend({
  type: z.literal("context.updated"),
  field: z.enum(["system", "tools", "history"]),
  detail: z.string(),
  /** Full new value where applicable (e.g. edited system instructions). */
  text: z.string().optional(),
});

export const PromptInvokedSchema = EventBase.extend({
  type: z.literal("prompt.invoked"),
  primitive: z.literal("prompt"),
  promptName: z.string(),
  args: z.record(z.string(), z.unknown()),
});

export const PromptExpandedSchema = EventBase.extend({
  type: z.literal("prompt.expanded"),
  primitive: z.literal("prompt"),
  promptName: z.string(),
  // Flattened for display — MCP prompts/get returns content blocks.
  messages: z.array(z.object({ role: z.string(), content: z.string() })),
});

export const ContextBlockSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("system"), summary: z.string() }),
  z.object({ kind: z.literal("message"), role: z.string(), summary: z.string() }),
  z.object({
    kind: z.literal("tool_definitions"),
    count: z.number().int().nonnegative(),
    names: z.array(z.string()),
  }),
  z.object({ kind: z.literal("attached_resource"), uri: z.string(), name: z.string() }),
]);
export type ContextBlock = z.infer<typeof ContextBlockSchema>;

export const ContextSnapshotSchema = EventBase.extend({
  type: z.literal("context.snapshot"),
  turnId: z.string(),
  blocks: z.array(ContextBlockSchema),
  // Payload sizes in characters (~4 chars/token) — the context-growth meter.
  chars: z
    .object({
      system: z.number().nonnegative(),
      messages: z.number().nonnegative(),
      tools: z.number().nonnegative(),
    })
    .optional(),
});

// --- Raw JSON-RPC frames (frames drawer) ---------------------------------

const RpcHttpSchema = z.object({
  status: z.number().int(),
  headers: z.record(z.string(), z.string()), // allowlisted + redacted
  sse: z.boolean(),
});

export const RpcRequestSchema = EventBase.extend({
  type: z.literal("rpc.request"),
  requestId: z.string().optional(),
  method: z.string().optional(),
  raw: z.unknown(),
});

export const RpcResponseSchema = EventBase.extend({
  type: z.literal("rpc.response"),
  requestId: z.string().optional(),
  method: z.string().optional(),
  raw: z.unknown(),
  http: RpcHttpSchema.optional(),
});

export const RpcNotificationSchema = EventBase.extend({
  type: z.literal("rpc.notification"),
  requestId: z.string().optional(),
  method: z.string().optional(),
  raw: z.unknown(),
});

// --- Errors & annotations ---------------------------------------------------

// Derived semantic event — the raw exchange is always also logged as an
// rpc.response with http metadata.
export const ErrorEventSchema = EventBase.extend({
  type: z.literal("error"),
  scope: z.enum(["transport", "auth", "rpc", "model", "app"]),
  httpStatus: z.number().int().optional(),
  code: z.union([z.string(), z.number()]).optional(),
  message: z.string(),
  requestId: z.string().optional(),
});

export const AnnotationSchema = EventBase.extend({
  type: z.literal("annotation"),
  text: z.string(),
  pauseOnReplay: z.boolean().optional(),
});

// --- The log ----------------------------------------------------------------

export const InspectorEventSchema = z.discriminatedUnion("type", [
  SessionStartedSchema,
  McpInitializedSchema,
  SessionEndedSchema,
  PersonaSelectedSchema,
  OAuthStepSchema,
  TokenReceivedSchema,
  CapabilitiesListedSchema,
  TurnStartedSchema,
  UserMessageSchema,
  ModelTextSchema,
  ToolCallRequestedSchema,
  ToolCallCompletedSchema,
  ResourceReadSchema,
  ResourceAttachedSchema,
  ResourceDetachedSchema,
  ContextUpdatedSchema,
  PromptInvokedSchema,
  PromptExpandedSchema,
  ContextSnapshotSchema,
  RpcRequestSchema,
  RpcResponseSchema,
  RpcNotificationSchema,
  ErrorEventSchema,
  AnnotationSchema,
]);
export type InspectorEvent = z.infer<typeof InspectorEventSchema>;

export const EventLogSchema = z
  .object({
    version: z.literal(2),
    sessionId: z.string().min(1),
    recordedAt: z.string(),
    events: z.array(InspectorEventSchema),
  })
  .superRefine((log, ctx) => {
    const { events } = log;
    if (events.length === 0) return;
    if (events[0].type !== "session.started" || events[0].t !== 0) {
      ctx.addIssue({
        code: "custom",
        message: "first event must be session.started at t: 0 (replay anchor)",
        path: ["events", 0],
      });
    }
    for (let i = 1; i < events.length; i++) {
      if (events[i].seq !== events[i - 1].seq + 1) {
        ctx.addIssue({
          code: "custom",
          message: `seq must be gapless: event ${i} has seq ${events[i].seq}, previous was ${events[i - 1].seq}`,
          path: ["events", i, "seq"],
        });
      }
      if (events[i].t < events[i - 1].t) {
        ctx.addIssue({
          code: "custom",
          message: `t must be non-decreasing: event ${i} has t ${events[i].t} after ${events[i - 1].t}`,
          path: ["events", i, "t"],
        });
      }
    }
  });
export type EventLog = z.infer<typeof EventLogSchema>;
