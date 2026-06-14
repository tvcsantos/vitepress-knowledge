import { Mutex } from "async-mutex";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { KnowledgeDatabase } from "../services/knowledge-database";
import env from "./env";

type Knowledge = {
  files: string[];
};

// Per-site cache keyed by siteId
const cache = new Map<string, Promise<Knowledge>>();
const mutexes = new Map<string, Mutex>();

setInterval(
  () => {
    cache.clear();
  },
  // Cache knowledge for up to 1 hour.
  60 * 60e3,
);

function getMutex(siteId: string): Mutex {
  let mutex = mutexes.get(siteId);
  if (!mutex) {
    mutex = new Mutex();
    mutexes.set(siteId, mutex);
  }
  return mutex;
}

/** Base directory where knowledge files are stored on the PVC. */
export function knowledgeDir(siteId: string): string {
  return join(dirname(env.DATABASE_SQLITE_PATH), "knowledge", siteId);
}

export function getKnowledgeFiles(
  siteId: string,
  docsUrl: string,
  db: KnowledgeDatabase,
): Promise<Knowledge> {
  const cached = cache.get(siteId);
  if (cached) return cached;

  return getMutex(siteId).runExclusive(async (): Promise<Knowledge> => {
    // Double-check after acquiring the lock
    const cachedAfterLock = cache.get(siteId);
    if (cachedAfterLock) return cachedAfterLock;

    // Check DB for stored knowledge file metadata first.
    const storedFiles = await db.knowledgeFiles.getAll(siteId);
    if (storedFiles.length > 0) {
      const dir = knowledgeDir(siteId);
      const files = await Promise.all(
        storedFiles.map((f) => readFile(join(dir, f.filename), "utf-8")),
      );
      const knowledge: Knowledge = { files };
      const resolved = Promise.resolve(knowledge);
      cache.set(siteId, resolved);
      return knowledge;
    }

    // Fall back to fetching from docsUrl.
    const index: string[] = await fetch(`${docsUrl}/knowledge/index.json`).then(
      (res) => res.json(),
    );

    const files = await Promise.all(
      index.map((file) => fetch(`${docsUrl}${file}`).then((res) => res.text())),
    );

    const knowledge: Knowledge = { files };
    const resolved = Promise.resolve(knowledge);
    cache.set(siteId, resolved);
    return knowledge;
  });
}

/** Evict the cached knowledge for a specific site (e.g. after docsUrl update). */
export function invalidateKnowledgeCache(siteId: string): void {
  cache.delete(siteId);
}
