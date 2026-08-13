/** @typedef {{kind: "resource"|"operation"|"schema"|"command", title: string, href: string}} SearchEntry */

/**
 * @param {any} model
 * @returns {SearchEntry[]}
 */
export function buildSearchIndex(model) {
  /** @type {SearchEntry[]} */
  const index = [];
  for (const resource of model.resources) {
    index.push({
      kind: "resource",
      title: resource.name,
      href: `resource/${resource.name}/index.html`,
    });
    for (const operation of resource.operations)
      index.push({
        kind: "operation",
        title: operation.url,
        href: `resource/${resource.name}/index.html#${operation.operationId || operation.url}`,
      });
  }
  for (const schema of model.schemas)
    index.push({
      kind: "schema",
      title: schema.name,
      href: `schema/${schema.name}/index.html`,
    });
  // Every command is sent to a commandprocessor, and the zone one is the only
  // command processor any capture has exercised -- so that is where a
  // CommandType search usefully lands.
  for (const row of model.commandTable)
    index.push({
      kind: "command",
      title: row.commandType,
      href: "resource/zone/index.html",
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
