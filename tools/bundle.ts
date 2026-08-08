import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { parse, stringify } from "yaml";
import { buildMatrix, renderMatrixTable } from "../lib/platform-matrix.ts";

const PATHS_DIR = "spec/paths";
const SCHEMAS_DIR = "spec/components/schemas";

/** Read every .yaml directly in a directory, skipping the _generated subtree. */
function readRefined(dir: string): Record<string, unknown>[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".yaml"))
    .map((e) => ({
      __name: basename(e.name, ".yaml"),
      ...(parse(readFileSync(join(dir, e.name), "utf8")) as object),
    }));
}

const doc = parse(readFileSync("spec/openapi.yaml", "utf8")) as {
  paths: Record<string, unknown>;
  components: { schemas: Record<string, unknown> };
  tags: { name: string }[];
};

for (const file of readRefined(SCHEMAS_DIR)) {
  const { __name, ...schema } = file as { __name: string };
  doc.components.schemas[__name] = schema;
}

for (const file of readRefined(PATHS_DIR)) {
  const { __name, ...items } = file as { __name: string };
  Object.assign(doc.paths, items);
}

// Inject platform availability into operation descriptions so it renders in
// tools that hide x-* extensions.
const probes: Record<string, Record<string, { status: string }>> = {};
for (const [platform, path] of [
  ["ra3", "fixtures/ra3.json"],
  ["caseta", "fixtures/caseta.json"],
] as const) {
  if (existsSync(path))
    probes[platform] = JSON.parse(readFileSync(path, "utf8"));
}
const matrix = Object.keys(probes).length > 0 ? buildMatrix(probes) : {};

// Explicit allow-list of HTTP methods to prevent injecting into vendor extensions
const HTTP_METHODS = new Set([
  "get",
  "post",
  "put",
  "delete",
  "patch",
  "head",
  "options",
  "trace",
]);

for (const [path, item] of Object.entries(doc.paths)) {
  const status = matrix[path];
  if (!status || !item || typeof item !== "object") continue;
  for (const [method, op] of Object.entries(item)) {
    if (!HTTP_METHODS.has(method) || !op || typeof op !== "object") continue;
    const operation = op as Record<string, unknown>;
    operation["x-leap-platforms"] = status;
    const existing =
      typeof operation.description === "string"
        ? `${operation.description}\n\n`
        : "";
    operation.description = `${existing}${renderMatrixTable(status)}`;
  }
}

doc.tags = [
  ...new Set(Object.keys(doc.paths).map((p) => p.split("/")[1] ?? "misc")),
]
  .sort()
  .map((name) => ({ name }));

mkdirSync("dist", { recursive: true });
writeFileSync("dist/openapi.yaml", stringify(doc), "utf8");
console.log(
  `bundled ${Object.keys(doc.paths).length} paths, ${Object.keys(doc.components.schemas).length} schemas`,
);
