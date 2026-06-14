import { defineConfig, type Plugin } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { applyAppTemplateVars } from "./server/utils/template-vars";
import { siteToConfig } from "./server/utils/site-config";

// Port the backend runs on during development (see the `dev` script).
const BACKEND_PORT = Number(process.env.PORT) || 3001;

/** Apply template variables by fetching the default site from the running dev server. */
function applyTemplateVars(): Plugin {
  return {
    apply: "serve",
    name: "backend:apply-template-vars",
    async transformIndexHtml(html) {
      try {
        const res = await fetch(
          `http://localhost:${BACKEND_PORT}/api/sites/default`,
        );
        if (res.ok) {
          const site = await res.json();
          if (site) return applyAppTemplateVars(html, siteToConfig(site));
        }
      } catch {
        // Server not ready yet - template vars will be unapplied on first load.
      }
      return html;
    },
  };
}

export default defineConfig({
  root: "app",
  // Use relative base so assets resolve correctly under any context path at runtime.
  base: "./",
  // Read env (.env) from the backend root, not the app dir.
  envDir: import.meta.dirname,
  envPrefix: "APP_",
  plugins: [vue(), tailwindcss(), applyTemplateVars()],
  build: {
    outDir: "../.output/public",
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      "/api": {
        target: `http://localhost:${BACKEND_PORT}`,
        changeOrigin: true,
      },
      "/ask-ai.js": {
        target: `http://localhost:${BACKEND_PORT}`,
        changeOrigin: true,
      },
      "/privacy-policy": {
        target: `http://localhost:${BACKEND_PORT}`,
        changeOrigin: true,
      },
    },
  },
});
