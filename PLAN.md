# Multi-Site Support Plan

## Summary

The server is currently single-tenant: all config (`DOCS_URL`, `APP_NAME`,
`SYSTEM_PROMPT`, branding, etc.) comes from env vars, knowledge is fetched from
one URL, and conversations have no site affiliation. This plan introduces a
**sites** concept — each site is a named configuration record stored in the
database. A single server instance can serve multiple VitePress sites, each with
its own knowledge source, branding, system prompt, and conversation history.

---

## Implementation Steps

### 1. Database — add `sites` table and scope conversations to a site

- **`backend/server/db/sqlite/schema.ts`** — add a `sites` table (`id`, `name`,
  `docsUrl`, `appName`, `brandColor`, `brandContentColor`, `serverUrl`,
  `corsOrigin`, `assistantIconUrl`, `systemPrompt`, `welcomeMessage`,
  `createdAt`) and a `siteId` foreign key column to `conversations`
- **`backend/server/drizzle/sqlite/`** — generate a new migration
  (`bun run gen`) for these schema changes. The new `siteId` column on
  `conversations` is nullable initially so existing rows are unaffected; a
  backfill to the default site ID happens at startup.

### 2. Shared types — add `Site` type and extend request/response shapes

- **`backend/shared/types.ts`** — add `Site` Zod schema/type; add `siteId`
  field to `PostChatRequestBody`.

### 3. Per-site config — extract a `SiteConfig` value type

- **`backend/server/utils/site-config.ts`** _(new)_ — defines the `SiteConfig`
  type holding all per-site fields currently in `env`: `docsUrl`, `appName`,
  `brandColor`, `brandContentColor`, `serverUrl`, `corsOrigin`,
  `assistantIconUrl`, `systemPrompt`, `welcomeMessage`.

### 4. Update `env.ts` — keep only global config

- **`backend/server/utils/env.ts`** — remove single-site fields (`DOCS_URL`,
  `APP_NAME`, `BRAND_COLOR`, `BRAND_CONTENT_COLOR`, `SERVER_URL`,
  `CORS_ORIGIN`, `ASSISTANT_ICON_URL`, `SYSTEM_PROMPT`, `WELCOME_MESSAGE`).
  These move to per-site DB records. Retain: port, AI provider keys, model
  toggles, DB path, and the same fields as **defaults** used to seed the
  default site on first boot.

### 5. Knowledge cache — key by `siteId`

- **`backend/server/utils/knowledge-files.ts`** — replace the single
  `Promise<Knowledge>` cache with a `Map<string, Promise<Knowledge>>` keyed by
  `siteId`. Update signature:
  `getKnowledgeFiles(siteId: string, docsUrl: string)`.

### 6. Template vars — accept `SiteConfig`

- **`backend/server/utils/template-vars.ts`** — change
  `applyAppTemplateVars(template, siteConfig)` and
  `applySystemPromptTemplateVars(template, knowledge, siteConfig)` to accept a
  `SiteConfig` instead of reading global `env`.

### 7. Database layer — add sites CRUD to `KnowledgeDatabase`

- **`backend/server/services/knowledge-database/index.ts`** — add `sites`
  namespace with: `get(id)`, `getAll()`, `insert(site)`, `update(id, patch)`,
  `delete(id)`.
- **`backend/server/services/knowledge-database/sqlite.ts`** — implement the
  above; scope `conversations.getOrInsert` to accept and store `siteId`.

### 8. Conversation service — thread `siteId` through

- **`backend/server/services/conversation-service.ts`** — `updateConversation`
  receives `siteId` and passes it to `db.conversations.getOrInsert`.

### 9. Middleware — resolve site from request

- **`backend/server/plugins/resolve-site-plugin.ts`** _(new)_ — reads `siteId`
  from the JSON request body (POST) or `X-Site-ID` header (GET); loads the site
  record from DB (with in-memory LRU/TTL cache); injects it as `siteConfig` in
  request context; returns HTTP 404 if not found.

### 10. Update `cors-plugin.ts`

