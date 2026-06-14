import { createMiddleware } from "hono/factory";
import { db } from "../dependencies";
import { siteToConfig } from "../utils/site-config";
import { createLogger } from "../utils/logger";

const log = createLogger("cors");

// Sync cache: siteId -> allowed origins Set (TTL 5 min)
const originCache = new Map<
  string,
  { origins: Set<string>; expiresAt: number }
>();
const CACHE_TTL_MS = 5 * 60 * 1_000;

/** Warm the cache for a given siteId (async, fire-and-forget). */
function warmCache(siteId: string): void {
  db.sites
    .get(siteId)
    .then((site) => {
      if (!site) return;
      originCache.set(siteId, {
        origins: siteToConfig(site).corsOrigin,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
    })
    .catch((err) =>
      log.warn({ siteId, err }, "Failed to warm CORS origin cache"),
    );
}

/** Resolve allowed origins for a siteId synchronously from cache. */
function getCachedOrigins(siteId: string): Set<string> | undefined {
  const entry = originCache.get(siteId);
  if (!entry) {
    warmCache(siteId); // populate for next request
    return undefined;
  }
  if (entry.expiresAt <= Date.now()) {
    warmCache(siteId); // refresh in background, use stale for this request
  }
  return entry.origins;
}

export function invalidateCorsCache(siteId: string): void {
  originCache.delete(siteId);
}

const CORS_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const CORS_HEADERS = "Content-Type, Authorization, X-Site-ID";

/** Per-site dynamic CORS. Reads siteId from the X-Site-ID header or ?siteId= query param. */
export const corsMiddleware = createMiddleware(async (c, next) => {
  const siteId = c.req.header("x-site-id") ?? c.req.query("siteId");
  const allowedOrigins = siteId ? getCachedOrigins(siteId) : undefined;

  const origin = c.req.header("origin") ?? "";
  const allowed = !!origin && !!allowedOrigins?.has(origin);
  if (allowed) {
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Access-Control-Allow-Methods", CORS_METHODS);
    c.header("Access-Control-Allow-Headers", CORS_HEADERS);
  }

  if (origin) log.debug({ siteId, origin, allowed }, "CORS check");

  if (c.req.method === "OPTIONS") return c.body(null, 204);

  await next();
});
