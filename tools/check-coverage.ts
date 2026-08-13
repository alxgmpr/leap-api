import { existsSync, readFileSync } from "node:fs";
import { parse } from "yaml";
import { templatePath } from "../lib/platform-matrix.ts";

export type Coverage = {
  probedNotInSpec: string[];
  specWithoutFixture: string[];
  todoEnums: number;
  todoResponses: number;
  /** Firmware routes imported without hand-refinement, counted separately. */
  unverifiedPaths: number;
  unverifiedSchemas: number;
};

export function computeCoverage(): Coverage {
  const doc = parse(readFileSync("dist/openapi.yaml", "utf8")) as {
    paths: Record<string, Record<string, unknown>>;
    components: { schemas: Record<string, Record<string, unknown>> };
  };

  // Every number here describes the hand-refined tier. The unverified import
  // is a different kind of content -- no capture, staging shapes -- and
  // folding it in would silently change what each count means: adding 163
  // routes nobody has probed moved "in spec but no fixture" from 117 to 280
  // without anything about the refined reference having changed.
  const verified = Object.entries(doc.paths).filter(
    ([, item]) => item["x-leap-verified"] !== false,
  );
  const specPaths = new Set(verified.map(([path]) => path));

  // Fixture files come from captures.json (the manifest Task 7 introduced),
  // not a hardcoded list -- every manifest entry is a `{path: {status,
  // body}}` probe set (the subscribe log and late-frames evidence are
  // deliberately never added to this manifest; see tools/redact.ts), so this
  // generalizes cleanly to however many probe corpora the project has
  // collected without editing this file again per campaign.
  const manifest: { to: string }[] = existsSync("captures.json")
    ? JSON.parse(readFileSync("captures.json", "utf8"))
    : [];
  const probedPaths = new Set<string>();
  for (const { to: file } of manifest) {
    if (!existsSync(file)) continue;
    const probe: Record<string, { status: string }> = JSON.parse(
      readFileSync(file, "utf8"),
    );
    for (const [path, result] of Object.entries(probe)) {
      if (result.status.startsWith("200")) probedPaths.add(templatePath(path));
    }
  }

  // Marker counts come from the bundle, not the _generated index files: only
  // bundled content is what a reader actually sees. Counted structurally over
  // the verified tier rather than by regex over the whole file, so the import
  // does not inflate them.
  const verifiedSchemas = Object.entries(doc.components.schemas).filter(
    ([, schema]) => schema["x-leap-verified"] !== false,
  );
  const verifiedText = JSON.stringify([
    verified.map(([, item]) => item),
    verifiedSchemas.map(([, schema]) => schema),
  ]);

  return {
    probedNotInSpec: [...probedPaths].filter((p) => !specPaths.has(p)).sort(),
    specWithoutFixture: [...specPaths]
      .filter((p) => !probedPaths.has(p))
      .sort(),
    todoEnums: (verifiedText.match(/TODO\(enum\)/g) ?? []).length,
    todoResponses: (verifiedText.match(/TODO\(response\)/g) ?? []).length,
    unverifiedPaths: Object.keys(doc.paths).length - verified.length,
    unverifiedSchemas:
      Object.keys(doc.components.schemas).length - verifiedSchemas.length,
  };
}

// Only report when invoked directly, so importing this module in tests is inert.
if (process.argv[1]?.endsWith("check-coverage.ts")) {
  const c = computeCoverage();
  console.log(`probed but not in spec:  ${c.probedNotInSpec.length}`);
  console.log(`in spec but no fixture:  ${c.specWithoutFixture.length}`);
  console.log(`unresolved enums:        ${c.todoEnums}`);
  console.log(`unresolved responses:    ${c.todoResponses}`);
  console.log(
    `unverified imports:      ${c.unverifiedPaths} paths, ${c.unverifiedSchemas} schemas`,
  );
  if (c.probedNotInSpec.length > 0) {
    console.log("\nMissing from spec:");
    for (const p of c.probedNotInSpec) console.log(`  ${p}`);
    process.exit(1);
  }
}
