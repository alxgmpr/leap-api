import { findFieldGaps, findRequiredIssues } from "../lib/observed-fields.ts";

// Only report when invoked directly, so importing this module in tests is inert.
if (process.argv[1]?.endsWith("check-observed-fields.ts")) {
  const gaps = findFieldGaps();
  console.log(`fields observed but not declared: ${gaps.length}`);
  for (const gap of gaps)
    console.log(
      `  ${gap.schema}.${gap.field}  ${gap.instances} instance(s)  [${gap.corpora.join(", ")}]`,
    );

  const issues = findRequiredIssues();
  const of = (kind: string) => issues.filter((i) => i.kind === kind);

  const falseClaims = of("false-claim");
  console.log(
    `\nrequired but absent from an observed instance: ${falseClaims.length}`,
  );
  for (const issue of falseClaims)
    console.log(
      `  ${issue.schema}.${issue.field}  present in ${issue.present}/${issue.observed}  [${issue.corpora.join(", ")}]`,
    );

  const untested = of("untested");
  console.log(
    `\nrequired on a schema no capture ever exercised: ${untested.length} field(s) across ${new Set(untested.map((i) => i.schema)).size} schema(s)`,
  );

  // Not defects. This project relaxes `required` on evidence and does not
  // tighten it on the absence of counter-evidence, so these are for judgement.
  const candidates = of("candidate");
  console.log(
    `\npresent in every observation but not required: ${candidates.length}`,
  );
  for (const issue of candidates)
    console.log(
      `  ${issue.schema}.${issue.field}  ${issue.present}/${issue.observed}  [${issue.corpora.join(", ")}]`,
    );

  if (gaps.length > 0 || falseClaims.length > 0) process.exit(1);
}
