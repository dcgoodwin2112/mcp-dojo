/**
 * True in the hosted replay-only build (mcpdojo.dev). Inlined at build time;
 * set by `npm run build:static`. Local dev and server builds leave it unset.
 */
export const REPLAY_ONLY = process.env.NEXT_PUBLIC_REPLAY_ONLY === "1";
