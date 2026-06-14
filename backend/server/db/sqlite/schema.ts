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
  createdAt: int({ mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const knowledgeFiles = sqliteTable(
  "knowledge_files",
  {
    id: text().primaryKey().$defaultFn(createId),
    siteId: text().notNull(),
    filename: text().notNull(),
    updatedAt: int({ mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("knowledge_files_site_filename_idx").on(t.siteId, t.filename)],
);


