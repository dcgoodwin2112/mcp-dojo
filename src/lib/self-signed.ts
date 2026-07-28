import { Agent, type Dispatcher } from "undici";
import type { ResolvedProfile } from "./profile-config";

/**
 * Per-profile TLS relaxation. NEVER process-global: the old
 * NODE_TLS_REJECT_UNAUTHORIZED=0 approach disabled verification for every
 * profile once any self-signed profile connected. Profiles that opt in get
 * a dedicated undici Agent passed as the fetch dispatcher on ALL their
 * outbound calls (token mint + MCP forward); everything else uses the
 * strict default.
 */

const agents = new Map<string, Agent>();

export function dispatcherFor(profile: ResolvedProfile): Dispatcher | undefined {
  if (!profile.allowSelfSigned) return undefined;
  let agent = agents.get(profile.id);
  if (!agent) {
    agent = new Agent({ connect: { rejectUnauthorized: false } });
    agents.set(profile.id, agent);
  }
  return agent;
}
