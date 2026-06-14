import type { Site } from "../../shared/types";

/**
 * Runtime configuration for a single site, derived from a `Site` DB record.
 * `corsOrigin` is pre-parsed into a Set for O(1) lookup in the CORS plugin.
 */
export type SiteConfig = {
  id: string;
  name: string;
  docsUrl: string;
  appName: string;
  brandColor: string;
  brandContentColor: string;
  serverUrl: string;
  /** Comma-separated string stored in DB, parsed to a Set at load time. */
  corsOrigin: Set<string>;
  assistantIconUrl: string;
  systemPrompt: string;
  welcomeMessage: string;
};

export function siteToConfig(site: Site): SiteConfig {
  return {
    id: site.id,
    name: site.name,
    docsUrl: site.docsUrl,
    appName: site.appName,
    brandColor: site.brandColor,
    brandContentColor: site.brandContentColor,
    serverUrl: site.serverUrl,
    corsOrigin: new Set(
      site.corsOrigin
        .split(",")
        .map((o) => o.trim().replace(/\/$/, ""))
        .filter(Boolean),
    ),
    assistantIconUrl: site.assistantIconUrl,
    systemPrompt: site.systemPrompt,
    welcomeMessage: site.welcomeMessage,
  };
}
