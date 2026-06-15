import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";
import { SiteInsert, SitePatch } from "../../shared/types";
import { invalidateCorsCache } from "../plugins/cors-plugin";
import { invalidateKnowledgeCache } from "../utils/knowledge-files";
import { requireAdmin } from "../utils/admin";
import { db } from "../dependencies";
import { createLogger } from "../utils/logger";

const log = createLogger("sites");

export const siteApis = new Hono()
  // List all registered sites.
  .get("/", async (c) => {
    requireAdmin(c.req.raw);
    return c.json(await db.sites.getAll());
  })
  // Create a new site.
  .post("/", zValidator("json", SiteInsert), async (c) => {
    requireAdmin(c.req.raw);
    const site = await db.sites.insert(c.req.valid("json"));
    log.info({ siteId: site.id, name: site.name }, "Site created");
    return c.json(site);
  })
  // Get a site by ID.
  .get("/:id", async (c) => {
    requireAdmin(c.req.raw);
    const id = c.req.param("id");
    const site = await db.sites.get(id);
    if (!site)
      throw new HTTPException(404, { message: `Site '${id}' not found` });
    return c.json(site);
  })
  // Update a site by ID.
  .patch("/:id", zValidator("json", SitePatch), async (c) => {
    requireAdmin(c.req.raw);
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const site = await db.sites.update(id, body);
    if (!site)
      throw new HTTPException(404, { message: `Site '${id}' not found` });
    // Invalidate caches so the next request picks up the new config
    invalidateCorsCache(id);
    if (body.docsUrl) invalidateKnowledgeCache(id);
    log.info({ siteId: id, fields: Object.keys(body) }, "Site updated");
    return c.json(site);
  })
  // Delete a site by ID.
  .delete("/:id", async (c) => {
    requireAdmin(c.req.raw);
    const id = c.req.param("id");
    await db.sites.delete(id);
    invalidateCorsCache(id);
    invalidateKnowledgeCache(id);
    log.info({ siteId: id }, "Site deleted");
    return c.body(null, 204);
  });
