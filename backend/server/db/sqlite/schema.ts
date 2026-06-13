import { index, int, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createId } from "@paralleldrive/cuid2";

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
