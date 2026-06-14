import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
// @ts-expect-error: Ignore lack of declaration file
import askAiJsTemplate from "../assets/ask-ai.js" with { type: "text" };
import privacyPolicy from "../assets/privacy-policy.md" with { type: "text" };
import { applyAppTemplateVars } from "../utils/template-vars.js";
import { siteToConfig } from "../utils/site-config";
import { db } from "../dependencies";

export const assetApis = new Hono()
  .get("/ask-ai.js", async (c) => {
    const siteId = c.req.query("siteId");

    // If no siteId is provided fall back to the first site (e.g. the default
    // site seeded on first boot). This keeps the dev preview working without
    // a ?siteId= param.
    const site = siteId
      ? await db.sites.get(siteId)
      : await db.sites.getDefault();

    if (!site)
      throw new HTTPException(404, {
        message: siteId
          ? `Site '${siteId}' not found`
          : "siteId is required when multiple sites are configured",
      });

    c.header("Content-Type", "application/javascript");
    return c.body(
      applyAppTemplateVars(askAiJsTemplate as string, siteToConfig(site)),
    );
  })
  .get("/privacy-policy", (c) => {
    c.header("Content-Type", "text/markdown");
    return c.body(privacyPolicy as string);
  });
