// Dev orchestrator: runs the Vite dev server (app) and the backend together.
// Vite serves the app on :3000 and proxies /api, /ask-ai.js, /privacy-policy
// to the public backend on :3001. Management API is on :3002.
// The backend emits JSON logs, which we pipe through pino-pretty for human-friendly dev output.

const backend = Bun.spawn(["bun", "--watch", "server/index.ts"], {
  stdout: "pipe",
  stderr: "inherit",
  env: { ...process.env, PORT: "3001", MANAGEMENT_PORT: "3002" },
});

const pretty = Bun.spawn(["bunx", "pino-pretty"], {
  stdin: backend.stdout,
  stdout: "inherit",
  stderr: "inherit",
});

const app = Bun.spawn(["vite"], {
  stdio: ["inherit", "inherit", "inherit"],
});

function shutdown() {
  backend.kill();
  pretty.kill();
  app.kill();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await Promise.race([backend.exited, app.exited]);
shutdown();
