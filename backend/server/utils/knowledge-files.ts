import { Mutex } from "async-mutex";

type Knowledge = {
  index: string[];
  version: string;
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

export function getKnowledgeFiles(
  siteId: string,
  docsUrl: string,
): Promise<Knowledge> {
  const cached = cache.get(siteId);
  if (cached) return cached;

  return getMutex(siteId).runExclusive(async (): Promise<Knowledge> => {
    // Double-check after acquiring the lock
    const cachedAfterLock = cache.get(siteId);
    if (cachedAfterLock) return cachedAfterLock;

    const index: string[] = await fetch(`${docsUrl}/knowledge/index.json`).then(
      (res) => res.json(),
    );

    const files = await Promise.all(
      index.map((file) => fetch(`${docsUrl}${file}`).then((res) => res.text())),
    );

    const knowledge: Knowledge = {
      index,
      version: "",
      files,
    };
    const resolved = Promise.resolve(knowledge);
    cache.set(siteId, resolved);
    return knowledge;
  });
}

/** Evict the cached knowledge for a specific site (e.g. after docsUrl update). */
export function invalidateKnowledgeCache(siteId: string): void {
  cache.delete(siteId);
}
