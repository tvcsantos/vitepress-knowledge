# Contributing

To get started, install [Bun](https://bun.sh) and install dependencies:

```sh
bun i
```

Next, copy `backend/.env.template` to `backend/.env` and fill in your LiteLLM
proxy details (`LITELLM_BASE_URL`, `LITELLM_API_KEY`, `LITELLM_MODELS`). The
server uses LiteLLM as its only model backend, so any provider (OpenAI, Gemini,
Anthropic, Azure, Ollama, etc.) is configured there.

After you've added the secret, you should be able to run the test docs website:

```sh
bun dev
```

Click the "Ask AI" button in the bottom right corner, and you should be able to chat with the AI!

> During development, there are 4 servers running:
>
> 1. http://localhost:5173 - The VitePress website
> 2. http://localhost:3000 - The Chat UI (with proxy to the public API)
> 3. http://localhost:3001 - The public API (chat, models, assets)
> 4. http://localhost:3002 - The management API (sites, knowledge, health)
>
> Most of the time, you can validate your changes against the VitePress site or chat UI.

## Project Structure

Two main folders and a few subdirecties of note:

- `plugin/` - Contains the Vitepress plugin code for generating knowledge files and adding "Ask AI" button to the page.
- `backend/` - Contains the standalone server that must be hosted alongside your docs site. Includes the actual chat window UI.
  - `server/` - Server side code using [Hono](https://hono.dev)
  - `app/` - Frontend code for chat UI
  - `shared/` - Any shared utils or types used by both the `server/` and `app/` directories.

### Responsibilities

The plugin is responsible for adding the "Ask AI" script to the page. It is also responsible for showing the modal overlay the chat window goes inside of.

The backend is responsible for hosting the chat UI code and any APIs it requires. The UI is added to the modal as an iframe. There are several benefits to this approach:

- The chat window styles don't effect the documentation's styles.
- The JS for the button and overlay is tiny, and loads instantly
- The chat can be accessed from both the VitePress site (as modal) and the website (as a full size website), both sharing conversation history.
- Easier to build

Downsides to this approach are:

- The chat is less integrated into VitePress, not inheriting styles and appearance
- Cannot use brand color from docs site automatically.

But the benefits outweigh the downsides, so that's why it's designed the way it is.
