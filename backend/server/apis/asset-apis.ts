import { createApp, NotFoundHttpError } from "@aklinker1/zeta";
// @ts-expect-error: Ignore lack of declaration file
import askAiJsTemplate from "../assets/ask-ai.js" with { type: "text" };
import privacyPolicy from "../assets/privacy-policy.md" with { type: "text" };
import { applyAppTemplateVars } from "../utils/template-vars.js";
import { siteToConfig } from "../utils/site-config";
import { decorateContextPlugin } from "../plugins/decorate-context-plugin";
import dedent from "dedent";
import z from "zod";

export const assetApis = createApp()
  .use(decorateContextPlugin)
  .get(
    "/ask-ai.js",
    {
      operationId: "getVitepressJs",
      summary: "Get VitePress JS",
      description: dedent`
      Get the JavaScript responsible for adding the "Ask AI" button and chat window to your VitePress site.

      Pass the \`siteId\` query parameter to get the JS configured for that specific site.

      \`\`\`html
      <script defer async src="https://chat.mydocs.com/ask-ai.js?siteId=YOUR_SITE_ID"></script>
      \`\`\`
    `,
      responses: z.string().meta({ contentType: "application/javascript" }),
    },
    async ({ url, db }) => {
      const siteId = url.searchParams.get("siteId");

      // If no siteId is provided fall back to the first site (e.g. the default
      // site seeded on first boot). This keeps the dev preview working without
      // a ?siteId= param.
      const site = siteId
        ? await db.sites.get(siteId)
        : await db.sites.getDefault();

      if (!site) throw new NotFoundHttpError(
        siteId
          ? `Site '${siteId}' not found`
          : "siteId is required when multiple sites are configured",
      );

      return applyAppTemplateVars(askAiJsTemplate as string, siteToConfig(site));
    },
  )
  .get(
    "/privacy-policy",
    {
      operationId: "getPrivacyPolicy",
      responses: z.string().meta({ contentType: "text/markdown" }),
      description: dedent`
        The server hosts a copy of \`vitepress-knowledge\`'s privacy policy at this endpoint.
      `,
    },
    () => privacyPolicy,
  );
