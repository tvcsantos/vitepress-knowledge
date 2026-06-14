# Migration Plan: Removing `@aklinker1/*` Dependencies

Goal: incrementally remove the four `@aklinker1` dependencies, replacing each with
mainstream, well-maintained equivalents (or small in-repo utilities) while keeping the
app working at every step.

Dependencies to remove:

- `@aklinker1/check` — dev-only type-check/lint runner
- `@aklinker1/zero-ioc` — tiny dependency-injection container
- `@aklinker1/zeta` — HTTP framework + zod validation + OpenAPI + typed RPC client
- `@aklinker1/aframe` — Vite + Bun fullstack build/dev framework

## Current usage map

| Package               | Where it's used                                                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@aklinker1/check`    | `package.json`, `backend/package.json`, `plugin/package.json` (`check` script)                                                                                                  |
| `@aklinker1/zero-ioc` | `backend/server/dependencies.ts`                                                                                                                                                |
| `@aklinker1/zeta`     | `backend/server/main.ts`, all `backend/server/apis/*.ts`, all `backend/server/plugins/*.ts`, `backend/server/services/ai-service/litellm.ts`, `backend/app/utils/api-client.ts` |
| `@aklinker1/aframe`   | `backend/aframe.config.ts`, `backend/server/main.ts` (`fetchStatic`, `globalThis.aframe`), `backend/server/env.d.ts`, `backend/package.json` scripts                            |

### How the pieces fit together (important)

`aframe` owns the build + the generated `server-entry.ts`, which sets
`globalThis.aframe.static` and calls `server.listen(port)`. `server` is the `zeta` app
(`backend/server/main.ts` default export), and `main.ts` calls `fetchStatic()` (from
aframe) + reads `globalThis.aframe.static` to serve the built SPA.

So `zeta` (request handling / `.listen`) and `aframe` (build + static serving + entry)
are coupled at the server bootstrap. The plan sequences `zeta` before `aframe` and
defines a clean handler interface (`export default { fetch }`) so aframe's generated
entry keeps working until aframe itself is replaced last.

## Recommended replacements

- `@aklinker1/check` → native `tsc --noEmit` / `vue-tsc --noEmit` (+ optional `oxlint`)
- `@aklinker1/zero-ioc` → **no library** — plain module-level singletons (only 2 deps). Awilix kept as documented fallback if the dependency graph grows.
- `@aklinker1/zeta` → **Hono** (`hono`, `@hono/zod-validator`, optional `@hono/zod-openapi`, typed `hono/client`)
- `@aklinker1/aframe` → **Vite** (app build) + **`Bun.build`** (server bundle) + small static-file handler + dev script

## Sequencing (lowest risk first)

