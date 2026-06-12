import type { KnowledgeDatabase } from "../services/knowledge-database";
import env from "./env";
import consola from "consola";

/**
 * On first boot, if no sites exist in the database, insert a "default" site
 * populated from the legacy single-site env vars. This ensures existing
 * single-site deployments keep working without any config changes.
 */
export async function seedDefaultSite(db: KnowledgeDatabase): Promise<void> {
  const existing = await db.sites.getAll();
  if (existing.length > 0) return;

  consola.info(
    "[seed] No sites found — seeding default site from environment variables",
  );

  await db.sites.insert({
    name: env.DEFAULT_SITE_NAME,
    docsUrl: env.DEFAULT_SITE_DOCS_URL,
    appName: env.DEFAULT_SITE_APP_NAME,
    brandColor: env.DEFAULT_SITE_BRAND_COLOR,
    brandContentColor: env.DEFAULT_SITE_BRAND_CONTENT_COLOR,
    serverUrl: env.DEFAULT_SITE_SERVER_URL,
    corsOrigin: env.DEFAULT_SITE_CORS_ORIGIN,
    assistantIconUrl: env.DEFAULT_SITE_ASSISTANT_ICON_URL,
    systemPrompt: env.DEFAULT_SITE_SYSTEM_PROMPT,
    welcomeMessage: env.DEFAULT_SITE_WELCOME_MESSAGE,
    rateLimitRpm: null,
  });

  consola.success("[seed] Default site created");
}
