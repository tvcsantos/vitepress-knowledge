import { fetchStatic } from "@aklinker1/aframe/server";
import { createApp, NoResponse } from "@aklinker1/zeta";
import { zodSchemaAdapter } from "@aklinker1/zeta/adapters/zod-schema-adapter";
import { version } from "../shared/constants";
import dedent from "dedent";
import { assetApis } from "./apis/asset-apis";
import { modelApis } from "./apis/model-apis";
import { chatApis } from "./apis/chat-apis";
import { siteApis } from "./apis/site-apis";
import { corsPlugin } from "./plugins/cors-plugin";
import { requestLoggerPlugin } from "./plugins/request-logger-plugin";

const apiApp = createApp({ prefix: "/api" })
  .use(modelApis)
  .use(chatApis)
  .use(siteApis)
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
  .mount(
    fetchStatic({
      // HTML files are served as-is; per-site template vars are applied
      // by the ask-ai.js endpoint via ?siteId= query param.
      onFetch: async (_path, file) => {
        if (!file.name?.endsWith(".html")) return;
        return new Response(await file.text(), {
          headers: { "content-type": file.type },
        });
      },
    }),
  );

export default app;

export type App = typeof app;
