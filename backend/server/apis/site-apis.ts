import { createApp, NoResponse, NotFoundHttpError, UnauthorizedHttpError } from "@aklinker1/zeta";
import dedent from "dedent";
import z from "zod";
import { Site, SiteInsert, SitePatch } from "../../shared/types";
import { decorateContextPlugin } from "../plugins/decorate-context-plugin";
import { invalidateSiteCache } from "../plugins/resolve-site-plugin";
import { invalidateCorsCache } from "../plugins/cors-plugin";
import { invalidateKnowledgeCache } from "../utils/knowledge-files";
import env from "../utils/env";

function requireAdmin(request: Request): void {
  if (!env.ADMIN_TOKEN) return; // No token configured — open access
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  if (token !== env.ADMIN_TOKEN) {
    throw new UnauthorizedHttpError("Invalid or missing ADMIN_TOKEN");
  }
}

const idParam = { params: z.object({ id: z.string() }) };

export const siteApis = createApp({ prefix: "/sites" })
  .use(decorateContextPlugin)
  .get(
    "/",
    {
      operationId: "listSites",
      description: dedent`List all registered sites.`,
      responses: z.array(Site),
    },
    async ({ request, db }) => {
      requireAdmin(request);
      return db.sites.getAll();
    },
  )
  .get(
    "/default",
    {
      operationId: "getDefaultSite",
      description: dedent`Get the default site. Only returns a site when exactly one site exists; returns null when zero or multiple sites are configured (siteId must be provided explicitly in that case).`,
      responses: Site.nullable(),
    },
    async ({ db }) => {
      return (await db.sites.getDefault()) ?? null;
    },
  )
  .post(
    "/",
    {
      operationId: "createSite",
      description: dedent`Create a new site.`,
      body: SiteInsert,
      responses: Site,
    },
    async ({ request, body, db }) => {
      requireAdmin(request);
      return db.sites.insert(body);
    },
  )
  .get(
    "/:id",
    {
      operationId: "getSite",
      description: dedent`Get a site by ID.`,
      ...idParam,
      responses: Site,
    },
    async ({ request, params, db }) => {
      requireAdmin(request);
      const site = await db.sites.get(params.id);
      if (!site) throw new NotFoundHttpError(`Site '${params.id}' not found`);
      return site;
    },
  )
  .method(
    "PATCH",
    "/:id",
    {
      operationId: "updateSite",
      description: dedent`Update a site by ID.`,
      ...idParam,
      body: SitePatch,
      responses: Site,
    },
    async ({ request, params, body, db }) => {
      requireAdmin(request);
      const site = await db.sites.update(params.id, body);
      if (!site) throw new NotFoundHttpError(`Site '${params.id}' not found`);
      // Invalidate caches so the next request picks up the new config
      invalidateSiteCache(params.id);
      invalidateCorsCache(params.id);
      if (body.docsUrl) invalidateKnowledgeCache(params.id);
      return site;
    },
  )
  .delete(
    "/:id",
    {
      operationId: "deleteSite",
      description: dedent`Delete a site by ID.`,
      ...idParam,
      responses: NoResponse,
    },
    async ({ request, params, db }) => {
      requireAdmin(request);
      await db.sites.delete(params.id);
      invalidateSiteCache(params.id);
      invalidateCorsCache(params.id);
      invalidateKnowledgeCache(params.id);
    },
  );
