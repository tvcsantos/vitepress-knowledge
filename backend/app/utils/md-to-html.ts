import markdownit from "markdown-it";
import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import { bundledLanguages } from "shiki/langs";

const THEME = "github-dark";

const renderer = markdownit({
  typographer: true,
}).use(linkPlugin);

export const MARKDOWN_SYNTAX_HIGHLIGHTER_READY_EVENT =
  "markdown-syntax-highlighter-ready";

let highlighter: HighlighterCore | undefined;
const loadedLangs = new Set<string>();
const pendingLangs = new Set<string>();

function notifyReady(): void {
  window.dispatchEvent(
    new CustomEvent(MARKDOWN_SYNTAX_HIGHLIGHTER_READY_EVENT),
  );
}

// Initialize the highlighter with Shiki's JavaScript RegExp engine (no
// WebAssembly). Only the theme is preloaded; grammars are loaded on demand by
// `ensureLanguagesLoaded` so any language the assistant emits can be highlighted
// without bundling every grammar up front.
const ready = (async () => {
  highlighter = await createHighlighterCore({
    themes: [import("@shikijs/themes/github-dark")],
    langs: [],
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  });
  // Set the markdown-it highlight function ourselves (instead of using
  // `@shikijs/markdown-it`'s `fromHighlighter`, which snapshots the set of loaded
  // languages once at setup time and would never see lazily-loaded grammars).
  // This checks the loaded grammars on every render.
  renderer.options.highlight = highlightCode;
  notifyReady();
})();

/** Render a code block with Shiki, falling back to plaintext for unloaded/unknown languages. */
function highlightCode(code: string, lang: string): string {
  if (!highlighter) return "";
  // Shiki appends a trailing newline; markdown-it already includes one.
  if (code.endsWith("\n")) code = code.slice(0, -1);
  const loaded =
    !!lang && highlighter.getLoadedLanguages().includes(lang.toLowerCase());
  return highlighter.codeToHtml(code, {
    lang: loaded ? lang.toLowerCase() : "text",
    theme: THEME,
    transformers: [
      {
        // The theme background conflicts with the message backgrounds, so we
        // remove the custom background color and use Tailwind's. Only the text
        // is affected by the theme.
        name: "vitepress-knowledge:pre-background",
        pre(node) {
          delete node.properties.style;
        },
      },
      {
        // Mirror markdown-it's default `language-*` class on the <code> element.
        name: "vitepress-knowledge:block-class",
        code(node) {
          node.properties.class = `language-${lang || "text"}`;
        },
      },
    ],
  });
}

export function mdToHtml(md: string): string {
  return renderer.render(md);
}

// Matches the language token of a fenced code block (``` or ~~~).
const CODE_FENCE_RE = /^[ \t]*(?:`{3,}|~{3,})[ \t]*([\w#+.-]+)/gm;

/**
 * Lazily load Shiki grammars for the languages used in the given markdown.
 * Unknown languages are ignored (they fall back to plaintext). When new grammars
 * finish loading, the ready event is dispatched so the rendered output is
 * re-highlighted.
 */
export async function ensureLanguagesLoaded(md: string): Promise<void> {
  await ready;

  const wanted = new Set<string>();
  for (const match of md.matchAll(CODE_FENCE_RE)) {
    wanted.add(match[1].toLowerCase());
  }

  const toLoad = [...wanted].filter(
    (lang) =>
      lang in bundledLanguages &&
      !loadedLangs.has(lang) &&
      !pendingLangs.has(lang),
  );
  if (toLoad.length === 0) return;

  await Promise.all(
    toLoad.map(async (lang) => {
      pendingLangs.add(lang);
      try {
        const grammar =
          await bundledLanguages[lang as keyof typeof bundledLanguages]();
        await highlighter!.loadLanguage(grammar);
        loadedLangs.add(lang);
      } catch {
        // Unsupported grammar - leave it to fall back to plaintext.
      } finally {
        pendingLangs.delete(lang);
      }
    }),
  );

  notifyReady();
}

/**
 * Customize rendered `<a>` tags:
 *
 * 1. Rewrite absolute-path hrefs to the docs site, e.g. `/guide` -> `${DOCS_URL}/guide`.
 * 2. Always open links in a new tab so the embedded chat widget isn't navigated
 *    away from. (Conversation state is persisted to sessionStorage separately, so
 *    this is about keeping the widget in view, not about avoiding data loss.)
 *
 * Both behaviors live in a single `link_open` rule because markdown-it only
 * keeps one renderer rule per token type - registering them separately would
 * mean the last one silently overwrites the other.
 */
function linkPlugin(md: markdownit): void {
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx];

    const hrefIndex = token.attrIndex("href");
    if (hrefIndex >= 0 && token.attrs?.[hrefIndex]?.[1]?.startsWith("/")) {
      token.attrs[hrefIndex][1] = DOCS_URL + token.attrs[hrefIndex][1];
    }

    if (token.attrIndex("target") < 0) {
      token.attrPush(["target", "_blank"]);
    }

    return self.renderToken(tokens, idx, options);
  };
}
