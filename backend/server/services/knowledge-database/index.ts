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

  conversations: {
    /** Get a conversation by its ID. */
    get: (
      id: KnowledgeDatabase.Conversation["id"],
    ) => Promise<KnowledgeDatabase.ConversationWithMessages | undefined>;
    /** Insert a conversation. */
    insert: (
      conversation: KnowledgeDatabase.ConversationInsert,
    ) => Promise<KnowledgeDatabase.Conversation>;
    /** Get or insert a conversation. */
    getOrInsert: (
      conversation: KnowledgeDatabase.ConversationInsert,
    ) => Promise<KnowledgeDatabase.Conversation>;
  };

  messages: {
    /** Get a message by its ID. */
    get: (
      id: KnowledgeDatabase.Message["id"],
    ) => Promise<KnowledgeDatabase.Message | undefined>;
    /** Insert a message. */
    insert: (
      conversationId: KnowledgeDatabase.Conversation["id"],
      message: KnowledgeDatabase.MessageInsert,
    ) => Promise<KnowledgeDatabase.Message>;
    /** Get or insert a message. */
    getOrInsert: (
      conversationId: KnowledgeDatabase.Conversation["id"],
      message: KnowledgeDatabase.MessageInsert,
    ) => Promise<KnowledgeDatabase.Message>;
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
  export type ConversationInsert = {
    id?: string;
    siteId: string;
  };
  export type Conversation = {
    id: string;
    siteId: string | null;
    createdAt: Date;
  };
  export type ConversationWithMessagesInsert = ConversationInsert & {
    messages: KnowledgeDatabase.MessageInsert[];
  };
  export type ConversationWithMessages = Conversation & {
    messages: KnowledgeDatabase.Message[];
  };

  export type MessageInsert = {
    id?: string;
    content: string;
    role: "user" | "assistant";
  };
  export type Message = {
    id: string;
    content: string;
    role: "user" | "assistant";
    createdAt: Date;
  };

  export type RateLimitResult =
    | { allowed: true; remaining: number }
    | { allowed: false; remaining: 0; resetInMs: number };
}
