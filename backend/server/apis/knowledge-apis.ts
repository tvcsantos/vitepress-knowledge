import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  invalidateKnowledgeCache,
  knowledgeDir,
} from "../utils/knowledge-files";
import { db } from "../dependencies";
import env from "../utils/env";

function requireAdmin(request: Request): void {
  if (!env.ADMIN_TOKEN) return;
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  if (token !== env.ADMIN_TOKEN) {
    throw new HTTPException(401, { message: "Invalid or missing ADMIN_TOKEN" });
  }
}

export const knowledgeApis = new Hono()
  // List all stored knowledge files for a site.
  .get("/:id/knowledge", async (c) => {
    requireAdmin(c.req.raw);
    const id = c.req.param("id");
    const site = await db.sites.get(id);
    if (!site)
      throw new HTTPException(404, { message: `Site '${id}' not found` });
    return c.json(await db.knowledgeFiles.getAll(id));
  })
  // Upload or replace a knowledge file for a site via multipart/form-data.
  // The filename from the uploaded file is used as the storage key.
  .put("/:id/knowledge", async (c) => {
    requireAdmin(c.req.raw);
    const id = c.req.param("id");
    const site = await db.sites.get(id);
    if (!site)
      throw new HTTPException(404, { message: `Site '${id}' not found` });

    const formData = await c.req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new HTTPException(400, {
        message: "Missing 'file' field in multipart form data",
      });
    }
    const filename = file.name;
    const content = await file.text();

    const dir = knowledgeDir(id);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, filename), content, "utf-8");

    const metadata = await db.knowledgeFiles.upsert(id, filename);
    invalidateKnowledgeCache(id);
    return c.json(metadata);
  })
  // Delete all stored knowledge files for a site, reverting to the docsUrl fetch fallback.
  .delete("/:id/knowledge", async (c) => {
    requireAdmin(c.req.raw);
    const id = c.req.param("id");
    const site = await db.sites.get(id);
    if (!site)
      throw new HTTPException(404, { message: `Site '${id}' not found` });

    const dir = knowledgeDir(id);
    await rm(dir, { recursive: true, force: true });
    await db.knowledgeFiles.deleteAll(id);
    invalidateKnowledgeCache(id);
    return c.body(null, 204);
  })
  // Delete a single stored knowledge file by its ID.
  .delete("/:id/knowledge/:fileId", async (c) => {
    requireAdmin(c.req.raw);
    const id = c.req.param("id");
    const fileId = c.req.param("fileId");
    const files = await db.knowledgeFiles.getAll(id);
    const file = files.find((f) => f.id === fileId);
    if (file) {
      const dir = knowledgeDir(id);
      await rm(join(dir, file.filename), { force: true });
      await db.knowledgeFiles.delete(fileId);
      invalidateKnowledgeCache(id);
    }
    return c.body(null, 204);
  });
