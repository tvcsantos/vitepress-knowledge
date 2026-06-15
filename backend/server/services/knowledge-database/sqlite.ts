import type { KnowledgeDatabase, KnowledgeFile } from ".";
import type { Site } from "../../../shared/types";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "../../db/sqlite/schema";
import { and, eq } from "drizzle-orm";
import env from "../../utils/env";
import { createLogger } from "../../utils/logger";
import { Cron } from "croner";

const log = createLogger("db");

const { sites, knowledgeFiles } = schema;

type DbSite = typeof sites.$inferSelect;
type DbKnowledgeFile = typeof knowledgeFiles.$inferSelect;

/** Map a Drizzle row (Date updatedAt) to the KnowledgeFile type (string updatedAt). */
function knowledgeFileFromDb(row: DbKnowledgeFile): KnowledgeFile {
  return {
    id: row.id,
    siteId: row.siteId,
    filename: row.filename,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Map a Drizzle row (Date createdAt) to the shared Site type (string createdAt). */
function siteFromDb(row: DbSite): Site {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

export async function createSqliteKnowledgeDatabase(): Promise<KnowledgeDatabase> {
  const file = env.DATABASE_SQLITE_PATH;

  log.info({ type: "sqlite", path: file }, "Opening database");

  await mkdir(dirname(file), { recursive: true });
  const db = drizzle(file, {
    casing: "snake_case",
    schema,
    // Uncomment to log SQL queries
    // logger: {
    //   logQuery: console.debug,
    // },
  });

  migrate(db, { migrationsFolder: "server/drizzle/sqlite" });
  db.run(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
  `);
  log.info("Database ready (migrations applied)");

  // Setup jobs

  // Daily vacuum to minimize the database
  new Cron("@daily", () => db.run("VACUUM"));

  // Build KnowledgeDatabase abstraction

  const database: KnowledgeDatabase = {
    knowledgeFiles: {
      getAll: async (siteId) => {
        const rows = await db.query.knowledgeFiles.findMany({
          where: eq(knowledgeFiles.siteId, siteId),
        });
        return rows.map(knowledgeFileFromDb);
      },
      upsert: async (siteId, filename) => {
        const existing = await db.query.knowledgeFiles.findFirst({
          where: and(
            eq(knowledgeFiles.siteId, siteId),
            eq(knowledgeFiles.filename, filename),
          ),
        });
        if (existing) {
          const [row] = await db
            .update(knowledgeFiles)
            .set({ updatedAt: new Date() })
            .where(eq(knowledgeFiles.id, existing.id))
            .returning();
          return knowledgeFileFromDb(row);
        }
        const [row] = await db
          .insert(knowledgeFiles)
          .values({ siteId, filename })
          .returning();
        return knowledgeFileFromDb(row);
      },
      delete: async (id) => {
        await db.delete(knowledgeFiles).where(eq(knowledgeFiles.id, id));
      },
      deleteAll: async (siteId) => {
        await db
          .delete(knowledgeFiles)
          .where(eq(knowledgeFiles.siteId, siteId));
      },
    },

    sites: {
      getAll: async () => (await db.query.sites.findMany()).map(siteFromDb),
      get: async (id) => {
        const row = await db.query.sites.findFirst({ where: eq(sites.id, id) });
        return row ? siteFromDb(row) : undefined;
      },
      insert: async (site) => {
        const [result] = await db.insert(sites).values(site).returning();
        return siteFromDb(result);
      },
      update: async (id, patch) => {
        const [result] = await db
          .update(sites)
          .set(patch)
          .where(eq(sites.id, id))
          .returning();
        return result ? siteFromDb(result) : undefined;
      },
      delete: async (id) => {
        await db.delete(knowledgeFiles).where(eq(knowledgeFiles.siteId, id));
        await db.delete(sites).where(eq(sites.id, id));
      },
    },
  };
  return database;
}
