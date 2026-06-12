import type { SiteConfig } from "./site-config";

function welcomeMessageVars(site: SiteConfig) {
  return {
    APP_NAME: site.appName,
    ASSISTANT_ICON_URL: site.assistantIconUrl,
    DOCS_URL: site.docsUrl,
    SERVER_URL: site.serverUrl,
  };
}

export function applyAppTemplateVars(
  template: string,
  site: SiteConfig,
): string {
  const welcomeVars = welcomeMessageVars(site);
  return applyTemplateVars(template, {
    ...welcomeVars,
    BRAND_COLOR: site.brandColor,
    BRAND_CONTENT_COLOR: site.brandContentColor,
    WELCOME_MESSAGE: applyTemplateVars(site.welcomeMessage, welcomeVars),
    SITE_ID: site.id,
  });
}

export function applySystemPromptTemplateVars(
  template: string,
  knowledge: string,
  site: SiteConfig,
): string {
  return applyTemplateVars(template, {
    ...welcomeMessageVars(site),
    WELCOME_MESSAGE: site.welcomeMessage,
    KNOWLEDGE: knowledge,
  });
}

export function applyTemplateVars(
  template: string,
  vars: Record<string, string>,
): string {
  return Object.entries(vars).reduce(
    (template, [name, value]) => template.replaceAll(`{{ ${name} }}`, value),
    template,
  );
}
