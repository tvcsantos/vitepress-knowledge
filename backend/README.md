# VitePress Knowledge Server

> This page documents the server. [See the root README to get started](../README.md).

The server does three things:

1. Serves the JS for the "Ask AI" button and chat window (`/ask-ai.js`).
2. Proxies chat requests to a [LiteLLM](https://docs.litellm.ai/docs/simple_proxy)
   proxy so your model API keys never reach the browser.
3. Stores per-site configuration and knowledge files (multi-tenant - one server
   can power many docs sites, each identified by a `siteId`).

LiteLLM is the only model backend; it's an OpenAI-compatible proxy that fronts
100+ providers, so any provider is configured in your LiteLLM proxy, not here.

## Environment Variables

Server-wide configuration. **Per-site** settings (app name, branding, system
prompt, CORS, etc.) are **not** environment variables - they're stored in the
database and managed through the [sites API](#sites-admin-api).

| Name                   | Default                 | Description                                                                                                                                                     |
| ---------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LITELLM_API_KEY`      | -                       | LiteLLM proxy key, sent as `Authorization: Bearer`. Required to chat.                                                                                           |
| `LITELLM_BASE_URL`     | `http://localhost:4000` | URL of your LiteLLM proxy. `/chat/completions` is appended automatically.                                                                                       |
| `LITELLM_MODELS`       | -                       | Comma-separated model aliases (as defined in your LiteLLM config) as `alias[:Display Name]`. The display name is shown in the chat UI.                          |
| `DATABASE_TYPE`        | `sqlite`                | Database backend. Only `sqlite` is supported.                                                                                                                   |
| `DATABASE_SQLITE_PATH` | `data/knowledge.db`     | Path to the SQLite file. Knowledge files are stored alongside it under `<dir>/knowledge/<siteId>/`.                                                             |
| `PORT`                 | `5174`                  | Port the server listens on. (The Docker image defaults this to `3000`.)                                                                                         |
| `LOG_LEVEL`            | `info`                  | Pino log level: `trace` \| `debug` \| `info` \| `warn` \| `error` \| `fatal` \| `silent`.                                                                       |
| `DISABLE_CORS`         | `false`                 | Set to `true` to skip all CORS enforcement. Useful when the server is behind a reverse proxy (e.g. nginx, Traefik, AWS ALB) that already handles CORS headers.  |
| `ADMIN_TOKEN`          | -                       | Bearer token protecting the admin APIs (site management + knowledge upload). If unset, those APIs are open (not recommended). Generate: `openssl rand -hex 32`. |

## Public API

These are called by the chat UI and don't require auth (CORS is enforced per-site
based on the site's `corsOrigin`):

| Method | Path                 | Description                                                                                                                 |
| ------ | -------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/models`        | List available models. The chat UI shows a picker; the selection is persisted in `localStorage` under `vpk:selected-model`. |
| `POST` | `/api/chat`          | Send messages and get a single response. Body: `{ siteId, model, messages }`.                                               |
| `POST` | `/api/chat/stream`   | Same as above but streams the reply token-by-token via Server-Sent Events.                                                  |
| `GET`  | `/ask-ai.js?siteId=` | The JS injected into your docs site. The plugin adds this script tag for you.                                               |
| `GET`  | `/privacy-policy`    | The hosted privacy policy.                                                                                                  |
| `GET`  | `/api/health`        | Health check (`204`).                                                                                                       |

## Sites (admin API)

A "site" holds all per-tenant configuration. Admin routes require
`Authorization: Bearer $ADMIN_TOKEN` (when `ADMIN_TOKEN` is set).

| Method   | Path                 | Auth  | Description                                        |
| -------- | -------------------- | ----- | -------------------------------------------------- |
| `GET`    | `/api/sites`         | admin | List all sites.                                    |
| `GET`    | `/api/sites/default` | -     | The single site, or `null` if zero/multiple exist. |
| `POST`   | `/api/sites`         | admin | Create a site.                                     |
| `GET`    | `/api/sites/:id`     | admin | Get a site.                                        |
| `PATCH`  | `/api/sites/:id`     | admin | Update a site (partial).                           |
| `DELETE` | `/api/sites/:id`     | admin | Delete a site (and its knowledge files).           |

### Site fields

| Field               | Description                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `name`              | Human-readable label for the site.                                                                                                         |
| `appName`           | App name shown throughout the chat UI.                                                                                                     |
| `docsUrl`           | URL of the VitePress site hosting `/knowledge/*` (used as a fallback source for knowledge).                                                |
| `serverUrl`         | Public URL where this server is hosted. Used to derive the `<base href>` so assets resolve under any context path.                         |
| `corsOrigin`        | Comma-separated list of allowed CORS origins for this site.                                                                                |
| `brandColor`        | Brand color (any valid CSS color).                                                                                                         |
| `brandContentColor` | Text/icon color on top of the brand color.                                                                                                 |
| `assistantIconUrl`  | Full **absolute** URL to the assistant's avatar (used as a CSS `background-image`; a root-relative `/path` would ignore the context path). |
| `systemPrompt`      | System prompt template. Supports `{{ KNOWLEDGE }}`, `{{ APP_NAME }}`, `{{ DOCS_URL }}`, `{{ SERVER_URL }}`, `{{ ASSISTANT_ICON_URL }}`.    |
| `welcomeMessage`    | Markdown shown before the first message. Supports `{{ APP_NAME }}`, `{{ DOCS_URL }}`, `{{ SERVER_URL }}`, `{{ ASSISTANT_ICON_URL }}`.      |

### Example: create a site

```sh
curl -X POST "$SERVER_URL/api/sites" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-docs",
    "appName": "My Docs",
    "docsUrl": "https://my-docs.example.com",
    "serverUrl": "https://chat.example.com",
    "corsOrigin": "https://my-docs.example.com",
    "brandColor": "#00ADEF",
    "brandContentColor": "#ffffff",
    "assistantIconUrl": "https://my-docs.example.com/logo.svg",
    "systemPrompt": "You are a documentation assistant for {{ APP_NAME }}.\n\n{{ KNOWLEDGE }}",
    "welcomeMessage": "Hi! Ask me anything about **{{ APP_NAME }}**."
  }'
```

The returned `id` is the `siteId` you pass to the VitePress plugin.

## Knowledge files (admin API)

Knowledge can be supplied two ways:

1. **Uploaded** to the server (stored on disk under
   `<DATABASE_SQLITE_PATH dir>/knowledge/<siteId>/`). Preferred.
2. **Fetched** from the site's `docsUrl` (`/knowledge/index.json` + the listed
   files) as a fallback when no files have been uploaded.

| Method   | Path                               | Description                                                                                               |
| -------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/sites/:id/knowledge`         | List stored knowledge files for a site.                                                                   |
| `PUT`    | `/api/sites/:id/knowledge`         | Upload/replace a file via `multipart/form-data` (field `file`). The uploaded filename is the storage key. |
| `DELETE` | `/api/sites/:id/knowledge`         | Delete all stored files (revert to the `docsUrl` fallback).                                               |
| `DELETE` | `/api/sites/:id/knowledge/:fileId` | Delete a single stored file.                                                                              |

### Example: upload a knowledge file

```sh
curl -X PUT "$SERVER_URL/api/sites/$SITE_ID/knowledge" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -F "file=@docs/.vitepress/dist/knowledge/docs.txt"
```

## Hosting

Use the Docker image (see the [root README](../README.md#run-the-server)), or run
from source:

```sh
bun install
bun --cwd backend dev      # dev: Vite app on :3000 + API on :3001
bun --cwd backend build    # build -> backend/.output/{server,public}
bun --cwd backend preview  # build + run the production bundle
```

The `Dockerfile` at the repo root contains the minimal build to produce and run
the server (`bun run server/index.js`).

## Syntax highlighting (Shiki - no WebAssembly)

The chat UI highlights code blocks in the assistant's responses with
[Shiki](https://shiki.style). It uses Shiki's **JavaScript RegExp engine**
(`createJavaScriptRegexEngine`) rather than the default **Oniguruma WebAssembly**
engine, so the app ships no ~600 kB WASM blob and avoids a runtime WASM
download/compile. See `app/utils/md-to-html.ts`.

Grammars are **loaded on demand**: only the theme is preloaded, and a language's
grammar is fetched the first time a code block uses it (unknown languages fall
back to plaintext). Because of this, the production build emits many small,
lazily-fetched grammar chunks, and a few grammars (e.g. `cpp`, `emacs-lisp`) are
large - hence the raised `build.chunkSizeWarningLimit` in `vite.config.ts`. These
chunks are only downloaded when their language actually appears.

Note: the JS engine runs standard TextMate grammars in `forgiving` mode; for the
overwhelming majority of languages this matches the WASM engine, though a few
grammars relying on Oniguruma-specific regex features may highlight slightly
differently.
