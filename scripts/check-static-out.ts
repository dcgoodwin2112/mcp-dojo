/**
 * Guard for the replay-only static export (run by `npm run build:static`).
 * The API-route exclusion rests on an undocumented pageExtensions side
 * effect — fail loudly if API artifacts ever reappear in out/, or if the
 * pages we expect went missing.
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

const out = path.join(process.cwd(), "out");
const errors: string[] = [];

if (!existsSync(out)) {
  console.error("out/ does not exist — run the static build first.");
  process.exit(1);
}

if (existsSync(path.join(out, "api"))) {
  errors.push("out/api exists — API routes leaked into the static export.");
}
const apiArtifacts = readdirSync(out).filter((f) => /^api($|\.)/.test(f));
if (apiArtifacts.length > 0) {
  errors.push(`API artifacts in out/: ${apiArtifacts.join(", ")}`);
}

for (const required of ["index.html", "icon.svg", "404.html", "robots.txt"]) {
  if (!existsSync(path.join(out, required))) {
    errors.push(`out/${required} is missing.`);
  }
}

if (errors.length > 0) {
  for (const e of errors) console.error(`check-static-out: ${e}`);
  process.exit(1);
}
console.log("check-static-out: ok");
