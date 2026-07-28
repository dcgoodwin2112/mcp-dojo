import { readFileSync } from "node:fs";
import path from "node:path";
import {
  parseProfilesConfig,
  publicProfiles,
  type PublicProfile,
  type ResolvedProfile,
} from "./profile-config";

/**
 * Profile registry — SERVER-SIDE ONLY (resolved profiles hold secrets from
 * .env.local). Profiles are declared in profiles.config.json; secrets enter
 * via ${ENV_VAR} interpolation. The browser gets PublicProfile[] via
 * GET /api/profile — secrets and tokens never leave the server.
 */

export type { PublicPersona, PublicProfile, ResolvedProfile } from "./profile-config";

let cache: ResolvedProfile[] | null = null;

function load(): ResolvedProfile[] {
  const file = path.join(process.cwd(), "profiles.config.json");
  return parseProfilesConfig(JSON.parse(readFileSync(file, "utf8")), process.env);
}

export function getProfiles(): ResolvedProfile[] {
  // Re-read per call in dev so config edits don't require a restart.
  if (process.env.NODE_ENV === "development") return load();
  if (cache === null) cache = load();
  return cache;
}

export function getProfileById(id: string): ResolvedProfile | undefined {
  return getProfiles().find((p) => p.id === id);
}

export function getPublicProfiles(): PublicProfile[] {
  return publicProfiles(getProfiles());
}
