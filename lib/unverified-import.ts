import { existsSync, readFileSync } from "node:fs";
import { parse } from "yaml";

export type SchemaNode = Record<string, unknown>;

const NOTE =
  "UNVERIFIED. Recovered from the firmware route table and imported without " +
  "hand-refinement: no capture has exercised it, no platform availability is " +
  "known, and the shapes it references are the generator's staging output. " +
  "Everything in this reference outside this tier has been checked against " +
  "captured traffic; this has not.";

const COLLECTION_NOTE =
  "No response schema is asserted. The firmware extraction labels a " +
  "single-segment collection GET with the singular struct name while the wire " +
  "sends a plural wrapper -- a defect confirmed for 12 of 16 probe-confirmed " +
  "collection GETs elsewhere in this document. The wrapper's real key has only " +
  "ever been established from captures, and there are none for this route, so " +
  "naming one here would be a guess.";

/**
 * A single-segment collection GET, the shape the extraction is known to
 * mislabel. `/alias` is one; `/zone/{zoneId}/status` is not.
 */
export function isCollectionGet(path: string, method: string): boolean {
  return method === "get" && path.split("/").filter(Boolean).length === 1;
}

/** Strip the known-defective response and say why. */
function neutralizeCollectionGet(operation: SchemaNode): SchemaNode {
  const { ...rest } = operation;
  rest["x-leap-body-type"] = undefined;
  rest.responses = { "200": { description: "Success" } };
  rest.description = [rest.description, COLLECTION_NOTE]
    .filter(Boolean)
    .join("\n\n");
  return rest;
}

function mark(operation: SchemaNode, path: string): SchemaNode {
  const marked: SchemaNode = { ...operation, "x-leap-verified": false };
  marked.description = [marked.description, NOTE].filter(Boolean).join("\n\n");
  return isCollectionGet(path, "get") && "responses" in marked
    ? neutralizeCollectionGet(marked)
    : marked;
}

const METHODS = ["get", "post", "put", "delete"] as const;

/**
 * Path items for the allowlisted routes, taken from the generator's staging
 * tree and marked unverified.
 *
 * Only paths absent from the refined tree are imported; a refined path always
 * wins, and this never overwrites one.
 */
export function importUnverifiedPaths(input: {
  allowlist: string[];
  bundledPaths: Set<string>;
  generatedDir?: string;
}): Record<string, SchemaNode> {
  const dir = input.generatedDir ?? "spec/paths/_generated";
  const wanted = new Set(input.allowlist);
  const out: Record<string, SchemaNode> = {};

  const families = new Set(
    input.allowlist.map((path) => path.split("/")[1] ?? "misc"),
  );
  for (const family of families) {
    const file = `${dir}/${family}.yaml`;
    if (!existsSync(file)) continue;
    const items = parse(readFileSync(file, "utf8")) as Record<
      string,
      SchemaNode
    >;
    for (const [path, item] of Object.entries(items)) {
      if (!wanted.has(path) || input.bundledPaths.has(path)) continue;
      const marked: SchemaNode = {};
      for (const [key, value] of Object.entries(item)) {
        marked[key] = (METHODS as readonly string[]).includes(key)
          ? mark(value as SchemaNode, path)
          : value;
      }
      marked["x-leap-verified"] = false;
      out[path] = marked;
    }
  }
  return out;
}

/**
 * Schemas the imported paths reference, transitively, that the bundle does not
 * already carry. Refined schemas always win: a name already bundled is never
 * replaced by its staging counterpart.
 */
export function importUnverifiedSchemas(input: {
  paths: Record<string, SchemaNode>;
  bundledSchemas: Set<string>;
  generatedDir?: string;
}): Record<string, SchemaNode> {
  const dir = input.generatedDir ?? "spec/components/schemas/_generated";
  const out: Record<string, SchemaNode> = {};

  const queue: string[] = [];
  for (const match of JSON.stringify(input.paths).matchAll(
    /#\/components\/schemas\/([A-Za-z0-9_]+)/g,
  ))
    queue.push(match[1] as string);

  while (queue.length > 0) {
    const name = queue.pop() as string;
    if (input.bundledSchemas.has(name) || name in out) continue;
    const file = `${dir}/${name}.yaml`;
    if (!existsSync(file)) continue;

    const text = readFileSync(file, "utf8");
    const schema = parse(text) as SchemaNode;
    schema["x-leap-verified"] = false;
    schema.description = [schema.description, NOTE]
      .filter(Boolean)
      .join("\n\n");
    out[name] = schema;

    for (const match of text.matchAll(
      /#\/components\/schemas\/([A-Za-z0-9_]+)/g,
    ))
      queue.push(match[1] as string);
  }
  return out;
}