- **`backend/server/plugins/cors-plugin.ts`** — read allowed origins from
  `siteConfig.corsOrigin` (injected by `resolve-site-plugin`) instead of global
  `env`.

### 11. Update `decorate-context-plugin.ts`

- **`backend/server/plugins/decorate-context-plugin.ts`** — include `siteConfig`
  resolution alongside `db`, `conversationService`, `aiService`.

### 12. New site management API

- **`backend/server/apis/site-apis.ts`** _(new)_ — CRUD REST endpoints under
  `/api/sites`:

  - `GET    /api/sites` — list all sites
  - `POST   /api/sites` — create a site
  - `GET    /api/sites/:id` — get a site
  - `PATCH  /api/sites/:id` — update a site
  - `DELETE /api/sites/:id` — delete a site

  Protected by a shared admin token env var (`ADMIN_TOKEN`).

### 13. Update `chat-apis.ts`

- **`backend/server/apis/chat-apis.ts`** — use `siteConfig` (from context) for
  `getKnowledgeFiles`, `applySystemPromptTemplateVars`, and
  `conversationService.updateConversation`.

### 14. Update `asset-apis.ts`

- **`backend/server/apis/asset-apis.ts`** — `GET /ask-ai.js` accepts a
  `?siteId=` query param; applies per-site template vars dynamically instead of
  baking them at startup. The VitePress plugin `serverUrl` option is updated to
  append `?siteId=<id>` to the script `src`.

### 15. Register everything in `main.ts`

- **`backend/server/main.ts`** — add `resolveSitePlugin` and `siteApis` to the
  app chain.

### 16. Default site seed — backward-compatible bootstrap

- **`backend/server/utils/seed-default-site.ts`** _(new)_ or inside
  `dependencies.ts` — on startup, if no sites exist in the DB, insert a
  "default" site populated from the existing env var values. This ensures
  existing single-site deployments keep working with zero config changes.

### 17. Kubernetes manifests

- **`k8s/backend-configmap.yaml`** — remove `DOCS_URL`, `APP_NAME`,
  `BRAND_COLOR`, `BRAND_CONTENT_COLOR`, `SERVER_URL`, `CORS_ORIGIN`,
  `ASSISTANT_ICON_URL`, `SYSTEM_PROMPT`, `WELCOME_MESSAGE` (moved to per-site
  DB). Keep them in the ConfigMap as optional bootstrap defaults (used only on
  first boot to seed the default site).
- Add `ADMIN_TOKEN` to **`k8s/backend-secret.yaml`**.

---

## Files to Modify

| File                                                   | Change                                                         |
| ------------------------------------------------------ | -------------------------------------------------------------- |
| `backend/server/db/sqlite/schema.ts`                   | Add `sites` table; add nullable `siteId` FK to `conversations` |
| `backend/shared/types.ts`                              | Add `Site` type; add `siteId` to `PostChatRequestBody`         |
| `backend/server/utils/env.ts`                          | Remove single-site fields; keep as defaults for seed           |
| `backend/server/utils/knowledge-files.ts`              | Per-site cache keyed by `siteId`                               |
| `backend/server/utils/template-vars.ts`                | Accept `SiteConfig` instead of global `env`                    |
| `backend/server/services/knowledge-database/index.ts`  | Add `sites` CRUD interface                                     |
| `backend/server/services/knowledge-database/sqlite.ts` | Implement sites CRUD; scope conversations by `siteId`          |
| `backend/server/services/conversation-service.ts`      | Pass `siteId` through                                          |
| `backend/server/plugins/cors-plugin.ts`                | Use `siteConfig.corsOrigin`                                    |
| `backend/server/plugins/decorate-context-plugin.ts`    | Inject `siteConfig`                                            |
| `backend/server/apis/chat-apis.ts`                     | Use `siteConfig` throughout                                    |
| `backend/server/apis/asset-apis.ts`                    | Per-site template vars via `?siteId=`                          |
| `backend/server/main.ts`                               | Register new plugin & site APIs                                |
| `k8s/backend-configmap.yaml`                           | Remove site-specific env vars (keep as optional seed defaults) |
| `k8s/backend-secret.yaml`                              | Add `ADMIN_TOKEN`                                              |

