import type { KnowledgeDatabase } from ".";
import type { Site } from "../../../shared/types";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "../../db/sqlite/schema";
import { and, count, eq, gt, lt, min } from "drizzle-orm";
import env from "../../utils/env";
import { logStartupInfo } from "../../utils/log";
import { Cron } from "croner";

const { sites, rateLimitEntries } = schema;

type DbSite = typeof sites.$inferSelect;

/** Map a Drizzle row (Date createdAt) to the shared Site type (string createdAt). */
function siteFromDb(row: DbSite): Site {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

export async function createSqliteKnowledgeDatabase(): Promise<KnowledgeDatabase> {
  const file = env.DATABASE_SQLITE_PATH;

  logStartupInfo("Database", [
    [
      { key: "type", value: "sqlite", color: "blue" },
      { key: "path", value: file, color: "cyan" },
    ],
  ]);

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

  // Setup jobs

  // Daily vacuum to minimize the database
  new Cron("@daily", () => db.run("VACUUM"));
  // Delete stale rate limit entries (older than 60 s) to keep the table lean
  new Cron("@daily", async () => {
    const windowStart = new Date(Date.now() - 60_000);
    await db
      .delete(rateLimitEntries)
      .where(lt(rateLimitEntries.createdAt, windowStart));
  });

  // Build KnowledgeDatabase abstraction

  const database: KnowledgeDatabase = {
    sites: {
      getAll: async () =>
        (await db.query.sites.findMany()).map(siteFromDb),
      getDefault: async () => {
        const rows = await db.query.sites.findMany({ limit: 2 });
        return rows.length === 1 ? siteFromDb(rows[0]) : undefined;
      },
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
        await db.delete(sites).where(eq(sites.id, id));
      },
    },

    rateLimits: {
      check: (ip, siteId, limitRpm) => {
        const windowStart = new Date(Date.now() - 60_000);

        return db.transaction(async (tx) => {
          // 1. Evict stale entries for this bucket
          await tx
            .delete(rateLimitEntries)
            .where(
              and(
                eq(rateLimitEntries.ip, ip),
                eq(rateLimitEntries.siteId, siteId),
                lt(rateLimitEntries.createdAt, windowStart),
              ),
            );

          // 2. Count remaining entries in the window
          const [{ value: currentCount }] = await tx
            .select({ value: count() })
            .from(rateLimitEntries)
            .where(
              and(
                eq(rateLimitEntries.ip, ip),
                eq(rateLimitEntries.siteId, siteId),
                gt(rateLimitEntries.createdAt, windowStart),
              ),
            );

          if (currentCount >= limitRpm) {
            // 3a. Reject — find when the oldest entry in the window expires
            const [oldest] = await tx
              .select({ createdAt: min(rateLimitEntries.createdAt) })
              .from(rateLimitEntries)
              .where(
                and(
                  eq(rateLimitEntries.ip, ip),
                  eq(rateLimitEntries.siteId, siteId),
                  gt(rateLimitEntries.createdAt, windowStart),
                ),
              );
            const oldestMs =
              oldest?.createdAt instanceof Date
                ? oldest.createdAt.getTime()
                : Number(oldest?.createdAt ?? Date.now());
            const resetInMs = Math.max(0, oldestMs + 60_000 - Date.now());
            return { allowed: false, remaining: 0, resetInMs } as const;
          }

          // 3b. Allow — record this request
          await tx
            .insert(rateLimitEntries)
            .values({ ip, siteId });

          return { allowed: true, remaining: limitRpm - currentCount - 1 } as const;
        });
      },

      cleanup: async () => {
        const windowStart = new Date(Date.now() - 60_000);
        await db
          .delete(rateLimitEntries)
          .where(lt(rateLimitEntries.createdAt, windowStart));
      },
    },
  };
  return database;
}
