import { findFieldGaps } from "../lib/observed-fields.ts";

// Only report when invoked directly, so importing this module in tests is inert.
if (process.argv[1]?.endsWith("check-observed-fields.ts")) {
  const gaps = findFieldGaps();
  console.log(`fields observed but not declared: ${gaps.length}`);
  for (const gap of gaps)
    console.log(
      `  ${gap.schema}.${gap.field}  ${gap.instances} instance(s)  [${gap.corpora.join(", ")}]`,
    );
  if (gaps.length > 0) process.exit(1);
}
