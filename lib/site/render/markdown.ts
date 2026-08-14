import { Marked, type MarkedExtension } from "marked";
import { highlightJson } from "./highlight.ts";

/**
 * Colour ```json fences with the tokenizer the wire frames already use, so a
 * literal quoted in the prose and the same literal in a transcript are the
 * same object on screen.
 *
 * Only json. Returning false is marked's fall-through signal, so every other
 * language keeps the default plain-text rendering -- this repo emits JSON and
 * nothing else, and a highlighter guessing at a grammar we do not produce is
 * how a reference starts colouring tokens that are not there.
 */
export const jsonFences: MarkedExtension = {
  renderer: {
    code({ text, lang }) {
      if (lang !== "json") return false;
      return `<pre><code class="language-json">${highlightJson(text)}</code></pre>\n`;
    },
  },
};

/**
 * Markdown for text embedded inside a page -- operation and schema
 * descriptions. Deliberately emits no heading ids: an embedded description
 * would otherwise mint ids that collide with the page's own headings and with
 * every other description on the same page.
 *
 * The narrative doc pages use their own renderer (render/docs.ts), which does
 * emit ids, because their headings are link targets.
 */
const marked = new Marked({ gfm: true });
marked.use(jsonFences);

export function renderMarkdown(markdown: string): string {
  return marked.parse(markdown) as string;
}

/** The marker tools/bundle.ts prefixes to every table it injects. */
const INJECTED_MARKER = "**Platform availability**";

/**
 * Separate authored prose from the platform table `tools/bundle.ts` appends to
 * every `get` description at bundle time.
 *
 * That injection exists so the data survives renderers that hide `x-*`
 * extensions. This site reads `x-leap-platforms` directly and renders its own
 * observation table, so showing the injected copy too would print the same
 * data twice on every operation.
 */
export function splitInjectedTable(description: string): {
  prose: string;
  injected: string | null;
} {
  const at = description.lastIndexOf(INJECTED_MARKER);
  if (at === -1) return { prose: description.trim(), injected: null };
  return {
    prose: description.slice(0, at).trim(),
    injected: description.slice(at).trim(),
  };
}
