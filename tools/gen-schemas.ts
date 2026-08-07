import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stringify } from "yaml";
import { parseGoStruct } from "../lib/go-struct-parser.ts";
import { structToSchema } from "../lib/go-to-schema.ts";

const OUT = "spec/components/schemas/_generated";
const LEAPOBJ = "leapobj.";

const types: Record<string, string> = JSON.parse(
  readFileSync("vendor/leap-types.json", "utf8"),
);
const defined = new Set(Object.keys(types));

// Fully rebuild the staging tree so removed types do not linger.
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const generated: string[] = [];
const todoEnums = new Set<string>();

for (const [name, src] of Object.entries(types)) {
  const struct = parseGoStruct(name, src);
  const schema = structToSchema(struct, defined);

  for (const field of struct.fields) {
    if (field.type.startsWith(LEAPOBJ)) {
      const referenced = field.type.slice(LEAPOBJ.length);
      if (!defined.has(referenced)) todoEnums.add(referenced);
    }
  }

  writeFileSync(join(OUT, `${name}.yaml`), stringify(schema), "utf8");
  generated.push(name);
}

writeFileSync(
  join(OUT, "_index.json"),
  `${JSON.stringify(
    { generated: generated.sort(), todoEnums: [...todoEnums].sort() },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(
  `generated ${generated.length} schemas, ${todoEnums.size} unrecovered enums`,
);
