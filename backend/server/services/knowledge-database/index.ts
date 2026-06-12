import type { Site, SiteInsert, SitePatch } from "../../../shared/types";

export interface KnowledgeDatabase {
  sites: {
    /** Get all sites. */
    getAll: () => Promise<Site[]>;
    /** Get the default site — only returns a value when exactly one site exists. */
    getDefault: () => Promise<Site | undefined>;
    /** Get a site by its ID. */
    get: (id: Site["id"]) => Promise<Site | undefined>;
    /** Insert a site. */
    insert: (site: SiteInsert) => Promise<Site>;
    /** Update a site by its ID. */
    update: (id: Site["id"], patch: SitePatch) => Promise<Site | undefined>;
    /** Delete a site by its ID. */
    delete: (id: Site["id"]) => Promise<void>;
  };

  rateLimits: {
    /**
     * Sliding-window check for (ip, siteId).
     * Deletes stale entries, counts the window, and inserts a new entry if allowed.
     */
    check: (
      ip: string,
      siteId: string,
      limitRpm: number,
    ) => Promise<KnowledgeDatabase.RateLimitResult>;
    /** Delete all entries older than 60 s — called by daily cron. */
    cleanup: () => Promise<void>;
  };
}

export namespace KnowledgeDatabase {
  export type RateLimitResult =
    | { allowed: true; remaining: number }
    | { allowed: false; remaining: 0; resetInMs: number };
}
