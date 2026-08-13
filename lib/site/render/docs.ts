import { Marked } from "marked";
import type { LeapModel } from "../model.ts";
import { siteNav } from "./home.ts";
import { esc, slug } from "./html.ts";
import { type Page, page } from "./layout.ts";

const ROOT = "../../";

/**
 * One id derivation for both sides of the table of contents.
 *
 * The two callers see different text for the same heading: the ToC reads raw
 * markdown (backticks, literal apostrophes) and the renderer reads parsed
 * inline HTML (tags, `&#39;`). Stripping tags and decoding entities here is
 * what makes them converge -- without it, every possessive heading gets a ToC
 * link to an id no heading carries.
 */
function headingId(text: string): string {
  const decoded = text
    .replace(/<[^>]+>/g, "")
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replace(/`/g, "");
  return slug(decoded);
}

/** Headings, outside fenced code, with the ids the renderer below will emit. */
export function headingAnchors(
  markdown: string,
): { text: string; id: string }[] {
  const anchors: { text: string; id: string }[] = [];
  let fenced = false;
  for (const line of markdown.split("\n")) {
    if (line.startsWith("```")) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const heading = /^(#{1,3})\s+(.+?)\s*$/.exec(line);
    if (!heading) continue;
    const text = (heading[2] as string).replace(/`/g, "");
    anchors.push({ text, id: headingId(text) });
  }
  return anchors;
}

/** Marked, with heading ids matching headingAnchors so the ToC links resolve. */
function renderer(): Marked {
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        return `<h${depth} id="${headingId(text)}">${text}</h${depth}>\n`;
      },
    },
  });
  return marked;
}

export function renderDocPages(model: LeapModel): Page[] {
  const marked = renderer();
  return model.docs.map((entry) => {
    const anchors = headingAnchors(entry.markdown);
    const toc = `<nav class="toc"><ul>${anchors
      .map((a) => `<li><a href="#${esc(a.id)}">${esc(a.text)}</a></li>`)
      .join("")}</ul></nav>`;
    const main = `${toc}<article class="prose">${marked.parse(entry.markdown) as string}</article>`;
    return {
      path: `docs/${entry.slug}/index.html`,
      html: page({
        title: entry.title,
        relativeRoot: ROOT,
        nav: siteNav(model),
        main,
      }),
    };
  });
}
