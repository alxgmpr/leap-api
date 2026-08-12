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

// The coverage-blind spec probe: a broad read-only replay of this
// specification's own path list, filed in its own capture directory with a
// `<ip>-spec-read.json` filename shape. Every address involved is
// deliberately never written here or anywhere else in this public repo, in
// code, comments, or log output -- see maskFilename, applied to every
// filename this tool prints.
//
// This directory now holds captures from TWO DIFFERENT HOSTS on two
// different platforms: the RA3 processor the Task 8 sweep reached, and a
// Caseta bridge probed later with the same coverage-blind prober. That
// breaks both single-signal labeling schemes used elsewhere in this file, in
// opposite directions:
//
//   - Filename suffix alone (what SWEEP_DIR uses, and what this directory
//     used while it held one host) now resolves BOTH files to "spec-read".
//     The suffix names the capture PHASE, and both hosts were probed in the
//     same phase; the assumption that made suffix-labeling sufficient there
//     -- every file in the directory came from one host -- no longer holds
//     here.
//   - classify() alone (what SOURCE_DIRS uses) resolves them to "ra3" and
//     "caseta", both of which the original campaign's captures already own.
//     Content classification would put two capture files under one manifest
//     label and abort the run -- the same collision the previous version of
//     this comment recorded for the RA3 file, which the Caseta file now
//     reproduces on the other label.
//
// Neither signal is sufficient alone; together they are. The label is
// `<phase>-<platform>`, phase from the filename suffix and platform from
// classify() reading `/server`'s ProtocolVersion series. Both captures
// contain `/server`, so classify() resolves for both, and a capture it
// cannot classify is a hard error rather than a silent skip -- an
// unclassifiable file here would otherwise vanish from the fixture set
// without failing anything.
//
// A THIRD signal became necessary when the directory gained a second Caseta
// capture: the same bridge probed again after a factory reset, with zero
// devices provisioned, on firmware 01.124. Phase and platform are identical
// to the provisioned 01.123 capture -- same prober, same phase, same
// ProtocolVersion series -- so `<phase>-<platform>` puts both files in the
// `spec-read-caseta` bucket, and the manifest loop below refuses a
// two-file bucket and aborts the whole run. That abort is the designed
// behaviour, not a bug to route around: two captures under one label means
// the fixture written is whichever the directory listing happened to yield.
//
// The distinguishing signal is a filename VARIANT token, written by hand
// when the capture is filed, and it is the only one available: nothing in
// the response bodies says "this bridge has no devices" in a way that is
// stable to classify on (an empty collection is a 204, and a provisioned
// bridge can also 204 a collection it happens not to use). So the pattern
// carries an optional `-bare-<firmware>` token between the address and the
// phase suffix, and the label becomes `<phase>-<platform>-<variant>`. A
// capture without the token keeps exactly the label it had before, so the
// two existing spec-probe fixtures are untouched.
const SPEC_PROBE_DIR = "/Users/alex/lutron-protocols/data/spec-probe";
const SPEC_PROBE_PATTERN =
  /^\d{1,3}(?:\.\d{1,3}){3}(?:-(bare)-\d+\.\d+)?-(spec-read)\.json$/;

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

