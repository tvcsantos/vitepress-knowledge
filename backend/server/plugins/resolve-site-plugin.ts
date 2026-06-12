import { container } from "../dependencies";
import { siteToConfig, type SiteConfig } from "../utils/site-config";
import type { Site } from "../../shared/types";

// In-memory cache: siteId → SiteConfig (TTL 5 minutes)
const siteCache = new Map<string, { config: SiteConfig; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function resolveSite(siteId: string): Promise<SiteConfig | undefined> {
  const now = Date.now();
  const cached = siteCache.get(siteId);
  if (cached && cached.expiresAt > now) return cached.config;

  const { db } = container.resolveAll();
  const site: Site | undefined = await db.sites.get(siteId);
  if (!site) return undefined;

  const config = siteToConfig(site);
  siteCache.set(siteId, { config, expiresAt: now + CACHE_TTL_MS });
  return config;
}

/** Evict a site from the resolve cache (e.g. after PATCH /api/sites/:id). */
export function invalidateSiteCache(siteId: string): void {
  siteCache.delete(siteId);
}
