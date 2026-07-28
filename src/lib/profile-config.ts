import { z } from "zod";

/**
 * Profile config parsing — pure (no fs, no process.env): takes the parsed
 * profiles.config.json and an env record, returns resolved profiles or
 * throws with every problem listed. Secrets never appear literally in the
 * config: secret-bearing fields must be pure ${ENV_VAR} references.
 * Non-secret strings may interpolate ${ENV_VAR} / ${ENV_VAR:-fallback}.
 */

export interface OauthPersona {
  key: string;
  label: string;
  clientId: string;
  clientSecret: string;
  scope: string;
}

export interface BearerPersona {
  key: string;
  label: string;
  token: string;
}

export type ResolvedAuth =
  | { type: "none" }
  | { type: "bearer"; personas: BearerPersona[] }
  | { type: "oauth-client-credentials"; tokenUrl: string; personas: OauthPersona[] };

export type ResolvedTransport =
  | { kind: "streamable-http"; url: string }
  | {
      kind: "stdio";
      command: string;
      args: string[];
      cwd?: string;
      env: Record<string, string>;
      secretEnv: Record<string, string>;
      /** Values to scrub from anything browser-visible (stderr excerpts):
       *  resolved secretEnv values + every env-interpolated substitution. */
      redact: string[];
    };

export interface ResolvedProfile {
  id: string;
  name: string;
  transport: ResolvedTransport;
  protocolVersion: string;
  allowSelfSigned: boolean;
  auth: ResolvedAuth;
}

export interface PublicPersona {
  key: string;
  label: string;
  scope?: string;
}

/** Browser-facing shape — never carries tokenUrl, tokens, secrets, or
 *  stdio args/env (stdio display is the command basename only). */
export interface PublicProfile {
  id: string;
  name: string;
  mcpUrl: string;
  transport: "streamable-http" | "stdio";
  authType: ResolvedAuth["type"];
  personas: PublicPersona[];
}

/** The persona key a no-auth profile implicitly has. */
export const DEFAULT_PERSONA_KEY = "default";

const ENV_REF = /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g;
const PURE_SECRET_REF = /^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/;
/** Names that mark a value as secret material — banned outside secretEnv
 *  in stdio fields (the config file is tracked in git; argv is visible to
 *  process listings regardless of redaction). */
const SECRET_NAME = /SECRET|TOKEN|PASSWORD|PASSWD|APIKEY|API_KEY|CREDENTIAL/i;

const PersonaBase = { key: z.string().min(1), label: z.string().min(1) };

const RawAuthSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z.object({
    type: z.literal("bearer"),
    personas: z.array(z.object({ ...PersonaBase, token: z.string().min(1) })).min(1),
  }),
  z.object({
    type: z.literal("oauth-client-credentials"),
    tokenUrl: z.string().min(1),
    personas: z
      .array(
        z.object({
          ...PersonaBase,
          clientId: z.string().min(1),
          clientSecret: z.string().min(1),
          scope: z.string().min(1),
        }),
      )
      .min(1),
  }),
]);

const RawTransportSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("streamable-http"), url: z.string().min(1) }),
  z.object({
    kind: z.literal("stdio"),
    command: z.string().min(1),
    args: z.array(z.string()).default([]),
    cwd: z.string().min(1).optional(),
    env: z.record(z.string(), z.string()).default({}),
    secretEnv: z.record(z.string(), z.string()).default({}),
  }),
]);

const RawProfileSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "lowercase alphanumeric + dashes"),
  name: z.string().min(1),
  transport: RawTransportSchema,
  protocolVersion: z.string().min(1).default("2025-06-18"),
  allowSelfSigned: z.union([z.boolean(), z.string()]).optional(),
  auth: RawAuthSchema,
});

