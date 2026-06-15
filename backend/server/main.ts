import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { serveStatic } from "hono/bun";
import { join } from "node:path";
import { createLogger } from "./utils/logger";
import { assetApis } from "./apis/asset-apis";
import { modelApis } from "./apis/model-apis";
import { chatApis } from "./apis/chat-apis";
import { siteApis } from "./apis/site-apis";
import { knowledgeApis } from "./apis/knowledge-apis";
import { corsMiddleware } from "./plugins/cors-plugin";
import { requestLoggerMiddleware } from "./plugins/request-logger-plugin";
import { db } from "./dependencies";
import { applyAppTemplateVars } from "./utils/template-vars";
import { siteToConfig } from "./utils/site-config";

// Directory containing the built SPA (Vite output). Resolved relative to the
// server bundle so it works regardless of the current working directory.
const PUBLIC_DIR = process.env.PUBLIC_DIR || join(import.meta.dir, "../public");

const log = createLogger("http");

function makeErrorHandler(label: string) {
  return (err: Error, c: import("hono").Context) => {
    const status = err instanceof HTTPException ? err.status : 500;
    // Only server errors get an error-level line with the stack here; the request
    // logger already records a summary line (with status) for every request, so
    // 4xx client errors don't need a second log entry.
    if (status >= 500) {
      log.error(
        { server: label, method: c.req.method, path: new URL(c.req.url).pathname, err },
        "unhandled error",
      );
    }
    if (err instanceof HTTPException) return err.getResponse();
    return c.json({ message: "Internal Server Error" }, 500);
  };
}

// ---------------------------------------------------------------------------
// Public app — chat UI, chat API, model list, static assets
// Intended to be exposed to the internet (behind a proxy/ALB).
// ---------------------------------------------------------------------------

// Serve index.html with runtime template vars applied for the resolved site.
async function serveSpa(c: import("hono").Context) {
  const siteId = new URL(c.req.url).searchParams.get("siteId");

  if (!siteId)
    throw new HTTPException(400, { message: "siteId query param is required" });

  const site = await db.sites.get(siteId);

  if (!site)
    throw new HTTPException(404, { message: `Site '${siteId}' not found` });

  const html = await Bun.file(join(PUBLIC_DIR, "index.html")).text();
  c.header("content-type", "text/html");
  return c.body(applyAppTemplateVars(html, siteToConfig(site)));
}

export const publicApp = new Hono();

publicApp.use(corsMiddleware);
publicApp.use(requestLoggerMiddleware);
publicApp.onError(makeErrorHandler("public"));

publicApp.route("/api/models", modelApis);
publicApp.route("/api/chat", chatApis);
publicApp.route("/", assetApis);

// SPA entry point.
publicApp.get("/", serveSpa);
// Static assets from the built public dir.
publicApp.get("/*", serveStatic({ root: PUBLIC_DIR }));
// Unmatched routes: a missing file (has an extension) is a 404; otherwise fall
// back to the SPA shell so client-side routing can handle it.
publicApp.notFound((c) => {
  const path = new URL(c.req.url).pathname;
  if (/\.[^/]+$/.test(path)) return c.body(null, 404);
  return serveSpa(c);
});

// ---------------------------------------------------------------------------
// Management app — site CRUD, knowledge file upload, health check
// Should only be accessible internally (not exposed to the internet).
// ---------------------------------------------------------------------------

export const managementApp = new Hono();

managementApp.use(requestLoggerMiddleware);
managementApp.onError(makeErrorHandler("management"));

managementApp.route("/api/sites", siteApis);
managementApp.route("/api/sites", knowledgeApis);
managementApp.get("/api/health", (c) => c.text("OK"));
