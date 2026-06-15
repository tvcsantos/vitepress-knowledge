# VitePress Knowledge

Free, self-hosted LLM chatbot trained on your VitePress website.

## Get Started

It takes three steps to add an AI assistant to your VitePress website:

1. Self-host the light-weight server (it talks to a LiteLLM proxy).
2. Register a "site" on the server and (optionally) upload knowledge files.
3. Add the plugin to your VitePress config, pointing it at the server + site.

### Run the Server

The server proxies chat requests to a [LiteLLM](https://docs.litellm.ai/docs/simple_proxy)
proxy (so your model API keys stay off the website) and stores per-site config and
knowledge files. Here's a Docker Compose example:

```yml
# compose.yml
services:
  backend:
    image: ghcr.io/tvcsantos/vitepress-knowledge-server:latest
    ports:
      - "3000:3000"
    volumes:
      - /path/to/your/volume:/usr/src/app/data
    environment:
      # LiteLLM proxy (configure your model providers there)
      LITELLM_BASE_URL: http://litellm:4000
      LITELLM_API_KEY: sk-my-proxy-key # must match LITELLM_MASTER_KEY below
      LITELLM_MODELS: gpt-4o-mini:GPT 4o Mini
      # Protects the site/knowledge admin APIs
      ADMIN_TOKEN: change-me # openssl rand -hex 32
    depends_on:
      - litellm

  litellm:
    image: ghcr.io/berriai/litellm:main-stable
    ports:
      - "4000:4000"
    volumes:
      - ./litellm-config.yaml:/app/config.yaml
    environment:
      LITELLM_MASTER_KEY: sk-my-proxy-key # key that clients use to authenticate
      OPENAI_API_KEY: sk-... # your actual provider key (passed to litellm_params)
    command: ["--config", "/app/config.yaml", "--port", "4000"]
```

```yaml
# litellm-config.yaml
model_list:
  - model_name: gpt-4o-mini # alias exposed to clients (matches LITELLM_MODELS above)
    litellm_params:
      model: openai/gpt-4o-mini # provider/model notation (see https://docs.litellm.ai/docs/providers)
      api_key: os.environ/OPENAI_API_KEY
```

See [`backend/README.md`](backend/README.md) for the full list of environment
variables, and the [LiteLLM proxy docs](https://docs.litellm.ai/docs/simple_proxy)
for how to add other providers (Anthropic, Azure, Gemini, Ollama, etc.).

### Register a Site

Per-site configuration (branding, system prompt, CORS, etc.) lives in the server's
database, not in env vars. Create a site via the admin API and note the returned
`id` - that's your `siteId`:

```sh
curl -X POST "https://chat.your-docs.com/api/sites" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-docs",
    "appName": "My Docs",
    "docsUrl": "https://your-docs.com",
    "serverUrl": "https://chat.your-docs.com",
    "corsOrigin": "https://your-docs.com",
    "brandColor": "#00ADEF",
    "brandContentColor": "#ffffff",
    "assistantIconUrl": "https://your-docs.com/logo.svg",
    "systemPrompt": "You are a documentation assistant for {{ APP_NAME }}.\n\n{{ KNOWLEDGE }}",
    "welcomeMessage": "Hi! Ask me anything about **{{ APP_NAME }}**."
  }'
```

### Add the Plugin

Knowledge files are your markdown documentation merged into one or more text files
that the LLM uses as its "knowledge". Add the `@tvcsantos/vitepress-knowledge` package:

```bash
npm i -D @tvcsantos/vitepress-knowledge
```

```ts
// docs/.vitepress/config.ts
import { defineConfig } from "vitepress";
import knowledge from "@tvcsantos/vitepress-knowledge";

export default defineConfig({
  extends: knowledge({
    // The URL where you host the server
    serverUrl: "https://chat.your-docs.com",
    // The site id returned when you registered the site
    siteId: "your-site-id",
  }),
});
```

Test to see if your knowledge files are being built correctly:

```bash
vitepress build docs
```

You should see output like this:

```text
vitepress v1.5.0

✓ building client + server bundles...
✓ rendering pages...
✓ [knowledge] generated docs/.vitepress/dist/knowledge/docs.txt
✓ [knowledge] generated docs/.vitepress/dist/knowledge/index.json
build complete in 2.57s.
```

Knowledge files are hosted on your production docs site at `/knowledge/*`. The
server fetches them from your `docsUrl` automatically - or you can upload them to
the server directly (see [`backend/README.md`](backend/README.md#knowledge-files-admin-api)).

---

And... that's it! Once deployed, you should have a working chat window on your docs!

Checkout the plugin and server docs for more details and advanced configuration for each:

- Plugin docs: [`plugin/README.md`](plugin/README.md)
- Server docs: [`backend/README.md`](backend/README.md)

## Kudos and Thanks

A big thanks to [Aaron](https://github.com/aklinker1) for his work on the original [VitePress Knowledge](https://github.com/aklinker1/vitepress-knowledge) plugin. This project is a fork of his work, with some major refactors and improvements to make it more flexible and easier to use. Check out his original repo for more context and history on this project!

## License

This project is licensed under the MIT License - see the [License](LICENSE) file for
details.

## Contributing and Code of Conduct

Please refer to our internal [Contribution Guidelines](CONTRIBUTING.md) for detailed information on how to propose
changes, submit pull requests, and ensure a smooth collaboration process within the team. Also, don't forget to read and
respect our established [Code of Conduct](CODE_OF_CONDUCT.md) in all your interactions and contributions.

If you have any questions or require clarification on our internal guidelines, please reach out!
