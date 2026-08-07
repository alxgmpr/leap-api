import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { redactTree } from "../lib/redact.ts";

const SRC = "/Users/alex/lutron-protocols/data";

// Capture files are named `leap-explore-<device-ip>-<date>.json`. We locate
// them by pattern rather than hard-coding the repository owner's real
// device IPs in this committed source file.
const CAPTURE_FILE_PATTERN = /^leap-explore-.+-2026-03-06\.json$/;

type ProbeSet = Record<string, { status: string; body?: unknown }>;

function readProbeSet(file: string): ProbeSet {
  return JSON.parse(readFileSync(`${SRC}/${file}`, "utf8")) as ProbeSet;
}

/**
 * Distinguish the RA3 processor capture from the Caseta bridge capture by
 * the LEAP server's ProtocolVersion at `/server`, not by IP: the RA3
 * processor's server reports a "03." series version, the Caseta bridge
 * reports a "01." series version. Returns the two-character series prefix,
 * or undefined if the shape doesn't match what we expect.
 */
function protocolSeries(probes: ProbeSet): string | undefined {
  const body = probes["/server"]?.body as
    | { Servers?: { ProtocolVersion?: unknown }[] }
    | undefined;
  const version = body?.Servers?.[0]?.ProtocolVersion;
  return typeof version === "string" ? version.slice(0, 2) : undefined;
}

const OUTPUT_BY_SERIES: Record<string, string> = {
  "03": "fixtures/ra3.json",
  "01": "fixtures/caseta.json",
};

// Error messages must never echo the real device IP embedded in a capture
// filename, so any dotted-quad segment is masked before printing.
function maskFilename(name: string): string {
  return name.replace(/\d{1,3}(\.\d{1,3}){3}/, "<ip>");
}

const files = readdirSync(SRC).filter((f) => CAPTURE_FILE_PATTERN.test(f));

const classified: { file: string; probes: ProbeSet; to: string }[] = [];
const unclassified: string[] = [];

for (const file of files) {
  const probes = readProbeSet(file);
  const series = protocolSeries(probes);
  const to = series ? OUTPUT_BY_SERIES[series] : undefined;
  if (to) {
    classified.push({ file, probes, to });
  } else {
    unclassified.push(file);
  }
}

const distinctOutputs = new Set(classified.map((c) => c.to));

if (
  files.length !== 2 ||
  classified.length !== 2 ||
  distinctOutputs.size !== 2
) {
  const lines = [
    `redact: expected exactly 2 capture files matching ${CAPTURE_FILE_PATTERN} in ${SRC},`,
    'one classifiable as the RA3 processor (/server ProtocolVersion starting "03.")',
    'and one as the Caseta bridge (/server ProtocolVersion starting "01.").',
    `Found ${files.length} matching file(s): ${files.length > 0 ? files.map(maskFilename).join(", ") : "(none)"}.`,
    `Classified: ${classified.length}/${files.length}` +
      (unclassified.length > 0
        ? `; could not classify: ${unclassified.map(maskFilename).join(", ")}`
        : "."),
  ];
  throw new Error(lines.join(" "));
}

mkdirSync("fixtures", { recursive: true });

for (const { probes, to } of classified) {
  const redacted = redactTree(probes);
  writeFileSync(to, `${JSON.stringify(redacted, null, 2)}\n`, "utf8");
  console.log(`${to}: ${Object.keys(redacted as object).length} paths`);
}