const RawConfigSchema = z
  .object({ profiles: z.array(RawProfileSchema).min(1) })
  .superRefine((cfg, ctx) => {
    const ids = new Set<string>();
    cfg.profiles.forEach((p, i) => {
      if (ids.has(p.id)) {
        ctx.addIssue({ code: "custom", path: ["profiles", i, "id"], message: `duplicate profile id "${p.id}"` });
      }
      ids.add(p.id);
      if (p.transport.kind === "stdio" && p.auth.type !== "none") {
        ctx.addIssue({
          code: "custom",
          path: ["profiles", i, "auth", "type"],
          message: `profile "${p.id}": stdio transport requires auth type "none" — identity goes in command args, secrets in secretEnv`,
        });
      }
      if (p.auth.type === "none") return;
      const keys = new Set<string>();
      p.auth.personas.forEach((persona, j) => {
        if (keys.has(persona.key)) {
          ctx.addIssue({
            code: "custom",
            path: ["profiles", i, "auth", "personas", j, "key"],
            message: `duplicate persona key "${persona.key}" in profile "${p.id}"`,
          });
        }
        keys.add(persona.key);
      });
    });
  });

type Env = Record<string, string | undefined>;

function interpolate(value: string, env: Env, path: string, errors: string[]): string {
  return value.replace(ENV_REF, (_m, name: string, fallback: string | undefined) => {
    const v = env[name] ?? fallback;
    if (v === undefined) {
      errors.push(`${path}: missing env var ${name}`);
      return "";
    }
    return v;
  });
}

function resolveSecret(value: string, env: Env, path: string, errors: string[]): string {
  if (!PURE_SECRET_REF.test(value)) {
    errors.push(`${path}: must be a pure \${ENV_VAR} reference (no literal secrets, no :- default)`);
    return "";
  }
  const name = value.slice(2, -1);
  const v = env[name];
  if (v === undefined || v === "") {
    errors.push(`${path}: missing env var ${name}`);
    return "";
  }
  return v;
}

/** stdio fields are non-secret by contract: no `:-` defaults (a default
 *  is a literal in tracked config) and no secret-like variable names —
 *  secrets flow through secretEnv only. Every substituted value is
 *  recorded for stderr redaction. */
function interpolateStdio(
  value: string,
  env: Env,
  path: string,
  errors: string[],
  redact: string[],
): string {
  return value.replace(ENV_REF, (_m, name: string, fallback: string | undefined) => {
    if (fallback !== undefined) {
      errors.push(`${path}: \${VAR:-default} is not allowed in stdio fields`);
      return "";
    }
    if (SECRET_NAME.test(name)) {
      errors.push(`${path}: secret-like env var ${name} — use transport.secretEnv`);
      return "";
    }
    const v = env[name];
    if (v === undefined) {
      errors.push(`${path}: missing env var ${name}`);
      return "";
    }
    redact.push(v);
    return v;
  });
}

type RawProfile = z.infer<typeof RawProfileSchema>;

function resolveTransport(p: RawProfile, env: Env, errors: string[]): ResolvedTransport {
  const at = (field: string) => `profile "${p.id}" ${field}`;
  if (p.transport.kind === "streamable-http") {
    return {
      kind: "streamable-http",
      url: interpolate(p.transport.url, env, at("transport.url"), errors),
    };
  }
  const t = p.transport;
  const redact: string[] = [];
  const args = t.args.map((a, i) => {
    const opt = a.match(/^(--?[^=]+)=/);
    if (opt && SECRET_NAME.test(opt[1])) {
      errors.push(
        `${at(`transport.args[${i}]`)}: secret-like option "${opt[1]}" — argv is visible to process listings; use secretEnv`,
      );
    }
    return interpolateStdio(a, env, at(`transport.args[${i}]`), errors, redact);
  });
  const childEnv: Record<string, string> = {};
  for (const [k, v] of Object.entries(t.env)) {
    if (SECRET_NAME.test(k)) {
      errors.push(`${at(`transport.env.${k}`)}: secret-like env key — use transport.secretEnv`);
      continue;
    }
    childEnv[k] = interpolateStdio(v, env, at(`transport.env.${k}`), errors, redact);
  }
  const secretEnv: Record<string, string> = {};
  for (const [k, v] of Object.entries(t.secretEnv)) {
    const resolved = resolveSecret(v, env, at(`transport.secretEnv.${k}`), errors);
    secretEnv[k] = resolved;
    if (resolved !== "") redact.push(resolved);
  }
  return {
    kind: "stdio",
    command: interpolateStdio(t.command, env, at("transport.command"), errors, redact),
    args,
    cwd: t.cwd === undefined ? undefined : interpolateStdio(t.cwd, env, at("transport.cwd"), errors, redact),
    env: childEnv,
    secretEnv,
    redact,
  };
}

