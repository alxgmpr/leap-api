/**
 * Every cross-reference in the reference is built here. Renderers used to
 * hand-write anchor strings in eight places; a URL shape that lives in eight
 * places cannot be changed at all.
 *
 * `root` is the prefix that reaches the site root from the page being
 * rendered: "" for a page at the top level, "../" for one a directory deep.
 * It is threaded through from the start so that switching a reference from an
 * in-page anchor to a page URL is a one-line change here, not a hunt.
 *
 * Docs, recipes and coverage still live entirely on index.html, so their
 * hrefs point at `${root}index.html#anchor` -- correct from both the top
 * level and a nested page. `schema` (Task 4) and `resource`/`operation`
 * (Task 5) resolve to real page URLs; recipes and coverage follow in Task 6.
 */

/** Prefix for a page at the site root. */
export const ROOT_TOP = "";
/** Prefix for a page one directory deep (resource/, schema/, docs/, recipe/). */
export const ROOT_NESTED = "../";

export type TierName = "resources" | "schemas" | "recipes" | "coverage";

export const href = {
  overview(root: string): string {
    return `${root}index.html`;
  },
  tier(root: string, name: TierName): string {
    // Resources and schemas are their own top-level pages; recipes and
    // coverage still live as sections of index.html until Task 6.
    return name === "resources" || name === "schemas"
      ? `${root}${name}.html`
      : `${root}index.html#${name}`;
  },
  resource(root: string, name: string): string {
    return `${root}resource/${name}.html`;
  },
  operation(root: string, resourceName: string, operationId: string): string {
    return `${root}resource/${resourceName}.html#${operationId}`;
  },
  schema(root: string, name: string): string {
    return `${root}schema/${name}.html`;
  },
  doc(root: string, slug: string): string {
    return `${root}index.html#doc-${slug}`;
  },
  docHeading(root: string, _slug: string, headingId: string): string {
    return `${root}index.html#${headingId}`;
  },
  recipe(root: string, slug: string): string {
    return `${root}index.html#recipe-${slug}`;
  },
};
