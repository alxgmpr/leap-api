import { Marked } from "marked";

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
