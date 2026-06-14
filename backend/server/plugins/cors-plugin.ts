import { createApp } from "@aklinker1/zeta";
import consola from "consola";
import { container } from "../dependencies";
import { siteToConfig } from "../utils/site-config";

// Sync cache: siteId -> allowed origins Set (TTL 5 min)
const originCache = new Map<string, { origins: Set<string>; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1_000;

/** Warm the cache for a given siteId (async, fire-and-forget). */
function warmCache(siteId: string): void {
  const { db } = container.resolveAll();
  db.sites.get(siteId).then((site) => {
    if (!site) return;
    originCache.set(siteId, {
      origins: siteToConfig(site).corsOrigin,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
  });
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

/** Read siteId from JSON body, X-Site-ID header, or ?siteId= query param — synchronously. */
function getSiteIdSync(request: Request): string | null {
  const headerSiteId = request.headers.get("x-site-id");
  if (headerSiteId) return headerSiteId;
  return new URL(request.url).searchParams.get("siteId");
}

export function invalidateCorsCache(siteId: string): void {
  originCache.delete(siteId);
}

const CORS_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const CORS_HEADERS = "Content-Type, Authorization, X-Site-ID";

export const corsPlugin = createApp()
  .onGlobalRequest(({ request, set }) => {
    const siteId = getSiteIdSync(request);
    const allowedOrigins = siteId ? getCachedOrigins(siteId) : undefined;

    const origin = request.headers.get("origin") ?? "";
    if (allowedOrigins?.has(origin)) {
      set.headers["Access-Control-Allow-Origin"] = origin;
      set.headers["Access-Control-Allow-Methods"] = CORS_METHODS;
      set.headers["Access-Control-Allow-Headers"] = CORS_HEADERS;
    }

    consola.debug("CORS:", { origin, allowed: allowedOrigins, headers: set.headers });

    if (request.method === "OPTIONS")
      return new Response("", { status: 200, headers: set.headers });
  })
  .export();
