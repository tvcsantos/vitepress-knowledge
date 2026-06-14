import { createApp, NoResponse, NotFoundHttpError, UnauthorizedHttpError } from "@aklinker1/zeta";
import dedent from "dedent";
import z from "zod";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { decorateContextPlugin } from "../plugins/decorate-context-plugin";
import { invalidateKnowledgeCache, knowledgeDir } from "../utils/knowledge-files";
import env from "../utils/env";

function requireAdmin(request: Request): void {
  if (!env.ADMIN_TOKEN) return;
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  if (token !== env.ADMIN_TOKEN) {
    throw new UnauthorizedHttpError("Invalid or missing ADMIN_TOKEN");
  }
}

const KnowledgeFile = z.object({
  id: z.string(),
  siteId: z.string(),
  filename: z.string(),
  updatedAt: z.string().datetime(),
}).meta({ ref: "KnowledgeFile" });

const idParam = { params: z.object({ id: z.string() }) };
const idFileIdParam = { params: z.object({ id: z.string(), fileId: z.string() }) };

export const knowledgeApis = createApp({ prefix: "/sites" })
  .use(decorateContextPlugin)
  .get(
    "/:id/knowledge",
    {
      operationId: "listKnowledgeFiles",
      description: dedent`List all stored knowledge files for a site.`,
      ...idParam,
      responses: z.array(KnowledgeFile),
    },
    async ({ request, params, db }) => {
      requireAdmin(request);
      const site = await db.sites.get(params.id);
      if (!site) throw new NotFoundHttpError(`Site '${params.id}' not found`);
      return db.knowledgeFiles.getAll(params.id);
    },
  )
  .put(
    "/:id/knowledge",
    {
      operationId: "uploadKnowledgeFile",
      description: dedent`
        Upload or replace a knowledge file for a site via multipart/form-data.
        The filename from the uploaded file is used as the storage key.
        If a file with the same name already exists it will be replaced.
        Invalidates the knowledge cache for the site.
      `,
      ...idParam,
      responses: KnowledgeFile,
    },
    async (ctx): Promise<any> => {
      const { request, params, db } = ctx;
      requireAdmin(request);
      const site = await db.sites.get(params.id);
      if (!site) throw new NotFoundHttpError(`Site '${params.id}' not found`);

      // Zeta deserializes multipart/form-data into a FormData object on ctx.body.
      const formData: FormData = (ctx as any).body as FormData;
      const file = formData.get("file") as File | null;
      if (!file) throw new Error("Missing 'file' field in multipart form data");
      const filename = file.name;
      const content = await file.text();

      const dir = knowledgeDir(params.id);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, filename), content, "utf-8");

      const metadata = await db.knowledgeFiles.upsert(params.id, filename);
      invalidateKnowledgeCache(params.id);
      return metadata;
    },
  )
  .delete(
    "/:id/knowledge",
    {
      operationId: "deleteAllKnowledgeFiles",
      description: dedent`Delete all stored knowledge files for a site, reverting to the docsUrl fetch fallback.`,
      ...idParam,
      responses: NoResponse,
    },
    async ({ request, params, db }) => {
      requireAdmin(request);
      const site = await db.sites.get(params.id);
      if (!site) throw new NotFoundHttpError(`Site '${params.id}' not found`);

      const dir = knowledgeDir(params.id);
      await rm(dir, { recursive: true, force: true });
      await db.knowledgeFiles.deleteAll(params.id);
      invalidateKnowledgeCache(params.id);
    },
  )
  .delete(
    "/:id/knowledge/:fileId",
    {
      operationId: "deleteKnowledgeFile",
      description: dedent`Delete a single stored knowledge file by its ID.`,
      ...idFileIdParam,
      responses: NoResponse,
    },
    async ({ request, params, db }) => {
      requireAdmin(request);
      const files = await db.knowledgeFiles.getAll(params.id);
      const file = files.find((f) => f.id === params.fileId);
      if (file) {
        const dir = knowledgeDir(params.id);
        await rm(join(dir, file.filename), { force: true });
        await db.knowledgeFiles.delete(params.fileId);
        invalidateKnowledgeCache(params.id);
      }
    },
  );
