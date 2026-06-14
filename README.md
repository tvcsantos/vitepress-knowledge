# VitePress Knowledge

Free, self-hosted LLM chatbot trained on your VitePress website.

## Get Started

It takes two steps to add an AI assistant to your VitePress website:

1. Generate knowledge files based on your docs
2. Self-host a light-weight server that sends chat messages to LiteLLM.

### Generate Knowledge Files

Knowledge files are just your regular markdown documentation merged into one or more text files. LLMs use these files as their "knowledge" of your software.

Add the `vitepress-knowledge` NPM package to your project:

```bash
npm i -D vitepress-knowledge
```

```ts
// docs/.vitepress/config.ts
import { defineConfig } from "vitepress";
import knowledge from "vitepress-knowledge";

export default defineConfig({
  extends: knowledge({
    // This is the URL to where you'll host the server
    serverUrl: "https://chat.your-docs.com",
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

### Setup the Backend

The backend provides two things:

1. JS code for the "Ask AI" button and chat window
2. Proxy requests to LiteLLM so you don't have to expose your API keys on your website.

Here's an example Docker Compose file for spinning up the backend.

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
      APP_NAME: WXT
      DOMAIN: chat.wxt.dev
      DOCS_URL: https://wxt.dev
      GOOGLE_API_KEY: your_google_api_key # Get an API key @ https://aistudio.google.com
      GEMINI_2_0_FLASH: true
      SYSTEM_PROMPT: |
        You are a documentation assistant for "{{ APP_NAME }}" ({{ DOMAIN }}). Answer any questions based off your training knowledge below:

        {{ KNOWLEDGE }}
```

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
