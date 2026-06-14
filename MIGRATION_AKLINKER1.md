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

| Package | Where it's used |
|---|---|
| `@aklinker1/check` | `package.json`, `backend/package.json`, `plugin/package.json` (`check` script) |
| `@aklinker1/zero-ioc` | `backend/server/dependencies.ts` |
| `@aklinker1/zeta` | `backend/server/main.ts`, all `backend/server/apis/*.ts`, all `backend/server/plugins/*.ts`, `backend/server/services/ai-service/litellm.ts`, `backend/app/utils/api-client.ts` |
| `@aklinker1/aframe` | `backend/aframe.config.ts`, `backend/server/main.ts` (`fetchStatic`, `globalThis.aframe`), `backend/server/env.d.ts`, `backend/package.json` scripts |

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

| File | Current usage |
|---|---|
| `decorate-context-plugin.ts` | `.decorate(container.resolveAll())` |
| `cors-plugin.ts` | `const { db } = container.resolveAll()` |
| `resolve-site-plugin.ts` | `const { db } = container.resolveAll()` (note: `resolveSite()` is **dead code** — exported, never called; delete it) |
| `main.ts` | `const db = container.resolve("db")` |

**Decision:** for 2 eagerly-created startup singletons, an IoC container adds indirection
without benefit. ES modules are already a singleton registry (module instances are cached),
so replace the container with **plain module-level exports**. This adds *zero* new
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
   - `resolve-site-plugin.ts`: same import swap — *or* delete `resolveSite()` entirely since
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

**Chosen replacement: [Hono](https://hono.dev/)** — first-class Bun support, middleware
model maps cleanly to Zeta plugins, `@hono/zod-validator` covers request validation,
`hono/client` (`hc`) gives an end-to-end typed client, and `@hono/zod-openapi` covers
the OpenAPI spec if we want to keep it.

### 3a. Add Hono + scaffolding
- `bun add hono @hono/zod-validator` (+ `@hono/zod-openapi` only if OpenAPI is required).
- Decide whether the OpenAPI document is actually consumed downstream. If not, drop it to
  simplify (plain `hono` + `@hono/zod-validator`); if yes, build routes with
  `@hono/zod-openapi`'s `OpenAPIHono` + `createRoute`.

### 3b. Map the building blocks

| Zeta | Hono equivalent |
|---|---|
| `createApp({ prefix })` | `new Hono().basePath(prefix)` (or `OpenAPIHono`) |
| `.use(subApp)` | `app.route(prefix, subApp)` |
| `.get/.post/.put/.delete` | same verbs on Hono |
| `.method("PATCH", ...)` | `app.patch(...)` |
| `.decorate(deps)` | `c.set(...)` via middleware, or import singletons directly |
| `.onGlobalRequest` | `app.use(async (c, next) => { ...; await next() })` |
| `.onGlobalAfterResponse` | middleware after `await next()` |
| `.onGlobalError` | `app.onError((err, c) => ...)` |
| `.export()` | export the `Hono` instance |
| `.mount(fetchStatic())` | `app.get("*", staticHandler)` (see Phase 4) |
| `.listen(port)` | `export default { port, fetch: app.fetch }` (Bun) |
| HttpError classes (`NotFoundHttpError`, …) | `throw new HTTPException(status, { message })` |
| `NoResponse` | return `c.body(null, 204)` |
| zod `body`/`params`/`responses` | `zValidator("json"|"param"|"query", schema)` |

### 3c. Port files (one at a time, keep both runnable)
1. **Plugins** → Hono middleware:
   - `cors-plugin.ts` (per-site dynamic CORS from cache) → `app.use` middleware. Keep the
     existing sync origin cache logic; set headers on `c.res`/`c.header`. Note: Hono has a
     built-in `cors()` but it doesn't support per-site dynamic origins easily — keep the
     custom logic.
   - `request-logger-plugin.ts` → logging middleware (or Hono's `logger()`).
   - `decorate-context-plugin.ts` → middleware that does `c.set("db", ...)` /
     `c.set("aiService", ...)`, or simply import the singletons in handlers and delete this.
2. **API modules** (`model-`, `chat-`, `site-`, `knowledge-`, `asset-apis.ts`) → Hono
   sub-routers with `zValidator`. Replace `ctx` destructuring (`{ body, params, db, set, url, request }`)
   with Hono's `c` (`c.req.valid(...)`, `c.req.param(...)`, `c.req.query(...)`, `c.req.raw`).
   - `chat-apis.ts` streaming: replace manual `ReadableStream` + SSE with Hono's
     `streamSSE` helper (`hono/streaming`).
   - `knowledge-apis.ts` multipart upload: use `c.req.formData()` /
     `c.req.parseBody()` instead of the Zeta `ctx.body` FormData hack.
   - `asset-apis.ts`: set `Content-Type` via `c.header(...)`.
3. **`litellm.ts`**: replace `InternalServerErrorHttpError` with `HTTPException(500, …)`.
4. **`main.ts`**: compose root Hono app, mount sub-routers with `app.route(...)`, register
   middleware, add `/api/health`, and `export default { port, fetch: app.fetch }`. Keep the
   `globalThis.aframe.static` SPA-fallback logic for now (Phase 4 replaces it).
5. **Frontend client** (`app/utils/api-client.ts`): replace `createAppClient<App>` with
   Hono's `hc<App>(SERVER_URL)`. Update the single call site in `App.vue`
   (`apiClient.fetch("GET", "/api/models", {})` → typed `client.api.models.$get()`).
   - Alternative: since the frontend mostly uses raw `fetch` already (3 of 4 calls), drop
     the typed client entirely and use plain `fetch` for `/api/models` too — removes the
     `App` type import across the build boundary.

### 3d. Decisions to confirm before starting
- **OpenAPI**: keep the served spec (use `@hono/zod-openapi`) or drop it (simpler)?
- **Typed client**: keep an end-to-end typed client (`hc<App>`) or simplify to raw `fetch`?

**Verify:** all endpoints respond identically (models, chat, chat/stream SSE, sites CRUD,
knowledge upload/list/delete, ask-ai.js, privacy-policy, health, SPA fallback); CORS still
per-site; type-check + build pass.

**Risk:** high (surface area). Mitigate by porting one router at a time and diffing
responses against the current server.

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
