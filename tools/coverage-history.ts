/**
 * Build coverage-history.json: one coverage measurement per commit that could
 * have moved coverage.
 *
 * Each point is measured by checking the commit out into a throwaway git
 * worktree, running THAT commit's bundler (the spec tree's layout changed
 * repeatedly, so only its own bundler can assemble it), and then measuring the
 * result with THIS checkout's rules (tools/coverage-snapshot.ts explains why).
 *
 * Incremental by construction: commits already in the file are skipped, so the
 * routine cost after the first run is one commit. Commits whose tree will not
 * bundle are recorded as skipped and reported at the end rather than silently
 * dropped -- a burndown with holes in it should say so.
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  HISTORY_FILE,
  type HistoryPoint,
  readHistory,
} from "../lib/site/coverage-history.ts";

const ROOT = resolve(import.meta.dirname, "..");

/** Paths whose contents can change a coverage number. Docs and tooling cannot. */
const TRACKED = ["spec", "vendor", "fixtures", "captures.json"];

function git(args: string[], cwd = ROOT): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

/** Commits that touched measurable input, oldest first. */
function commits(): { sha: string; date: string; subject: string }[] {
  const log = git([
    "log",
    "--first-parent",
    "--reverse",
    "--format=%H\t%aI\t%s",
    "--",
    ...TRACKED,
  ]);
  return log
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha, date, ...rest] = line.split("\t");
      return {
        sha: sha as string,
        date: date as string,
        subject: rest.join("\t"),
      };
    });
}

/**
 * captures.json is the fixture manifest computeCoverage reads, and it did not
 * exist until partway through the project. Without it every probe corpus is
 * invisible and every bundled path looks uncaptured, which would draw a cliff
 * into the chart where a file was added rather than where coverage moved. So
 * for older trees the manifest is reconstructed from what a probe corpus
 * actually looks like on disk: an object of `{path: {status}}` entries. Frame
 * logs (arrays, or objects of runs) fail that test, which is the same reason
 * tools/redact.ts keeps them out of the real manifest.
 */
function ensureManifest(tree: string): void {
  if (existsSync(join(tree, "captures.json"))) return;
  const fixtures = join(tree, "fixtures");
  if (!existsSync(fixtures)) return;

  const entries: { label: string; to: string }[] = [];
  for (const name of git(["ls-files", "fixtures"], tree).split("\n")) {
    if (!name.endsWith(".json")) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(join(tree, name), "utf8"));
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      continue;
    const values = Object.values(parsed as Record<string, unknown>);
    const isProbeSet =
      values.length > 0 &&
      values.every(
        (value) =>
          !!value &&
          typeof value === "object" &&
          typeof (value as { status?: unknown }).status === "string",
      );
    if (isProbeSet)
      entries.push({
        label: name.replace(/^fixtures\/|\.json$/g, ""),
        to: name,
      });
  }
  writeFileSync(join(tree, "captures.json"), JSON.stringify(entries));
}

function measure(sha: string): HistoryPoint["metrics"] | null {
  const tree = mkdtempSync(join(tmpdir(), "leap-coverage-"));
  try {
    git(["worktree", "add", "-q", "--detach", tree, sha]);
    // The only runtime dependency is `yaml`; sharing the installed tree keeps
    // this from running 127 installs.
    execFileSync("ln", [
      "-s",
      join(ROOT, "node_modules"),
      join(tree, "node_modules"),
    ]);
    ensureManifest(tree);
    execFileSync("npx", ["tsx", "tools/bundle.ts"], {
      cwd: tree,
      stdio: "ignore",
    });
    const out = execFileSync(
      "npx",
      ["tsx", join(ROOT, "tools/coverage-snapshot.ts")],
      { cwd: tree, encoding: "utf8" },
    );
    return JSON.parse(out) as HistoryPoint["metrics"];
  } catch {
    return null;
  } finally {
    rmSync(tree, { recursive: true, force: true });
    git(["worktree", "prune"]);
  }
}

const history = readHistory();
const known = new Set(history.map((point) => point.sha));
const pending = commits().filter((commit) => !known.has(commit.sha));

console.log(`${history.length} measured, ${pending.length} to go`);

let skipped = 0;
for (const [index, commit] of pending.entries()) {
  const metrics = measure(commit.sha);
  if (metrics) {
    history.push({ ...commit, metrics });
  } else {
    skipped += 1;
    console.log(`  skipped ${commit.sha.slice(0, 8)} -- does not bundle`);
  }
  if ((index + 1) % 10 === 0 || index === pending.length - 1) {
    console.log(`  ${index + 1}/${pending.length}`);
    // Written as we go: a 127-commit backfill should survive being interrupted.
    history.sort((a, b) => a.date.localeCompare(b.date));
    writeFileSync(HISTORY_FILE, `${JSON.stringify(history, null, 2)}\n`);
  }
}

history.sort((a, b) => a.date.localeCompare(b.date));
writeFileSync(HISTORY_FILE, `${JSON.stringify(history, null, 2)}\n`);
console.log(
  `${history.length} points written to ${HISTORY_FILE}${skipped > 0 ? `, ${skipped} skipped` : ""}`,
);
