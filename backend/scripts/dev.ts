// Dev orchestrator: runs the Vite dev server (app) and the backend together.
// Vite serves the app on :3000 and proxies /api, /ask-ai.js, /privacy-policy
// to the backend on :3001.

const backend = Bun.spawn(["bun", "--watch", "server/index.ts"], {
  stdio: ["inherit", "inherit", "inherit"],
  env: { ...process.env, PORT: "3001" },
});

const app = Bun.spawn(["vite"], {
  stdio: ["inherit", "inherit", "inherit"],
});

function shutdown() {
  backend.kill();
  app.kill();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await Promise.race([backend.exited, app.exited]);
shutdown();
