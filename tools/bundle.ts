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
import {
  importUnverifiedPaths,
  importUnverifiedSchemas,
} from "../lib/unverified-import.ts";

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

// Import the firmware routes that were never hand-refined, marked unverified.
//
// This runs after the refined tree is merged and never overwrites a path it
// already placed: a refined definition always wins. Only routes whose path can
// be taken at face value are listed -- the 51 whose first segment starts with
// another resource's name may be concatenations the extraction mangled, and
// importing one would mean guessing the path before guessing the shape. See
// spec/unverified-paths.json and lib/site/uncovered.ts.
const allowlist = existsSync("spec/unverified-paths.json")
  ? (
      JSON.parse(readFileSync("spec/unverified-paths.json", "utf8")) as {
        paths: string[];
      }
    ).paths
  : [];
const unverifiedPaths = importUnverifiedPaths({
  allowlist,
  bundledPaths: new Set(Object.keys(doc.paths)),
});
Object.assign(doc.paths, unverifiedPaths);
const unverifiedSchemas = importUnverifiedSchemas({
  paths: unverifiedPaths,
  bundledSchemas: new Set(Object.keys(doc.components.schemas)),
});
Object.assign(doc.components.schemas, unverifiedSchemas);

// Inject platform availability into operation descriptions so it renders in
// tools that hide x-* extensions.
//
// The probe sweeps that produced fixtures/{ra3,caseta}.json only ever sent
// ReadRequest (see lib/platform-matrix.ts's buildMatrix, which folds concrete
// probed paths into this matrix). That status therefore describes what a GET
// gets back -- it says nothing about what a POST/PUT/DELETE on the same URL
// would do. Injecting it into every HTTP method previously mislabeled write
// operations: e.g. POST /zone/{zoneId}/commandprocessor was shown as "400
// BadRequest on both platforms", but that 400 was the ReadRequest probe's
// response, not a CreateRequest's -- no CreateRequest was ever sent to a
// commandprocessor path (spec/paths/commandprocessor.yaml's own note).
// Restricted to `get` only, the one verb the probes actually exercised.
const probes: Record<string, Record<string, { status: string }>> = {};
for (const [platform, path] of [
  ["ra3", "fixtures/ra3.json"],
  ["caseta", "fixtures/caseta.json"],
] as const) {
  if (existsSync(path))
    probes[platform] = JSON.parse(readFileSync(path, "utf8"));
}
const matrix = Object.keys(probes).length > 0 ? buildMatrix(probes) : {};

for (const [path, item] of Object.entries(doc.paths)) {
  const status = matrix[path];
  if (!status || !item || typeof item !== "object") continue;
  const get = (item as Record<string, unknown>).get;
  if (!get || typeof get !== "object") continue;
  const operation = get as Record<string, unknown>;
  operation["x-leap-platforms"] = status;
  const existing =
    typeof operation.description === "string"
      ? `${operation.description}\n\n`
      : "";
  operation.description = `${existing}${renderMatrixTable(status)}`;
}

doc.tags = [
  ...new Set(Object.keys(doc.paths).map((p) => p.split("/")[1] ?? "misc")),
]
  .sort()
  .map((name) => ({ name }));

mkdirSync("dist", { recursive: true });
writeFileSync("dist/openapi.yaml", stringify(doc), "utf8");
console.log(
  `bundled ${Object.keys(doc.paths).length} paths, ${Object.keys(doc.components.schemas).length} schemas ` +
    `(${Object.keys(unverifiedPaths).length} paths and ${Object.keys(unverifiedSchemas).length} schemas unverified)`,
);
