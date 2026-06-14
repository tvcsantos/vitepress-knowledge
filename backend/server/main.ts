import { fetchStatic } from "@aklinker1/aframe/server";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import consola from "consola";
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

const apiApp = new Hono()
  .route("/models", modelApis)
  .route("/chat", chatApis)
  // site-apis and knowledge-apis both live under /sites
  .route("/sites", siteApis)
  .route("/sites", knowledgeApis)
  .get("/health", (c) => c.body(null, 204));

// Serve static files from the bundled `public` dir (populated by aframe at build).
const serveStatic = fetchStatic();

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

// SPA entry: serve index.html with runtime template vars applied for the site.
app.get("/", async (c) => {
  const siteId = new URL(c.req.url).searchParams.get("siteId");
  const site = siteId
    ? await db.sites.get(siteId)
    : await db.sites.getDefault();
  // In production index.html is embedded as the SPA fallback, not on disk.
  const entry = aframe.static?.["fallback"] ?? aframe.static?.["/"];
  const file = entry?.file ?? Bun.file(`${aframe.publicDir}/index.html`);
  const html = await file.text();
  c.header("content-type", "text/html");
  return c.body(site ? applyAppTemplateVars(html, siteToConfig(site)) : html);
});

// Everything else (assets + SPA fallback routes) is served from disk.
app.notFound((c) => serveStatic(c.req.raw));

// Transitional export: aframe's dev-server and generated server-entry both call
// `server.listen(port)`. Phase 4 (removing aframe) simplifies this to `{ fetch }`.
const server = {
  fetch: app.fetch,
  listen: (port: number) => Bun.serve({ port, fetch: app.fetch }),
};

export default server;