1. `@aklinker1/check` (dev tooling, zero runtime impact)
2. `@aklinker1/zero-ioc` (one file, trivial)
3. `@aklinker1/zeta` (runtime framework — the big one)
4. `@aklinker1/aframe` (build/dev tooling — depends on step 3's handler interface)

Each phase ends in a buildable, runnable state and an independent commit.

---

## Phase 1 — Replace `@aklinker1/check`

**What it does:** runs TypeScript type-checking (and a couple of lint passes) via the
`check` script in each package.

**Steps**

1. Determine what `check` runs today (TS type-check across `backend`, `plugin`, root).
2. Replace each `"check"` script:
   - Backend (Vue + TS): `"check": "vue-tsc --noEmit -p tsconfig.json"`
   - Plugin (plain TS): `"check": "tsc --noEmit -p tsconfig.json"`
   - Root: point at whichever package(s) it aggregated, or a `bun --filter` fan-out.
3. Remove `@aklinker1/check` from `devDependencies` in all three `package.json` files.
4. (Optional) add `oxlint` or `eslint` if lint coverage beyond type-checking is desired.

**Verify:** `bun run check` in each package passes; `@aklinker1/check` no longer in lockfile.

**Risk:** very low. Pure tooling swap.

---

## Phase 2 — Remove `@aklinker1/zero-ioc` (no replacement library)

**What it does today:** `createIocContainer().register(key, factory).resolve(key)/.resolveAll()`
— a lazy singleton registry holding exactly **2 dependencies**: `db` and `aiService`.
Defined in `dependencies.ts` and consumed in 4 places:

| File                         | Current usage                                                                                                        |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `decorate-context-plugin.ts` | `.decorate(container.resolveAll())`                                                                                  |
| `cors-plugin.ts`             | `const { db } = container.resolveAll()`                                                                              |
| `resolve-site-plugin.ts`     | `const { db } = container.resolveAll()` (note: `resolveSite()` is **dead code** — exported, never called; delete it) |
| `main.ts`                    | `const db = container.resolve("db")`                                                                                 |

**Decision:** for 2 eagerly-created startup singletons, an IoC container adds indirection
without benefit. ES modules are already a singleton registry (module instances are cached),
so replace the container with **plain module-level exports**. This adds _zero_ new
dependencies (adding Awilix would be adding a dependency to remove one) and is fully
bundler-safe for Phase 4's `Bun.build`.

### Target shape of `dependencies.ts`

```ts
import { openKnowledgeDatabase } from "./utils/open-knowledge-database";
import { createLiteLlmAiService } from "./services/ai-service/litellm";

// Top-level await already works here today.
export const db = await openKnowledgeDatabase();
export const aiService = createLiteLlmAiService();

// Bundle passed to Zeta's `.decorate(...)` so handler context keeps `db`/`aiService`.
export const deps = { db, aiService };
```

### Steps

1. Rewrite `dependencies.ts` as above (drop `createIocContainer`).
2. Update the 4 consumer sites:
   - `decorate-context-plugin.ts`: `.decorate(container.resolveAll())` → `.decorate(deps)`.
   - `cors-plugin.ts`: replace `const { db } = container.resolveAll()` with
     `import { db } from "../dependencies"`.
   - `resolve-site-plugin.ts`: same import swap — _or_ delete `resolveSite()` entirely since
     it's unused (preferred; removes the edit).
   - `main.ts`: `const db = container.resolve("db")` → `import { db } from "./dependencies"`.
3. Remove `@aklinker1/zero-ioc` from `backend/package.json`.

### Testability note

Without a container, swap dependencies in tests via Bun's `mock.module("./dependencies", …)`,
or by passing collaborators into the service factories directly. Neither requires a DI lib.

### Fallback: Awilix (only if the dependency graph grows)

If services multiply or you need per-request scoping / runtime-swappable implementations,
adopt **Awilix** (well-known, no decorators, no `reflect-metadata`, zero Bun config):

- `bun add awilix`; build a container with **explicit** `asFunction(...).singleton()`
  registrations (avoid `CLASSIC` param-name injection — it breaks under minified bundles).
- Register the already-resolved async DB with `asValue(db)` since Awilix factories are sync.
- Expose a `resolveAll()`/`deps` helper so consumer call sites stay stable.
  This fallback is documented here so the decision is reversible without re-investigation.

**Verify:** server boots; `db`/`aiService` are single shared instances across requests;
type-check passes; `rg "zero-ioc"` returns nothing.

**Risk:** very low. ~5 tiny edits, no new dependency, removes a layer of indirection.

---

## Phase 3 — Replace `@aklinker1/zeta` (the framework)

This is the largest change. Zeta provides: app/router builder (`createApp`, `.use`,
`.get/.post/.put/.delete/.method`), plugins/hooks (`.onGlobalRequest`,
`.onGlobalAfterResponse`, `.onGlobalError`, `.decorate`, `.export`), zod request/response
validation, HTTP error classes, `NoResponse`, OpenAPI generation
(`zodSchemaAdapter` + `openApi` config), `.mount()`, `.listen()`, and a typed RPC client
(`createAppClient<App>`).

**Chosen replacement: [Hono](https://hono.dev/)** — well-known and maintained, first-class
Bun support, middleware model maps cleanly to Zeta plugins.

### Confirmed scope decisions

- **OpenAPI spec: DROPPED.** Nothing consumes it (the frontend never fetches it; there is no
  docs UI). Use plain `hono` + `@hono/zod-validator`. Consequence: **input** validation is
  kept (json/param/query/form); Zeta's **response** validation is dropped (acceptable — it
  was a dev-time safety net; most frameworks don't validate responses).
- **Typed RPC client: DROPPED.** Used for only 1 of 4 frontend calls. Replace with raw
  `fetch`, consistent with the other 3. Removes the `App` type import across the
  app/server build boundary and avoids Hono route-chaining constraints.

### Key findings from the code (read before starting)

- **`.listen()` coupling is the main trap.** Both dev and prod invoke the backend via
  `const { default: server } = await import("./server/main"); server.listen(port)` (aframe's
  dev-server and generated `server-entry.ts`). A Hono app has **no** `.listen()`. Since
  aframe stays until Phase 4, `main.ts` must keep a working `.listen(port)` during Phase 3
  via a shim (see step 5). The bare `export default { port, fetch }` is only the Phase-4
  end state.
- **No double-prefixing.** Mount sub-routers with `app.route("/sites", siteApis)` where the
  sub-router has **no** `basePath`. Don't set both a basePath and a mount prefix.
- **Two routers share `/sites`.** `site-apis.ts` and `knowledge-apis.ts` both use
  `prefix: "/sites"`. Mount both (`app.route("/sites", siteApis)` and
  `app.route("/sites", knowledgeApis)`) — Hono merges them fine; keep them as separate files.
- **Delete the decorate plugin.** Phase 2 made `db`/`aiService` module singletons, so Hono
  handlers `import { db, aiService } from "../dependencies"` directly. Remove
  `decorate-context-plugin.ts` entirely and avoid Hono `Variables` context typing.
- **Error-body shape doesn't matter.** The frontend only checks `res.ok`/`res.status`/
  `res.statusText` and the SSE `{ error }` field — it never parses a structured error body.
  So Hono's `HTTPException` body differing from Zeta's `ErrorResponse` is a non-issue.
- **Win: the multipart hack is removed.** `knowledge-apis.ts`'s clone-request-to-read-
  FormData workaround becomes `await c.req.formData()`.

### 3a. Add Hono

- `bun add hono @hono/zod-validator` (in `backend`). No `@hono/zod-openapi`, no `hono/client`.

### 3b. Map the building blocks

| Zeta                                       | Hono equivalent                                         |
| ------------------------------------------ | ------------------------------------------------------- |
| `createApp({ prefix })` (root)             | `new Hono()`                                            |
| `createApp({ prefix })` (sub-router)       | `new Hono()` mounted via `app.route(prefix, subApp)`    |
| `.use(subApp)`                             | `app.route(prefix, subApp)` (prefix only on the mount)  |
| `.get/.post/.put/.delete`                  | same verbs on Hono                                       |
| `.method("PATCH", ...)`                    | `app.patch(...)`                                         |
| `.decorate(deps)`                          | delete — `import { db, aiService }` directly in handlers |
| `.onGlobalRequest`                         | `app.use(async (c, next) => { ...; await next() })`     |
| `.onGlobalAfterResponse`                   | middleware logic after `await next()` (read `c.res`)    |
| `.onGlobalError`                           | `app.onError((err, c) => ...)`                          |
| `.export()`                                | export the `Hono` instance                              |
| `.mount(fetchStatic())`                    | catch-all `app.get("*", ...)` / `app.mount(...)` (Phase 4) |
| `.listen(port)`                            | transitional shim object (step 5); bare `{ fetch }` in Phase 4 |
| HttpError classes (`NotFoundHttpError`, …) | `throw new HTTPException(status, { message })`          |
| `NoResponse`                               | `return c.body(null, 204)`                              |
| `body` / `params` / `query` schemas        | `zValidator("json" \| "param" \| "query" \| "form", schema)` |
| `responses` schema                         | dropped (no response validation in plain Hono)          |

### 3c. Port files (one at a time, keep both runnable)

1. **Middleware (from plugins):**
   - `cors-plugin.ts` → `app.use` middleware. Keep the existing sync per-site origin cache
     logic; set headers via `c.header(...)`. For `OPTIONS`, short-circuit with
     `return c.body(null, 204)`. (Hono's built-in `cors()` can't do per-site dynamic origins
     — keep the custom logic.)
   - `request-logger-plugin.ts` → request/after/error logging middleware (or Hono `logger()`).
   - `decorate-context-plugin.ts` → **delete** (handlers import singletons directly).
2. **API modules** (`model-`, `chat-`, `site-`, `knowledge-`, `asset-apis.ts`) → Hono
   routers with `zValidator`. Replace `ctx` destructuring
   (`{ body, params, db, set, url, request }`) with Hono's `c`:
   `c.req.valid("json"|"param"|"query")`, `c.req.param(...)`, `new URL(c.req.url)`,
   `c.req.raw`, and `import { db, aiService }` from dependencies.
   - `chat-apis.ts` streaming: replace the manual `ReadableStream` + SSE encoding with
     `streamSSE` from `hono/streaming` (keep the same `{ done, messages }` / `{ error }`
     event payloads the frontend expects).
   - `knowledge-apis.ts` multipart upload: `await c.req.formData()` → `.get("file")`.
   - `asset-apis.ts`: set content types via `c.header(...)` (`application/javascript`,
     `text/markdown`).
3. **`litellm.ts`**: replace `InternalServerErrorHttpError` with `HTTPException(500, …)`.
4. **`main.ts`** (compose): root `new Hono()`, register CORS + logger middleware, mount the
   `/api` sub-app (which mounts model/chat/site/knowledge routers) and the asset routes,
   add `/api/health`, and keep the `globalThis.aframe.static` SPA-fallback `/` route +
   catch-all for now (Phase 4 replaces these).
5. **`main.ts`** (export shim — required while aframe remains):

   ```ts
   const server = {
     fetch: app.fetch,
     listen: (port: number) => Bun.serve({ port, fetch: app.fetch }),
   };
   export default server;
   export type App = typeof app; // only if anything still needs it; client is gone
   ```

   This satisfies aframe's `server.listen(port)` in both dev and prod. Phase 4 simplifies it.
6. **Frontend** (`app/utils/api-client.ts` + `App.vue`): delete `api-client.ts`; replace the
   single `apiClient.fetch("GET", "/api/models", {})` call in `App.vue` with
   `await fetch(\`${SERVER_URL}/api/models\`).then((r) => r.json())`, matching the existing
   raw-fetch pattern. Remove the `App`-type import.

### 3d. Verify

- Every endpoint behaves identically: `/api/models`, `/api/chat`, `/api/chat/stream` (SSE
  payloads unchanged), sites CRUD, knowledge upload/list/delete, `/ask-ai.js`,
  `/privacy-policy`, `/api/health`, and the `/` SPA fallback.
- Per-site CORS still enforced (allowed origin echoed, `OPTIONS` preflight 204).
- `vue-tsc`/`tsc -b` pass; `bun run build` (still aframe in Phase 3) produces a server whose
  `server.listen(port)` boots.
- `rg "@aklinker1/zeta"` returns nothing.

**Risk:** high (surface area). Mitigate by porting one router at a time, keeping the shim so
the app boots throughout, and diffing responses against the pre-migration server.

---

## Phase 4 — Replace `@aklinker1/aframe` (build/dev framework)

**What it does:**

- Dev: Vite dev server for `./app` (Vue), proxying `/ask-ai.js` + `/privacy-policy` to the
  backend; runs the Bun server alongside.
- Build: builds the Vue app with Vite, bundles `./server` + `./shared` with Bun, gzips
  assets, optionally prerenders, and generates `server-entry.ts` that sets
  `globalThis.aframe` (with `static` route map + `publicDir`) and calls `server.listen(port)`.
- Runtime: `fetchStatic()` serves built files from `globalThis.aframe.static`; `main.ts`
  reads `aframe.static["fallback"]` / `["/"]` for the SPA HTML.

Prerender is disabled (`prerender: false`), which simplifies the replacement.

**Replacement strategy**

1. **App build** — use Vite directly:
   - Move `backend/aframe.config.ts` Vite config (base `./`, plugins `vue()`,
     `tailwindcss()`, the `applyTemplateVars` transform) into a standard `vite.config.ts`
     with `root: "app"` and a defined `build.outDir`.
   - Dev proxy (`/ask-ai.js`, `/privacy-policy`) stays in `server.proxy`.
2. **Server bundle** — a `build.ts` script using `Bun.build`:
   - Bundle `server/main.ts` (+ `shared`) to `.output/server`.
   - Copy the Vite app output into `.output/public`.
   - Optionally gzip static assets (mirror current behavior) — or serve uncompressed and
     let the gateway/CDN handle compression.
3. **Static serving** — replace `fetchStatic()` + `globalThis.aframe`:
   - Write `server/utils/serve-static.ts` that serves files from a `publicDir`
     (env-configurable, default `.output/public`) using `Bun.file`, with an SPA fallback to
     `index.html`. This removes the `globalThis.aframe` dependency.
   - Update `main.ts`: SPA fallback reads `index.html` from `publicDir` directly; the
     catch-all route uses the new static handler. Remove the `aframe.static` lookups.
4. **Entry point** — own `server-entry.ts` (or run `main.ts` directly):
   - Since Phase 3 made the server `export default { port, fetch }`, Bun runs it directly.
     A thin `server-entry.ts` can set `PORT`/`publicDir` if needed.
5. **Env types** — replace `/// <reference types="@aklinker1/aframe/env" />` in
   `backend/server/env.d.ts` with local declarations for any globals still referenced
   (ideally none, once `globalThis.aframe` is gone).
6. **Scripts** — update `backend/package.json`:
   - `"dev": "vite"` (app) + a concurrent `bun --watch server/main.ts` (or a small dev
     orchestrator).
   - `"build": "bun run build.ts"`; `"preview": "bun run build.ts && bun .output/server/main.js"`.
   - Remove the `"aframe"` script and `@aklinker1/aframe` dependency.
7. **Dockerfile** — update build/run commands to the new scripts and output paths.

**Verify:** `bun run dev` serves the app with working proxies + HMR; `bun run build`
produces a runnable server that serves the SPA, static assets, and all APIs; deployed
image (under context path) still resolves assets via `<base href>` and `SERVER_URL`.

**Risk:** medium-high. Build/deploy surface. Mitigate by validating the production
container locally before updating k8s.

---

## Cross-cutting verification checklist (run after each phase)

- [ ] `bun run check` (type-check) passes in `backend` and `plugin`
- [ ] `bun run build` (backend) succeeds
- [ ] `bun run build` (plugin) succeeds
- [ ] Dev server boots; `/api/health` returns 200
- [ ] `/api/models`, `/api/chat`, `/api/chat/stream` (SSE), sites CRUD, knowledge
      upload/list/delete all behave as before
- [ ] Per-site CORS still enforced
- [ ] `ask-ai.js` + `privacy-policy` served with correct content types
- [ ] SPA loads under a context path (asset paths + `SERVER_URL` correct)
- [ ] No remaining `@aklinker1/*` references: `rg "@aklinker1"` returns nothing

## Notes / open questions

- Confirm whether the served **OpenAPI spec** is consumed anywhere (docs, codegen). If not,
  dropping it removes `@hono/zod-openapi` and simplifies Phase 3.
- Confirm whether the **end-to-end typed client** is worth keeping (`hc<App>`) vs. plain
  `fetch` — the frontend already uses raw `fetch` for 3 of 4 calls.
- Decide on **gzip-at-build** vs. letting the gateway/CDN compress, when replacing aframe.
- Prerender is currently disabled, so no SSG replacement is needed.

```

```