## New Files

| File                                            | Purpose                                       |
| ----------------------------------------------- | --------------------------------------------- |
| `backend/server/utils/site-config.ts`           | `SiteConfig` type definition                  |
| `backend/server/plugins/resolve-site-plugin.ts` | Per-request site resolution middleware        |
| `backend/server/apis/site-apis.ts`              | CRUD REST endpoints for `/api/sites`          |
| `backend/server/utils/seed-default-site.ts`     | Seed default site from env vars on first boot |

---

## Verification

- [ ] `bun run gen` generates the new SQLite migration cleanly
- [ ] Existing single-site env-var deployment still works (default site seeded)
- [ ] `POST /api/chat/stream` with a valid `siteId` returns the correct
      site-scoped knowledge and branding
- [ ] `GET /api/sites` lists sites; full CRUD works
- [ ] CORS correctly allows/rejects per each site's configured origins
- [ ] Knowledge cache is isolated per site (changing one site's docs URL
      doesn't invalidate another site's cache)
- [ ] `kubectl apply --dry-run` on updated k8s manifests passes

---

## Risks / Considerations

- **`ask-ai.js` delivery**: The script is currently baked at startup via
  `applyAppTemplateVars`. With multi-site it must be served dynamically. Adding
  `?siteId=xxx` to the script `src` (set in the VitePress plugin config) is the
  cleanest path with minimal plugin-side changes.
- **SQLite concurrency**: WAL mode is already enabled, so concurrent writes
  across sites are fine. SQLite is still not suited for horizontal scaling —
  keep `replicas: 1` in the Deployment.
- **Auth on site management APIs**: The `/api/sites` CRUD routes must be
  protected by `ADMIN_TOKEN` to prevent unauthorized site creation/deletion.
- **Migration safety**: The new `siteId` column on `conversations` is nullable
  so existing rows are unaffected. A startup routine backfills them with the
  default site's ID after seeding.
- **Knowledge cache invalidation**: When a site's `docsUrl` is updated via
  `PATCH /api/sites/:id`, the cached knowledge for that site must be
  invalidated.

---

# Rate Limiting Plan

## Summary

Add per-`(IP, siteId)` rate limiting to the chat endpoints
(`POST /api/chat` and `POST /api/chat/stream`) using a **sliding-window
counter** stored in SQLite. Each site can configure its own requests-per-minute
(RPM) limit; if a site has no limit set the server falls back to a global
default from an env var. Exceeding the limit returns HTTP 429 with a
`Retry-After` header.

---

## Algorithm — sliding window counter

For each `(ip, siteId)` bucket:

1. Delete all entries older than 60 seconds.
2. Count remaining entries.
3. If `count >= limit` → reject with 429.
4. Otherwise insert a new entry and allow the request.

This is a simple, append-only log approach. No atomic increment needed; the
delete + count + insert is wrapped in a SQLite transaction (WAL mode already
enabled).

---

## Implementation Steps

### 1. DB schema — add `rate_limit_entries` table

- **`backend/server/db/sqlite/schema.ts`** — add:

  ```ts
  rate_limit_entries {
    id:        text  PK (CUID2)
    ip:        text  NOT NULL
    siteId:    text  NOT NULL
    createdAt: int   NOT NULL (timestamp_ms)

    INDEX: (ip, siteId, createdAt)
  }
  ```

- Run `bun run gen` to generate the migration.

### 2. Site schema — add `rateLimitRpm` field

- **`backend/server/db/sqlite/schema.ts`** — add nullable `rateLimitRpm`
  integer column to the `sites` table (null = use global default).
- **`backend/shared/types.ts`** — add `rateLimitRpm: z.number().int().positive().nullable().optional()` to the `Site` schema.
- Regenerate migration.

### 3. Global default env var

