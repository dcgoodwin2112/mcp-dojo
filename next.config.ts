import type { NextConfig } from "next";

// Replay-only static build (hosted mcpdojo.dev): output: "export" cannot
// include the API routes, and pageExtensions ["tsx"] drops them — route
// handlers are the only .ts files under src/app. Constraint: route handlers
// stay .ts; dynamic metadata files (robots.ts, sitemap.ts) would need .tsx.
const replayOnly = process.env.NEXT_PUBLIC_REPLAY_ONLY === "1";

const nextConfig: NextConfig = {
  ...(replayOnly ? { output: "export" as const, pageExtensions: ["tsx"] } : {}),
};

export default nextConfig;
