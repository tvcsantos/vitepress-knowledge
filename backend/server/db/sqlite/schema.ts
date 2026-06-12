import { index, int, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createId } from "@paralleldrive/cuid2";
import { relations } from "drizzle-orm";

export const sites = sqliteTable("sites", {
  id: text().primaryKey().$defaultFn(createId),
  name: text().notNull(),
  docsUrl: text().notNull(),
  appName: text().notNull(),
  brandColor: text().notNull(),
  brandContentColor: text().notNull(),
  serverUrl: text().notNull(),
  corsOrigin: text().notNull(),
  assistantIconUrl: text().notNull(),
  systemPrompt: text().notNull(),
  welcomeMessage: text().notNull(),
  // null = fall back to global RATE_LIMIT_RPM env var
  rateLimitRpm: int(),
  createdAt: int({ mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
export const siteRelations = relations(sites, ({ many }) => ({
  conversations: many(conversations),
}));

export const conversations = sqliteTable("conversations", {
  id: text().primaryKey().$defaultFn(createId),
  // Nullable so existing rows are unaffected by migration; backfilled on startup
  siteId: text().references(() => sites.id, { onDelete: "cascade" }),
  createdAt: int({ mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
export const conversationRelations = relations(conversations, ({ many, one }) => ({
  messages: many(messages),
  site: one(sites, {
    fields: [conversations.siteId],
    references: [sites.id],
  }),
}));

export const messages = sqliteTable(
  "messages",
  {
    id: text().primaryKey().$defaultFn(createId),
    conversationId: text()
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    createdAt: int({ mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    role: text({ enum: ["user", "assistant"] }).notNull(),
    content: text().notNull(),
  },
  (t) => [index("messages_conversation_id_idx").on(t.conversationId)],
);

export const messageRelations = relations(messages, ({ one }) => ({
  conversations: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

export const rateLimitEntries = sqliteTable(
  "rate_limit_entries",
  {
    id: text().primaryKey().$defaultFn(createId),
    ip: text().notNull(),
    siteId: text().notNull(),
    createdAt: int({ mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("rate_limit_ip_site_created_idx").on(t.ip, t.siteId, t.createdAt)],
);
