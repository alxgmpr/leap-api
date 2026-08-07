import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { describe } from "node:test";
import { Ajv } from "ajv";
import addFormats from "ajv-formats";
import { parse } from "yaml";
import { templatePath } from "../lib/platform-matrix.ts";

type Probe = Record<string, { status: string; body?: Record<string, unknown> }>;

const doc = parse(readFileSync("dist/openapi.yaml", "utf8")) as {
  paths: Record<
    string,
    Record<string, { responses?: Record<string, unknown> }>
  >;
  components: { schemas: Record<string, unknown> };
};

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);

/** The 200-response schema ref for a path, if the spec declares one. */
function schemaRefFor(path: string): string | undefined {
  const get = doc.paths[path]?.get;
  const ok = get?.responses?.["200"] as
    | { content?: { "application/json"?: { schema?: { $ref?: string } } } }
    | undefined;
  return ok?.content?.["application/json"]?.schema?.$ref;
}

function resolve(ref: string): object | undefined {
  const name = ref.replace("#/components/schemas/", "");
  return doc.components.schemas[name] as object | undefined;
}

for (const platform of ["ra3", "caseta"] as const) {
  describe(`conformance: ${platform}`, () => {
    const probe: Probe = JSON.parse(
      readFileSync(`fixtures/${platform}.json`, "utf8"),
    );

    const cases = Object.entries(probe).filter(
      ([, v]) => v.status.startsWith("200") && v.body,
    );

    test("fixture corpus is non-empty", () => {
      assert.ok(cases.length > 100, `only ${cases.length} usable fixtures`);
    });

    for (const [concrete, result] of cases) {
      const path = templatePath(concrete);
      const ref = schemaRefFor(path);
      // Paths not yet written are a coverage gap, reported by check-coverage.
      if (!ref) continue;

      const schema = resolve(ref);
      if (!schema) continue;

      test(`${platform} ${concrete} matches ${ref}`, () => {
        // The probe body wraps the payload in its MessageBodyType key.
        // A body with zero keys (a literal `{}`, e.g. RA3's /button when it
        // has nothing to report) has no key to unwrap -- validate the raw
        // `{}` itself rather than `body[undefined]`, which would silently
        // become `undefined` and never reach the schema as the empty
        // object it actually is.
        const bodyKey = Object.keys(result.body ?? {})[0];
        const payload =
          bodyKey === undefined ? result.body : result.body?.[bodyKey];
        const validate = ajv.compile({
          ...schema,
          components: doc.components,
        } as object);
        const valid = validate(payload);
        assert.ok(
          valid,
          `${concrete}: ${ajv.errorsText(validate.errors, { separator: "\n  " })}`,
        );
      });
    }
  });
}
