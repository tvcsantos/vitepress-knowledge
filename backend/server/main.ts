import { fetchStatic } from "@aklinker1/aframe/server";
import { createApp, NoResponse } from "@aklinker1/zeta";
import { zodSchemaAdapter } from "@aklinker1/zeta/adapters/zod-schema-adapter";
import { version } from "../shared/constants";
import dedent from "dedent";
import { assetApis } from "./apis/asset-apis";
import { modelApis } from "./apis/model-apis";
import { chatApis } from "./apis/chat-apis";
import { siteApis } from "./apis/site-apis";
import { knowledgeApis } from "./apis/knowledge-apis";
import { corsPlugin } from "./plugins/cors-plugin";
import { requestLoggerPlugin } from "./plugins/request-logger-plugin";
import { container } from "./dependencies";
import { applyAppTemplateVars } from "./utils/template-vars";
import { siteToConfig } from "./utils/site-config";

const apiApp = createApp({ prefix: "/api" })
  .use(modelApis)
  .use(chatApis)
  .use(siteApis)
  .use(knowledgeApis)
  .get("/health", { operationId: "health", responses: NoResponse }, () => {});

const app = createApp({
  openApi: {
    info: {
      title: "VitePress Knowledge Server",
      version,
      description: dedent`
        APIs used to power the _"Ask AI"_ button and chat.
      `,
    },
  },
  schemaAdapter: zodSchemaAdapter,
})
  .use(corsPlugin)
  .use(requestLoggerPlugin)
  .use(assetApis)
  .use(apiApp)
  .get(
    "/",
    { operationId: "getApp", responses: NoResponse },
    async ({ url }): Promise<any> => {
      const db = container.resolve("db");
      const siteId = url.searchParams.get("siteId");
      const site = siteId
        ? await db.sites.get(siteId)
        : await db.sites.getDefault();
      // In production index.html is embedded as the SPA fallback, not on disk.
      const entry = aframe.static?.["fallback"] ?? aframe.static?.["/"];
      const file = entry?.file ?? Bun.file(`${aframe.publicDir}/index.html`);
      const html = await file.text();
      if (!site) return new Response(html, { headers: { "content-type": "text/html" } });
      return new Response(applyAppTemplateVars(html, siteToConfig(site)), {
        headers: { "content-type": "text/html" },
      });
    },
  )
  .mount(fetchStatic());

export default app;

export type App = typeof app;
