import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { redactTree } from "../lib/redact.ts";

const SRC = "/Users/alex/lutron-protocols/data";

const INPUTS: [string, string][] = [
  [`${SRC}/leap-explore-192.0.2.133-2026-03-06.json`, "fixtures/ra3.json"],
  [`${SRC}/leap-explore-192.0.2.9-2026-03-06.json`, "fixtures/caseta.json"],
];

mkdirSync("fixtures", { recursive: true });

for (const [from, to] of INPUTS) {
  const parsed = JSON.parse(readFileSync(from, "utf8"));
  const redacted = redactTree(parsed);
  writeFileSync(to, `${JSON.stringify(redacted, null, 2)}\n`, "utf8");
  console.log(`${to}: ${Object.keys(redacted as object).length} paths`);
}
