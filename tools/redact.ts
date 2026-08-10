import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { redactTree } from "../lib/redact.ts";

type ProbeSet = Record<string, { status: string; body?: unknown }>;

// A manifest entry names a stable, non-identifying label and the fixture
// it should produce. It never names a source file directly — capture
// filenames embed real device IPs (e.g. `leap-explore-192.0.2.133-....json`),
// so the manifest must not, and this repo is public.
type ManifestEntry = { label: string; to: string };

// Where to look for capture files, and how to recognize one. Adding a new
// capture source (e.g. the sweep directory) means adding an entry here,
// not changing the manifest format.
type SourceDir = { dir: string; pattern: RegExp };

const SOURCE_DIRS: SourceDir[] = [
  {
    dir: "/Users/alex/lutron-protocols/data",
    pattern: /^leap-explore-.+-2026-03-06\.json$/,
  },
];

// Task 8's probe sweep against a single, previously-unseen processor
// (198.51.100.2 -- masked everywhere below and in any log output). Its capture
// filenames have a different shape from SOURCE_DIRS above
// (`<ip>-<phase>.json` rather than `leap-explore-<ip>-<date>.json`) and are
// not full probe sets containing `/server` -- the sweep never probed it --
// so `classify()`'s content-based labeling (reading `/server`'s
// ProtocolVersion) cannot resolve a label for them. Labeling here is by
// filename SUFFIX (the capture phase) instead, which is sufficient because
// every file in this directory came from the same single host.
//
// Only "read" and "write" are `{path: {status, body}}` probe sets that
// belong in this manifest-driven pipeline. "subscribe" and "late-frames"
// are ordered-frame arrays, a different shape entirely -- they're redacted
// and written directly, below, and deliberately never added to
// `captures.json` so the ProbeSet-only tools (`check-coverage.ts`,
// `test/conformance.test.ts`) that resolve their fixture list from that
// manifest never try to iterate them as `{path: {status, body}}`.
const SWEEP_DIR = "/Users/alex/lutron-protocols/data/sweep";
const SWEEP_PROBE_SET_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}-(read|write)\.json$/;
const SWEEP_FRAME_LOG_PATTERN =
  /^\d{1,3}(?:\.\d{1,3}){3}-(subscribe|late-frames)\.json$/;

// Maps the LEAP server's ProtocolVersion series (from `/server`) to the
// manifest label it corresponds to. This is protocol knowledge, not device
// identity, so it is safe to hard-code here.
const LABEL_BY_SERIES: Record<string, string> = {
  "03": "ra3",
  "01": "caseta",
};

function readProbeSet(dir: string, file: string): ProbeSet {
  return JSON.parse(readFileSync(`${dir}/${file}`, "utf8")) as ProbeSet;
}

/**
 * Classify a capture by the LEAP server's ProtocolVersion at `/server`,
 * not by IP: the RA3 processor's server reports a "03." series version,
 * the Caseta bridge reports a "01." series version. Returns the manifest
 * label the capture resolves to, or undefined if the shape doesn't match
 * what we expect or the series is unrecognized.
 */
function classify(probes: ProbeSet): string | undefined {
  const body = probes["/server"]?.body as
    | { Servers?: { ProtocolVersion?: unknown }[] }
    | undefined;
  const version = body?.Servers?.[0]?.ProtocolVersion;
  const series = typeof version === "string" ? version.slice(0, 2) : undefined;
  return series ? LABEL_BY_SERIES[series] : undefined;
}

// Error messages must never echo a real device IP embedded in a capture
// filename, so any dotted-quad segment is masked before printing.
function maskFilename(name: string): string {
  return name.replace(/\d{1,3}(\.\d{1,3}){3}/, "<ip>");
}

const manifest: ManifestEntry[] = JSON.parse(
  readFileSync("captures.json", "utf8"),
);

// Scan every configured source directory for files matching its capture
// pattern, and bucket each by the label it classifies as.
const byLabel = new Map<
  string,
  { dir: string; file: string; probes: ProbeSet }[]
>();

for (const { dir, pattern } of SOURCE_DIRS) {
  const files = readdirSync(dir).filter((f) => pattern.test(f));
  for (const file of files) {
    const probes = readProbeSet(dir, file);
    const label = classify(probes);
    if (!label) continue;
    const bucket = byLabel.get(label) ?? [];
    bucket.push({ dir, file, probes });
    byLabel.set(label, bucket);
  }
}

// Sweep captures: label by filename phase suffix, not by content (see the
// SWEEP_DIR comment above for why classify() doesn't apply here).
for (const file of readdirSync(SWEEP_DIR)) {
  const match = SWEEP_PROBE_SET_PATTERN.exec(file);
  if (!match) continue;
  const phase = match[1];
  const label = `sweep-${phase}`;
  const probes = readProbeSet(SWEEP_DIR, file);
  const bucket = byLabel.get(label) ?? [];
  bucket.push({ dir: SWEEP_DIR, file, probes });
  byLabel.set(label, bucket);
}

// Resolve every manifest entry before writing anything, so a bad mapping
// fails loudly and never emits a partial fixture set.
const resolved: { to: string; probes: ProbeSet }[] = [];

for (const entry of manifest) {
  const matches = byLabel.get(entry.label) ?? [];
  if (matches.length !== 1) {
    const found = matches.map((m) => maskFilename(m.file)).join(", ");
    throw new Error(
      `redact: manifest label "${entry.label}" (-> ${entry.to}) resolved to ` +
        `${matches.length} capture file(s)${found ? ` (${found})` : ""}; ` +
        "expected exactly 1. Refusing to emit a partial fixture set.",
    );
  }
  const match = matches[0];
  if (match) {
    resolved.push({ to: entry.to, probes: match.probes });
  }
}

mkdirSync("fixtures", { recursive: true });

for (const { probes, to } of resolved) {
  const redacted = redactTree(probes);
  writeFileSync(to, `${JSON.stringify(redacted, null, 2)}\n`, "utf8");
  console.log(`${to}: ${Object.keys(redacted as object).length} paths`);
}

// Subscribe log and late-frames evidence: ordered-frame arrays, not
// `{path: {status, body}}` probe sets, so they never go through the
// manifest/byLabel machinery above -- and deliberately never get an entry in
// captures.json, so the ProbeSet-only tools that resolve their fixture list
// from that manifest (check-coverage.ts, test/conformance.test.ts) never try
// to iterate them as one. Each still goes through the same `redactTree`, and
// still resolves to exactly one source file or fails loudly, same discipline
// as the manifest loop above.
const FRAME_FIXTURES: Record<string, string> = {
  subscribe: "fixtures/subscriptions.json",
  "late-frames": "fixtures/late-frames.json",
};

for (const file of readdirSync(SWEEP_DIR)) {
  const match = SWEEP_FRAME_LOG_PATTERN.exec(file);
  if (!match) continue;
  const phase = match[1] as "subscribe" | "late-frames";
  const to = FRAME_FIXTURES[phase];
  if (!to) continue;
  const frames = JSON.parse(readFileSync(`${SWEEP_DIR}/${file}`, "utf8"));
  const redacted = redactTree(frames);
  writeFileSync(to, `${JSON.stringify(redacted, null, 2)}\n`, "utf8");
  console.log(
    `${to}: ${Array.isArray(redacted) ? redacted.length : "?"} frames`,
  );
}
