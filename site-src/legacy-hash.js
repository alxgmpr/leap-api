/**
 * The reference was one document for about half a day, and CI published it.
 * Those anchors are still in browser history and anywhere they were pasted.
 * Map the ones that named a section to the page that section became.
 * Deletable once the old URLs stop appearing in logs.
 * @param {string} hash - a location.hash value, e.g. "#resource-zone"
 * @returns {string | null} a root-relative page URL for the section the hash
 *   used to name, or null if the hash names nothing recognised -- callers
 *   must leave the page alone rather than redirect on a guess.
 */
export function pageForLegacyHash(hash) {
  const id = hash.replace(/^#/, "");
  if (!id) return null;
  if (id === "overview") return "index.html";
  if (
    id === "resources" ||
    id === "schemas" ||
    id === "recipes" ||
    id === "coverage"
  )
    return `${id}.html`;

  /** @type {[RegExp, (name: string) => string][]} */
  const table = [
    [/^resource-(.+)$/, (name) => `resource/${name}.html`],
    [/^schema-(.+)$/, (name) => `schema/${name}.html`],
    [/^doc-(.+)$/, (slug) => `docs/${slug}.html`],
    [/^recipe-(.+)$/, (slug) => `recipe/${slug}.html`],
  ];
  for (const [pattern, build] of table) {
    const match = pattern.exec(id);
    if (match) return build(match[1]);
  }
  return null;
}
