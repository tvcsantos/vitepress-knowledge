import { $ } from "bun";
import { cp, rm } from "node:fs/promises";

// 1. Clean previous output.
await rm(".output", { recursive: true, force: true });

// 2. Build the Vue app with Vite (-> .output/public).
await $`vite build`;

// 3. Bundle the server into a single JS file (-> .output/server/index.js).
//    target "bun" keeps bun:sqlite and node:* external; deps like hono/drizzle
//    are bundled. Text imports (ask-ai.js, privacy-policy.md) are inlined.
const result = await Bun.build({
  entrypoints: ["server/index.ts"],
  outdir: ".output/server",
  target: "bun",
  minify: true,
});
if (!result.success) {
  console.error("Server bundle failed:");
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

// 4. Copy Drizzle migrations next to the bundle. They are read from disk at
//    runtime via the relative path "server/drizzle/sqlite".
await cp("server/drizzle", ".output/server/drizzle", { recursive: true });

console.log("Built .output/{server,public}");
