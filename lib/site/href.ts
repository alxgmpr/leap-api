/**
 * Every cross-reference in the reference is built here. Renderers used to
 * hand-write anchor strings in eight places; a URL shape that lives in eight
 * places cannot be changed at all.
 *
 * `root` is the prefix that reaches the site root from the page being
 * rendered: "" for a page at the top level, "../" for one a directory deep.
 * It is threaded through from the start so that switching a reference from an
 * in-page anchor to a page URL is a one-line change here, not a hunt.
 */

/** Prefix for a page at the site root. */
export const ROOT_TOP = "";
/** Prefix for a page one directory deep (resource/, schema/, docs/, recipe/). */
export const ROOT_NESTED = "../";

export type TierName = "resources" | "schemas" | "recipes" | "coverage";

export const href = {
  overview(_root: string): string {
    return "#overview";
  },
  tier(_root: string, name: TierName): string {
    return `#${name}`;
  },
  resource(_root: string, name: string): string {
    return `#resource-${name}`;
  },
  operation(_root: string, _resourceName: string, operationId: string): string {
    return `#${operationId}`;
  },
  schema(_root: string, name: string): string {
    return `#schema-${name}`;
  },
  doc(_root: string, slug: string): string {
    return `#doc-${slug}`;
  },
  docHeading(_root: string, _slug: string, headingId: string): string {
    return `#${headingId}`;
  },
  recipe(_root: string, slug: string): string {
    return `#recipe-${slug}`;
  },
};
