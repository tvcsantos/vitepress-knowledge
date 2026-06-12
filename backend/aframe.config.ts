import { defineConfig } from "@aklinker1/aframe";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { Plugin } from "vite";
import { applyAppTemplateVars } from "./server/utils/template-vars";
import env from "./server/utils/env";

const SERVER_PORT = Number(process.env.PORT) || 5174;

/** Apply template variables just like production server, using the default site config from env. */
function applyTemplateVars(): Plugin {
  return {
    apply: "serve",
    name: "backend:apply-template-vars",
    async transformIndexHtml(html) {
      // Resolve the real default site ID from the running dev server so that
      // SITE_ID in the HTML template matches the actual DB record.
      let siteId = "unknown";
      try {
        const res = await fetch(`http://localhost:${SERVER_PORT}/api/sites/default`);
        if (res.ok) {
          const site = await res.json();
          siteId = site?.id ?? "unknown";
        }
      } catch {
        // Server not ready yet — SITE_ID will be "unknown" on the first load,
        // Vite HMR will re-run this transform once the page refreshes.
      }

      const siteConfig = {
        id: siteId,
        name: env.DEFAULT_SITE_NAME,
        appName: env.DEFAULT_SITE_APP_NAME,
        brandColor: env.DEFAULT_SITE_BRAND_COLOR,
        brandContentColor: env.DEFAULT_SITE_BRAND_CONTENT_COLOR,
        serverUrl: env.DEFAULT_SITE_SERVER_URL,
        docsUrl: env.DEFAULT_SITE_DOCS_URL,
        assistantIconUrl: env.DEFAULT_SITE_ASSISTANT_ICON_URL,
        welcomeMessage: env.DEFAULT_SITE_WELCOME_MESSAGE,
        corsOrigin: new Set([env.DEFAULT_SITE_CORS_ORIGIN]),
      };
      return applyAppTemplateVars(html, siteConfig);
    },
  };
}

export default defineConfig({
  vite: {
    plugins: [vue(), tailwindcss(), applyTemplateVars()],
    server: {
      proxy: {
        "/ask-ai.js": {
          target: `http://localhost:3001`,
          changeOrigin: true,
        },
        "/privacy-policy": {
          target: `http://localhost:3001`,
          changeOrigin: true,
        },
      },
    },
  },
  prerender: false,
});
