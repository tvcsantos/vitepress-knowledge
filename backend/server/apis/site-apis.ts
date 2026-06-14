import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";
import { SiteInsert, SitePatch } from "../../shared/types";
import { invalidateCorsCache } from "../plugins/cors-plugin";
import { invalidateKnowledgeCache } from "../utils/knowledge-files";
import { db } from "../dependencies";
import env from "../utils/env";

function requireAdmin(request: Request): void {
  if (!env.ADMIN_TOKEN) return; // No token configured — open access
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  if (token !== env.ADMIN_TOKEN) {
    throw new HTTPException(401, { message: "Invalid or missing ADMIN_TOKEN" });
  }
}

export const siteApis = new Hono()
  // List all registered sites.
  .get("/", async (c) => {
    requireAdmin(c.req.raw);
    return c.json(await db.sites.getAll());
  })
  // Get the default site (only when exactly one site exists; null otherwise).
  .get("/default", async (c) => {
    return c.json((await db.sites.getDefault()) ?? null);
  })
  // Create a new site.
  .post("/", zValidator("json", SiteInsert), async (c) => {
    requireAdmin(c.req.raw);
    return c.json(await db.sites.insert(c.req.valid("json")));
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
    return c.json(site);
  })
  // Delete a site by ID.
  .delete("/:id", async (c) => {
    requireAdmin(c.req.raw);
    const id = c.req.param("id");
    await db.sites.delete(id);
    invalidateCorsCache(id);
    invalidateKnowledgeCache(id);
    return c.body(null, 204);
  });
