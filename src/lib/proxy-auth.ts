import {
  DEFAULT_PERSONA_KEY,
  type OauthPersona,
  type ResolvedProfile,
} from "./profile-config";

/**
 * Auth dispatch for the /api/mcp proxy — pure so the strategy matrix is
 * unit-testable. `none` sends no Authorization header; `bearer` sends the
 * persona's static token; `oauth` hands the route what it needs to mint
 * (persona credentials + a profile-scoped cache key).
 */

export type AuthDispatch =
  | { mode: "none" }
  | { mode: "bearer"; authorization: string }
  | { mode: "oauth"; persona: OauthPersona; tokenUrl: string; cacheKey: string };

/** Cache key for minted OAuth tokens — profile-scoped so persona keys
 *  reused across profiles never collide. */
export function tokenCacheKey(profileId: string, personaKey: string): string {
  return `${profileId}:${personaKey}`;
}

export function dispatchAuth(
  profile: ResolvedProfile,
  personaKey: string,
): AuthDispatch | { error: string } {
  switch (profile.auth.type) {
    case "none":
      return personaKey === DEFAULT_PERSONA_KEY
        ? { mode: "none" }
        : { error: `profile "${profile.id}" has no persona "${personaKey}"` };
    case "bearer": {
      const persona = profile.auth.personas.find((p) => p.key === personaKey);
      if (!persona) return { error: `profile "${profile.id}" has no persona "${personaKey}"` };
      return { mode: "bearer", authorization: `Bearer ${persona.token}` };
    }
    case "oauth-client-credentials": {
      const persona = profile.auth.personas.find((p) => p.key === personaKey);
      if (!persona) return { error: `profile "${profile.id}" has no persona "${personaKey}"` };
      return {
        mode: "oauth",
        persona,
        tokenUrl: profile.auth.tokenUrl,
        cacheKey: tokenCacheKey(profile.id, personaKey),
      };
    }
  }
}
