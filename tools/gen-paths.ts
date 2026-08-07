import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import {
  disambiguatePath,
  type Route,
  routeToPathItem,
} from "../lib/route-to-path.ts";

const OUT = "spec/paths/_generated";

const routes: Route[] = JSON.parse(
  readFileSync("vendor/leap-routes.json", "utf8"),
);

/**
 * The legacy firmware-derived spec has usable prose for 305 paths but no
 * schemas. Harvest its summaries, keyed by disambiguated path and method.
 */
function legacySummaries(): Map<string, string> {
  const out = new Map<string, string>();
  const legacy = parse(readFileSync("vendor/legacy-spec.yaml", "utf8")) as {
    paths?: Record<string, Record<string, { summary?: string }>>;
  };
  for (const [rawPath, item] of Object.entries(legacy.paths ?? {})) {
    const path = disambiguatePath(rawPath.replace(/\{\w*[Ii]d\}/g, "{id}"));
    for (const [method, op] of Object.entries(item)) {
      if (op && typeof op === "object" && op.summary) {
        out.set(`${path} ${method}`, op.summary);
      }
    }
  }
  return out;
}

const summaries = legacySummaries();

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const families = new Map<string, Record<string, unknown>>();
const allPaths: string[] = [];
const todoResponses: string[] = [];

for (const route of routes) {
  const { path, item } = routeToPathItem(route);
  allPaths.push(path);
  if (!route.responseType) todoResponses.push(path);

  for (const [method, op] of Object.entries(item)) {
    if (method === "parameters") continue;
    const seeded = summaries.get(`${path} ${method}`);
    if (seeded) (op as Record<string, unknown>).summary = seeded;
  }

  const family = path.split("/")[1] ?? "misc";
  const bucket = families.get(family) ?? {};
  bucket[path] = item;
  families.set(family, bucket);
}

for (const [family, bucket] of families) {
  writeFileSync(join(OUT, `${family}.yaml`), stringify(bucket), "utf8");
}

writeFileSync(
  join(OUT, "_index.json"),
  `${JSON.stringify(
    {
      paths: allPaths.sort(),
      todoResponses: todoResponses.sort(),
      families: [...families.keys()].sort(),
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(
  `generated ${allPaths.length} paths in ${families.size} families, ${todoResponses.length} missing a responseType`,
);