// The 2026-08-11/12 push experiments: six more single-connection frame logs
// from the same directory, and the same shape of evidence as
// PUSH_PROBE_PATTERN's -- ordered-frame records, not `{path: {status, body}}`
// probe sets, so like it they are redacted and written directly and never
// given a captures.json entry.
//
// They are published as ONE fixture, an object keyed by run, rather than six
// files. The reason is that no single one of them establishes anything: the
// ClientTag verdict is legible only from the pad-0 and pad-7 runs read
// together (the tag moves iff the subscribe tag moved), the connect-time
// auto-subscribe is a platform divergence only when the Caseta runs are read
// against the RA3 one, and three of the six are 2-, 3- and 14-frame logs that
// would be six mostly-empty files. Redacting them in one call also shares the
// placeholder memo across runs, so a zone that appears in two runs carries the
// same `<name-N>` in both, which is what makes reading them together possible
// at all. Each run keeps its own harness shape under its own key; the keys are
// the stable names the docs cite.
//
// Each run is pinned by an exact filename, the way PUSH_PROBE_PATTERN pins
// its timestamp, and each must resolve to exactly one file. The directory
// holds sibling runs of every one of these experiments -- another pad-5
// Caseta push probe, two more connect-observes, an earlier device-join -- and
// a pattern loose enough to admit them would let a later run silently change
// what is published.
const PUSH_EXPERIMENTS_FIXTURE = "fixtures/push-experiments.json";
const PUSH_EXPERIMENT_PATTERNS: Record<string, RegExp> = {
  // RA3, pad 0: subscribes at lt-18/lt-19 and pushes on those.
  "ra3-push-pad-0":
    /^leap-push-probe-\d{1,3}(?:\.\d{1,3}){3}-2026-08-11T21-08-31-447Z\.json$/,
  // RA3, pad 7: seven filler reads shift the counter, the same two
  // subscriptions land on lt-25/lt-26, and every push moves with them.
  "ra3-push-pad-7":
    /^leap-push-probe-\d{1,3}(?:\.\d{1,3}){3}-2026-08-11T21-09-12-891Z\.json$/,
  // Caseta, pad 0: the platform's own push evidence, and the untagged
  // second push per state change.
  "caseta-push-pad-0":
    /^leap-push-probe-\d{1,3}(?:\.\d{1,3}){3}-2026-08-11T21-12-12-834Z\.json$/,
  // RA3, passive: a human pressing a physical keypad, no write issued.
  "ra3-keypad-press":
    /^leap-keypad-press-\d{1,3}(?:\.\d{1,3}){3}-20260812T195233Z\.json$/,
  // Caseta, passive: the device-join push carrying a DeviceHeard body.
  "caseta-device-join":
    /^leap-devicejoin-\d{1,3}(?:\.\d{1,3}){3}-20260812T013125Z\.json$/,
  // Caseta, passive: a 30s silent hold on a bare bridge, zero requests sent.
  "caseta-connect-observe":
    /^leap-connect-observe-\d{1,3}(?:\.\d{1,3}){3}-2026-08-11T22-25-36-889Z\.json$/,
};

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

// Spec-probe captures: labeled `<phase>-<platform>`, combining the filename
// phase suffix with classify()'s content-based platform, for the reason the
// SPEC_PROBE_DIR comment above spells out (this directory holds two hosts on
// two platforms, and neither signal alone separates them without colliding).
for (const file of readdirSync(SPEC_PROBE_DIR).sort()) {
  const match = SPEC_PROBE_PATTERN.exec(file);
  if (!match) continue;
  const variant = match[1];
  const phase = match[2] as string;
  const probes = readProbeSet(SPEC_PROBE_DIR, file);
  const platform = classify(probes);
  if (!platform) {
    throw new Error(
      `redact: spec-probe capture ${maskFilename(file)} could not be ` +
        "classified by its /server ProtocolVersion; refusing to skip it " +
        "silently. Add its series to LABEL_BY_SERIES.",
    );
  }
  const label = variant
    ? `${phase}-${platform}-${variant}`
    : `${phase}-${platform}`;
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

// The 2026-08-11/12 push experiments (see PUSH_EXPERIMENT_PATTERNS above).
// This block is LAST on purpose. `lib/redact.ts`'s placeholder counter is
// module-level and shared across every redactTree call in a run, so a block
// that allocates a new placeholder renumbers everything written after it.
// Appending here is what keeps the nine fixtures above byte-identical.
const pushExperiments: Record<string, unknown> = {};

for (const [run, pattern] of Object.entries(PUSH_EXPERIMENT_PATTERNS)) {
  const files = readdirSync(PUSH_PROBE_DIR)
    .filter((f) => pattern.test(f))
    .sort();
  if (files.length !== 1) {
    const found = files.map(maskFilename).join(", ");
    throw new Error(
      `redact: push-experiment run "${run}" (-> ${PUSH_EXPERIMENTS_FIXTURE}) ` +
        `resolved to ${files.length} file(s)${found ? ` (${found})` : ""}; ` +
        "expected exactly 1. Refusing to emit ambiguous evidence.",
    );
  }
  const file = files[0] as string;
  const log = JSON.parse(readFileSync(`${PUSH_PROBE_DIR}/${file}`, "utf8"));
  pushExperiments[run] = redactTree(log);
}

writeFileSync(
  PUSH_EXPERIMENTS_FIXTURE,
  `${JSON.stringify(pushExperiments, null, 2)}\n`,
  "utf8",
);
console.log(
  `${PUSH_EXPERIMENTS_FIXTURE}: ${Object.entries(pushExperiments)
    .map(
      ([run, log]) =>
        `${run} ${(log as { frames?: unknown[] }).frames?.length ?? "?"}f`,
    )
    .join(", ")}`,
);
