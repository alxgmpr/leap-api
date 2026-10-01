/** @typedef {{kind: "resource"|"operation"|"schema"|"command", title: string, href: string}} SearchEntry */

/**
 * @param {any} model
 * @returns {SearchEntry[]}
 */
export function buildSearchIndex(model) {
  /** @type {SearchEntry[]} */
  const index = [];
  // Every href below is root-relative -- the caller (boot.js) prefixes it
  // with the current page's own root, the same way lib/site/href.ts builds
  // links server-side. Every kind here names its target page explicitly
  // rather than a bare "#anchor": a bare fragment only resolves from the
  // page that happens to carry it, and a hit rendered from any other page
  // would otherwise point at a fragment on no page at all.
  for (const resource of model.resources) {
    index.push({
      kind: "resource",
      title: resource.name,
      // Resources are their own pages (resource/<name>.html) as of Task 5.
      href: `resource/${resource.name}.html`,
    });
    for (const operation of resource.operations)
      index.push({
        kind: "operation",
        title: operation.url,
        href: `resource/${resource.name}.html#${operation.operationId || operation.url}`,
      });
  }
  for (const schema of model.schemas)
    index.push({
      kind: "schema",
      // Schemas are their own pages (schema/<Name>.html) as of Task 4.
      title: schema.name,
      href: `schema/${schema.name}.html`,
    });
  // A command hit lands on its own member of the CommandType enum. Commands
  // go to several different commandprocessors (zone, area, system...), so no
  // one resource page is the right target for all of them.
  for (const row of model.commandTable)
    index.push({
      kind: "command",
      title: row.commandType,
      href: `schema/CommandType.html#${row.commandType}`,
    });
  return index;
}

/**
 * @param {SearchEntry[]} index
 * @param {string} query
 * @returns {SearchEntry[]}
 */
export function filterIndex(index, query) {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return [];
  return index
    .filter((e) => e.title.toLowerCase().includes(needle))
    .sort((a, b) => {
      // Prefix matches first, then shortest -- "zone" should find /zone before
      // /area/{areaId}/associatedzone/status/expanded.
      const aStarts = a.title.toLowerCase().startsWith(needle) ? 0 : 1;
      const bStarts = b.title.toLowerCase().startsWith(needle) ? 0 : 1;
      return aStarts - bStarts || a.title.length - b.title.length;
    })
    .slice(0, 20);
}