- **`backend/server/utils/env.ts`** — add:
  ```ts
  const RATE_LIMIT_RPM = Number(process.env.RATE_LIMIT_RPM) || 20;
  ```
  Default of 20 requests/minute per (IP, site).

### 4. Rate limit service

- **`backend/server/services/rate-limit-service.ts`** _(new)_ — exposes:
  ```ts
  interface RateLimitService {
    check(
      ip: string,
      siteId: string,
      limitRpm: number,
    ): Promise<{
      allowed: boolean;
      remaining: number;
      resetInMs: number;
    }>;
  }
  ```
  Implementation:
  - Opens a SQLite transaction.
  - Deletes entries older than 60 s for this `(ip, siteId)`.
  - Counts remaining entries.
  - If `count >= limit` return `allowed: false` with `resetInMs` = time until
    oldest entry expires.
  - Otherwise insert a new entry and return `allowed: true`.

### 5. Rate limit database — add to `KnowledgeDatabase`

- **`backend/server/services/knowledge-database/index.ts`** — add `rateLimits`
  namespace:
  ```ts
  rateLimits: {
    check(ip, siteId, limitRpm): Promise<RateLimitResult>
    cleanup(): Promise<void>   // called by daily cron
  }
  ```
- **`backend/server/services/knowledge-database/sqlite.ts`** — implement using
  Drizzle; add a `@daily` cron to call `cleanup()` (delete all entries older
  than 60 s to keep the table lean).

### 6. Rate limit plugin

- **`backend/server/plugins/rate-limit-plugin.ts`** _(new)_ — a Zeta plugin
  applied only to chat routes:

  ```ts
  export const rateLimitPlugin = createApp()
    .onGlobalRequest(async ({ request }) => {
      const ip = getClientIp(request);
      const siteId = await getSiteIdFromRequest(request);
      if (!siteId) return; // No site context — skip

      const site = await db.sites.get(siteId);
      const limitRpm = site?.rateLimitRpm ?? env.RATE_LIMIT_RPM;

      const result = await db.rateLimits.check(ip, siteId, limitRpm);
      if (!result.allowed) {
        return new Response("Too Many Requests", {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(result.resetInMs / 1000)),
            "X-RateLimit-Limit": String(limitRpm),
            "X-RateLimit-Remaining": "0",
          },
        });
      }
    })
    .export();
  ```

  Helper `getClientIp(request)`: reads `X-Forwarded-For` (first IP), falls
  back to a placeholder if unavailable.

### 7. Wire into chat routes

- **`backend/server/apis/chat-apis.ts`** — add `.use(rateLimitPlugin)` to the
  `chatApis` app (applied before all handlers).

### 8. Expose limit in site API responses

- `rateLimitRpm` is already part of `Site` (step 2), so it flows through
  `GET /api/sites`, `POST /api/sites`, and `PATCH /api/sites/:id` for free.

### 9. Kubernetes

- **`k8s/backend-configmap.yaml`** — add `RATE_LIMIT_RPM: "20"`.

---

## Files to Modify

| File                                                   | Change                                                      |
| ------------------------------------------------------ | ----------------------------------------------------------- |
| `backend/server/db/sqlite/schema.ts`                   | Add `rateLimitEntries` table; add `rateLimitRpm` to `sites` |
| `backend/shared/types.ts`                              | Add `rateLimitRpm` field to `Site`                          |
| `backend/server/utils/env.ts`                          | Add `RATE_LIMIT_RPM` global default                         |
| `backend/server/services/knowledge-database/index.ts`  | Add `rateLimits` namespace                                  |
| `backend/server/services/knowledge-database/sqlite.ts` | Implement `rateLimits`; add cleanup cron                    |
| `backend/server/apis/chat-apis.ts`                     | Add `.use(rateLimitPlugin)`                                 |
| `k8s/backend-configmap.yaml`                           | Add `RATE_LIMIT_RPM`                                        |

## New Files

| File                                          | Purpose                                                    |
| --------------------------------------------- | ---------------------------------------------------------- |
| `backend/server/plugins/rate-limit-plugin.ts` | Global request hook that enforces the sliding-window limit |

