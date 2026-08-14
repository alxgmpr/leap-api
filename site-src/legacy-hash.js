/**
 * True when `pathname` names the overview page -- the only page an old
 * single-page anchor could have landed on.
 *
 * This is a GitHub Pages project site (published from `site/` per
 * .github/workflows/ci.yml), so the overview is reachable two ways: the
 * explicit file, ".../index.html", and the directory root the site is
 * actually served at, e.g. "/leap-api/" -- which is what the single-page
 * site's shared links looked like ("https://.../leap-api/#resource-zone",
 * bare root plus hash, no "index.html" in sight). Checking only the first
 * form means the redirect never fires for exactly the links it exists to
 * catch.
 * @param {string} pathname - a location.pathname value
 * @returns {boolean}
 */
export function isOverviewPath(pathname) {
  return pathname.endsWith("/index.html") || pathname.endsWith("/");
}

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