function coerceBool(value: string | boolean | undefined): boolean {
  if (typeof value === "boolean") return value;
  if (value === undefined) return false;
  return ["1", "true", "yes"].includes(value.toLowerCase());
}

export function parseProfilesConfig(raw: unknown, env: Env): ResolvedProfile[] {
  const parsed = RawConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`profiles.config.json invalid:\n${issues.join("\n")}`);
  }

  const errors: string[] = [];
  const profiles = parsed.data.profiles.map((p): ResolvedProfile => {
    const at = (field: string) => `profile "${p.id}" ${field}`;
    let auth: ResolvedAuth;
    if (p.auth.type === "none") {
      auth = { type: "none" };
    } else if (p.auth.type === "bearer") {
      auth = {
        type: "bearer",
        personas: p.auth.personas.map((persona) => ({
          key: persona.key,
          label: interpolate(persona.label, env, at(`persona "${persona.key}" label`), errors),
          token: resolveSecret(persona.token, env, at(`persona "${persona.key}" token`), errors),
        })),
      };
    } else {
      auth = {
        type: "oauth-client-credentials",
        tokenUrl: interpolate(p.auth.tokenUrl, env, at("tokenUrl"), errors),
        personas: p.auth.personas.map((persona) => ({
          key: persona.key,
          label: interpolate(persona.label, env, at(`persona "${persona.key}" label`), errors),
          clientId: interpolate(persona.clientId, env, at(`persona "${persona.key}" clientId`), errors),
          clientSecret: resolveSecret(
            persona.clientSecret,
            env,
            at(`persona "${persona.key}" clientSecret`),
            errors,
          ),
          scope: interpolate(persona.scope, env, at(`persona "${persona.key}" scope`), errors),
        })),
      };
    }
    return {
      id: p.id,
      name: interpolate(p.name, env, at("name"), errors),
      transport: resolveTransport(p, env, errors),
      protocolVersion: p.protocolVersion,
      allowSelfSigned: coerceBool(
        typeof p.allowSelfSigned === "string"
          ? interpolate(p.allowSelfSigned, env, at("allowSelfSigned"), errors)
          : p.allowSelfSigned,
      ),
      auth,
    };
  });

  if (errors.length > 0) {
    throw new Error(`profiles.config.json invalid:\n${errors.join("\n")}`);
  }
  return profiles;
}

/** Personas as the UI sees them; a no-auth profile gets the implicit default. */
export function publicPersonas(auth: ResolvedAuth): PublicPersona[] {
  switch (auth.type) {
    case "none":
      return [{ key: DEFAULT_PERSONA_KEY, label: "Default" }];
    case "bearer":
      return auth.personas.map(({ key, label }) => ({ key, label }));
    case "oauth-client-credentials":
      return auth.personas.map(({ key, label, scope }) => ({ key, label, scope }));
  }
}

export function publicProfiles(profiles: ResolvedProfile[]): PublicProfile[] {
  return profiles.map((p) => ({
    id: p.id,
    name: p.name,
    // stdio display is the command basename ONLY — args/env are
    // deployment-local detail and must never reach the browser.
    mcpUrl:
      p.transport.kind === "stdio"
        ? `stdio: ${p.transport.command.split(/[\\/]/).pop() ?? p.transport.command}`
        : p.transport.url,
    transport: p.transport.kind,
    authType: p.auth.type,
    personas: publicPersonas(p.auth),
  }));
}