---

## Verification

- [ ] `bun run gen` generates the new migration cleanly
- [ ] `POST /api/chat/stream` with the same IP+siteId more than `RATE_LIMIT_RPM`
      times in 60 s returns HTTP 429 with `Retry-After`
- [ ] After the window expires, requests succeed again
- [ ] A site with `rateLimitRpm` set uses its own limit; others use the global default
- [ ] `bun run check` passes with no new type errors
- [ ] `kubectl apply --dry-run` on updated k8s manifests passes

---

## Risks / Considerations

- **IP spoofing**: `X-Forwarded-For` can be spoofed if the server is directly
  exposed. Mitigate by only trusting the header when behind a known proxy
  (configurable via `TRUSTED_PROXY` env var, or strip the header at the ingress
  level).
- **SQLite write contention**: each chat request does a delete + count + insert
  in one transaction. With WAL mode this is safe, but under very high
  concurrency it may become a bottleneck. For a single-replica SQLite deployment
  this is acceptable.
- **Distributed deployments**: SQLite rate limit state is node-local. If ever
  moving to multi-replica, replace the SQLite backend with Redis.
- **Daily cleanup**: the `@daily` cron keeps the table lean; entries are also
  cleaned up per-bucket on every `check()` call so the window stays accurate.

---

# Investigations

## Rate limiting library alternatives

_Investigated: 2025. Decision: keep hand-rolled implementation for now._

### Context

When implementing rate limiting we evaluated whether an existing npm library
should replace the hand-rolled sliding-window counter in
`server/services/knowledge-database/sqlite.ts`.

### Candidates evaluated

| Library                     | Weekly DL   | Stars | SQLite support                                        | Bun-native    | Notes                                                                                          |
| --------------------------- | ----------- | ----- | ----------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------- |
| **rate-limiter-flexible**   | 2.4 M       | 3.5 k | `RateLimiterSQLite` (sqlite3 / better-sqlite3 / knex) | ✅ compatible | Zero deps, most mature, supports fixed + sliding window, blocking strategy, insurance strategy |
| **@joint-ops/hitlimit-bun** | small (new) | —     | `bun:sqlite` store                                    | ✅ native     | 18 KB, zero deps, 372 K ops/s with SQLite; very new/untested                                   |
| **@upstash/ratelimit**      | growing     | —     | ❌ requires Upstash Redis                             | ✅ compatible | Cloud service, not suitable without Redis                                                      |
| **rolling-rate-limiter**    | 81 K        | —     | ❌ in-memory or Redis only                            | ✅ compatible | No SQLite store                                                                                |
| **bottleneck**              | 10.5 M      | —     | ❌ Redis optional                                     | ✅ compatible | Task scheduler, overkill for HTTP rate limiting                                                |

### Why `rate-limiter-flexible` was not adopted

`RateLimiterSQLite` requires a **`sqlite3`** or **`better-sqlite3`** connection
as `storeClient` — neither is the same as `bun:sqlite` (used by
`drizzle-orm/bun-sqlite`). Adopting it would mean either:

1. Adding `better-sqlite3` as a second, parallel SQLite connection alongside
   the existing Drizzle-managed one (wasteful, two connections to the same
   file), or
2. Subclassing `RateLimiterStoreAbstract` and implementing 4 abstract methods
   (`_upsert`, `_get`, `_delete`, `_getRateLimiterRes`) to delegate to Drizzle
   — at which point the library adds more boilerplate than it removes.

### Why the hand-rolled implementation was kept

The current implementation is ~60 lines of Drizzle code that:

- fits neatly into the existing schema and migration system
- reuses the same `bun:sqlite` connection managed by Drizzle
- performs a single atomic transaction (delete stale → count → insert)
- has zero new dependencies

### Future upgrade path

If the deployment ever moves to **multi-replica** or needs **Redis**,
`rate-limiter-flexible` is the obvious upgrade: swap the store from
the Drizzle custom implementation to `RateLimiterRedis` or
`RateLimiterCluster` with minimal changes to the plugin layer.
