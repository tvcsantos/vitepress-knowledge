import { defineConfig } from "@aklinker1/aframe";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { Plugin } from "vite";
import { applyAppTemplateVars } from "./server/utils/template-vars";
import { siteToConfig } from "./server/utils/site-config";

const SERVER_PORT = Number(process.env.PORT) || 5174;

/** Apply template variables by fetching the default site from the running dev server. */
function applyTemplateVars(): Plugin {
  return {
    apply: "serve",
    name: "backend:apply-template-vars",
    async transformIndexHtml(html) {
      try {
        const res = await fetch(`http://localhost:${SERVER_PORT}/api/sites/default`);
        if (res.ok) {
          const site = await res.json();
          if (site) return applyAppTemplateVars(html, siteToConfig(site));
        }
      } catch {
        // Server not ready yet — template vars will be unapplied on first load.
      }
      return html;
    },
  };
}

export default defineConfig({
  vite: {
    // Use relative base so assets resolve correctly under any context path at runtime.
    base: "./",
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
