import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { serveStatic } from "hono/bun";
import consola from "consola";
import { join } from "node:path";
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

const apiApp = new Hono()
  .route("/models", modelApis)
  .route("/chat", chatApis)
  // site-apis and knowledge-apis both live under /sites
  .route("/sites", siteApis)
  .route("/sites", knowledgeApis)
  .get("/health", (c) => c.body(null, 204));

// Serve index.html with runtime template vars applied for the resolved site.
async function serveSpa(c: import("hono").Context) {
  const siteId = new URL(c.req.url).searchParams.get("siteId");
  const site = siteId
    ? await db.sites.get(siteId)
    : await db.sites.getDefault();
  const html = await Bun.file(join(PUBLIC_DIR, "index.html")).text();
  c.header("content-type", "text/html");
  return c.body(site ? applyAppTemplateVars(html, siteToConfig(site)) : html);
}

const app = new Hono();

app.use(corsMiddleware);
app.use(requestLoggerMiddleware);

app.onError((err, c) => {
  consola.error(`[http] ${c.req.method} ${c.req.url} ERROR`, err);
  if (err instanceof HTTPException) return err.getResponse();
  return c.json({ message: "Internal Server Error" }, 500);
});

app.route("/api", apiApp);
app.route("/", assetApis);

// SPA entry point.
app.get("/", serveSpa);
// Static assets from the built public dir.
app.get("/*", serveStatic({ root: PUBLIC_DIR }));
// Unmatched routes: a missing file (has an extension) is a 404; otherwise fall
// back to the SPA shell so client-side routing can handle it.
app.notFound((c) => {
  const path = new URL(c.req.url).pathname;
  if (/\.[^/]+$/.test(path)) return c.body(null, 404);
  return serveSpa(c);
});

export default app;
