import type { Site, SiteInsert, SitePatch } from "../../../shared/types";

export interface KnowledgeFile {
  id: string;
  siteId: string;
  filename: string;
  updatedAt: string;
}

export interface KnowledgeDatabase {
  knowledgeFiles: {
    /** Get all stored knowledge file metadata for a site. */
    getAll: (siteId: string) => Promise<KnowledgeFile[]>;
    /** Upsert a knowledge file metadata entry (insert or replace by siteId + filename). */
    upsert: (siteId: string, filename: string) => Promise<KnowledgeFile>;
    /** Delete a single knowledge file metadata entry by ID. */
    delete: (id: string) => Promise<void>;
    /** Delete all knowledge file metadata entries for a site. */
    deleteAll: (siteId: string) => Promise<void>;
  };

  sites: {
    /** Get all sites. */
    getAll: () => Promise<Site[]>;
    /** Get a site by its ID. */
    get: (id: Site["id"]) => Promise<Site | undefined>;
    /** Insert a site. */
    insert: (site: SiteInsert) => Promise<Site>;
    /** Update a site by its ID. */
    update: (id: Site["id"], patch: SitePatch) => Promise<Site | undefined>;
    /** Delete a site by its ID. */
    delete: (id: Site["id"]) => Promise<void>;
  };
}
