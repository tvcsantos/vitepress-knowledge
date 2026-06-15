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

    if (!siteId)
      throw new HTTPException(400, {
        message: "siteId query param is required",
      });

    const site = await db.sites.get(siteId);

    if (!site)
      throw new HTTPException(404, { message: `Site '${siteId}' not found` });

    c.header("Content-Type", "application/javascript");
    return c.body(
      applyAppTemplateVars(askAiJsTemplate as string, siteToConfig(site)),
    );
  })
  .get("/privacy-policy", (c) => {
    c.header("Content-Type", "text/markdown");
    return c.body(privacyPolicy as string);
  });
