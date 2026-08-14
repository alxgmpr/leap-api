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
 * Every kind of reference now resolves to a real page URL: `schema` (Task 4),
 * `resource`/`operation` (Task 5), and `doc`/`recipe`/the `recipes` and
 * `coverage` tiers (Task 6). Nothing points at an anchor on index.html
 * anymore -- index.html is just the overview.
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
    // Every tier is now its own top-level page.
    return `${root}${name}.html`;
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
    return `${root}docs/${slug}.html`;
  },
  docHeading(root: string, slug: string, headingId: string): string {
    return `${root}docs/${slug}.html#${headingId}`;
  },
  recipe(root: string, slug: string): string {
    return `${root}recipe/${slug}.html`;
  },
};
