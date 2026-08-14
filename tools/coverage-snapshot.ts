/**
 * One coverage measurement of whatever tree is the current working directory.
 *
 * Run from the repository root it measures HEAD; run with cwd set to a git
 * worktree of an older commit (see tools/coverage-history.ts) it measures that
 * commit. Either way the measuring code is this checkout's -- the definitions
 * of "covered" changed repeatedly over the project's history, and a burndown
 * whose metric moves under it is not a burndown. So each historical point is
 * that commit's artifacts read by today's rules, never that commit's own
 * accounting.
 *
 * Prints one JSON object on stdout and nothing else, so the driver can parse it.
 */
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { classifyRoutes, readRoutes } from "../lib/site/uncovered.ts";
import { computeCoverage } from "./check-coverage.ts";

export type Snapshot = {
  /** Firmware route templates the extraction recovered. The fixed denominator. */
  firmwareRoutes: number;
  /** Recovered routes neither bundled nor represented by a corrected/xid twin. */
  uncoveredRoutes: number;
  /** Bundled paths with no 200 capture behind them. */
  noFixture: number;
  todoEnums: number;
  todoResponses: number;
  unverifiedPaths: number;
  unverifiedSchemas: number;
  /** Refined-tier paths, for context on what the remaining counts are measured against. */
  refinedPaths: number;
};

export function snapshot(): Snapshot {
  const doc = parse(readFileSync("dist/openapi.yaml", "utf8")) as {
    paths: Record<string, Record<string, unknown>>;
  };

  // The refined tier alone, as test/site-uncovered.test.ts and
  // tools/derive-unverified.ts both do: the bundle also carries the unverified
  // import, and counting an imported route as covered would classify the very
  // routes it imported as no longer absent.
  const bundledPaths = new Set(
    Object.entries(doc.paths)
      .filter(([, item]) => item["x-leap-verified"] !== false)
      .map(([path]) => path),
  );

  const absent = classifyRoutes({ bundledPaths });
  const coverage = computeCoverage();

  return {
    firmwareRoutes: readRoutes().length,
    uncoveredRoutes: absent.filter((route) => route.absence.startsWith("un"))
      .length,
    noFixture: coverage.specWithoutFixture.length,
    todoEnums: coverage.todoEnums,
    todoResponses: coverage.todoResponses,
    unverifiedPaths: coverage.unverifiedPaths,
    unverifiedSchemas: coverage.unverifiedSchemas,
    refinedPaths: bundledPaths.size,
  };
}

if (process.argv[1]?.endsWith("coverage-snapshot.ts"))
  console.log(JSON.stringify(snapshot()));
