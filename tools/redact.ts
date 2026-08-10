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
