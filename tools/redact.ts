import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { redactTree } from "../lib/redact.ts";

type ProbeSet = Record<string, { status: string; body?: unknown }>;

// A manifest entry names a stable, non-identifying label and the fixture
// it should produce. It never names a source file directly — capture
// filenames embed real device IPs (e.g. `leap-explore-<ip>-<date>.json`),
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

// Task 8's probe sweep against a single, previously-unseen processor --
// its address is deliberately never written here or anywhere else in this
// public repo, in code, comments, or log output; see maskFilename below,
// used the same way SOURCE_DIRS's own file names are masked. Its capture
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

// The coverage-blind spec probe: a later, much broader read-only pass over
// the same single processor the sweep above reached, filed in its own
// capture directory with a `<ip>-spec-read.json` filename shape. Its address
// is deliberately never written here or anywhere else in this public repo,
// in code, comments, or log output -- see maskFilename, applied to every
// filename this tool prints.
//
// This capture DOES contain `/server`, unlike the sweep, so classify() runs
// on it -- and that is exactly why it must not be used. The processor
// reports an "03." series ProtocolVersion, which LABEL_BY_SERIES maps to
// "ra3", a label the original campaign's capture already owns; content
// classification would resolve two capture files to one manifest label and
// abort the whole run. Labeling is therefore by filename SUFFIX (the capture
// phase), the same approach SWEEP_DIR documents, and sufficient for the same
// reason: every file in this directory came from the same single host.
const SPEC_PROBE_DIR = "/Users/alex/lutron-protocols/data/spec-probe";
const SPEC_PROBE_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}-(spec-read)\.json$/;

// Push-behaviour probe: a single-connection experiment (subscribe, change a
// level, hold, restore) against the same processor, filed in the general
// captures directory. Like the subscribe and late-frames logs it is an
// ordered-frame record, not a `{path: {status, body}}` probe set, so it gets
// the same treatment they do at the bottom of this file: redacted through
// redactTree and written directly, and deliberately never given an entry in
// captures.json.
//
// The pattern pins the run's timestamp the same way SOURCE_DIRS pins its
// campaign date: the directory holds several runs of this experiment and
// only this one is the committed evidence. A run timestamp identifies a
// capture, not a device; the IP in the filename is the identifying part, and
// it is masked in every message this tool prints.
const PUSH_PROBE_DIR = "/Users/alex/lutron-protocols/data/captures";
const PUSH_PROBE_PATTERN =
  /^leap-push-probe-\d{1,3}(?:\.\d{1,3}){3}-2026-08-10T03-05-52-625Z\.json$/;
const PUSH_PROBE_FIXTURE = "fixtures/push-probe.json";

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

// Spec-probe captures: labeled by filename phase suffix for the reason the
// SPEC_PROBE_DIR comment above spells out (classify() would collide with the
// "ra3" label), not because `/server` is missing from them.
for (const file of readdirSync(SPEC_PROBE_DIR).sort()) {
  const match = SPEC_PROBE_PATTERN.exec(file);
  if (!match) continue;
  const label = match[1] as string;
  const probes = readProbeSet(SPEC_PROBE_DIR, file);
  const bucket = byLabel.get(label) ?? [];
  bucket.push({ dir: SPEC_PROBE_DIR, file, probes });
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

// Push-behaviour probe (see PUSH_PROBE_PATTERN above): same discipline as
// the frame logs immediately above -- redacted through the same redactTree,
// written directly, never added to captures.json, and required to resolve to
// exactly one source file or fail loudly rather than emit ambiguous
// evidence. Its frames live under a `frames` key rather than at the top
// level, so the count is read from there.
const pushProbeFiles = readdirSync(PUSH_PROBE_DIR)
  .filter((f) => PUSH_PROBE_PATTERN.test(f))
  .sort();

if (pushProbeFiles.length !== 1) {
  const found = pushProbeFiles.map(maskFilename).join(", ");
  throw new Error(
    `redact: push-probe capture (-> ${PUSH_PROBE_FIXTURE}) resolved to ` +
      `${pushProbeFiles.length} file(s)${found ? ` (${found})` : ""}; ` +
      "expected exactly 1. Refusing to emit ambiguous evidence.",
  );
}

for (const file of pushProbeFiles) {
  const log = JSON.parse(readFileSync(`${PUSH_PROBE_DIR}/${file}`, "utf8"));
  const redacted = redactTree(log) as { frames?: unknown[] };
  writeFileSync(
    PUSH_PROBE_FIXTURE,
    `${JSON.stringify(redacted, null, 2)}\n`,
    "utf8",
  );
  console.log(
    `${PUSH_PROBE_FIXTURE}: ${redacted.frames?.length ?? "?"} frames`,
  );
}
