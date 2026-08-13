import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { describe } from "node:test";
import { parse, stringify } from "yaml";
import {
  collectInstances,
  declaredProperties,
  declaredRequired,
  findFieldGaps,
  findRequiredIssues,
} from "../lib/observed-fields.ts";

describe("declared properties", () => {
  const schemas = (
    parse(readFileSync("dist/openapi.yaml", "utf8")) as {
      components: { schemas: Record<string, Record<string, unknown>> };
    }
  ).components.schemas;

  test("includes properties composed in through allOf", () => {
    // Device flattens two anonymous Go embeds via allOf. Reading `properties`
    // alone reports all eight inherited fields as undeclared -- the exact
    // false positive this function exists to prevent.
    const declared = declaredProperties(schemas, "Device");
    for (const inherited of [
      "href",
      "Name",
      "DeviceType",
      "SerialNumber",
      "AssociatedArea",
      "NetworkInterfaces",
    ])
      assert.ok(
        inherited in declared,
        `${inherited} comes from an allOf branch and must count as declared`,
      );
  });

  test("still includes the schema's own properties", () => {
    const declared = declaredProperties(schemas, "Device");
    assert.ok("ModelNumber" in declared);
    assert.ok("ProductId" in declared);
  });

  test("an unknown schema yields nothing rather than throwing", () => {
    assert.deepEqual(declaredProperties(schemas, "NoSuchSchema"), {});
    assert.deepEqual(declaredProperties(schemas, null), {});
  });

  test("terminates on a self-referential composition", () => {
    const cyclic = {
      A: { allOf: [{ $ref: "#/components/schemas/B" }] },
      B: { allOf: [{ $ref: "#/components/schemas/A" }], properties: { x: {} } },
    };
    assert.ok("x" in declaredProperties(cyclic, "A"));
  });
});

describe("observed fields", () => {
  test("every field the hardware sent is declared somewhere", () => {
    // The conformance suite validates bodies against the schemas, and JSON
    // Schema permits undeclared properties -- so a schema missing a field the
    // wire carries passes every other test in this repository. This is the
    // check in the other direction. Device.ProductId was found this way.
    const gaps = findFieldGaps();
    assert.deepEqual(
      gaps.map((g) => `${g.schema}.${g.field} [${g.corpora.join(", ")}]`),
      [],
      "add the field with its evidence, or record why it is deliberately absent",
    );
  });

  test("finds a gap when one exists, so zero means something", () => {
    // A clean result is only worth having if the machinery can fail. This
    // builds a bundle and a corpus where one field is knowingly undeclared
    // and asserts it is reported, with its corpus and instance count.
    const dir = mkdtempSync(join(tmpdir(), "leap-fields-"));
    const bundle = join(dir, "bundle.yaml");
    const probes = join(dir, "probes.json");
    const manifest = join(dir, "captures.json");

    writeFileSync(
      bundle,
      stringify({
        paths: {
          "/thing": {
            get: {
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/Things" },
                    },
                  },
                },
              },
            },
          },
        },
        components: {
          schemas: {
            Things: {
              type: "array",
              items: { $ref: "#/components/schemas/Thing" },
            },
            Base: { type: "object", properties: { href: { type: "string" } } },
            Thing: {
              type: "object",
              allOf: [{ $ref: "#/components/schemas/Base" }],
              properties: { Name: { type: "string" } },
            },
          },
        },
      }),
    );
    writeFileSync(
      probes,
      JSON.stringify({
        "/thing": {
          status: "200 OK",
          body: {
            Things: [
              { href: "/thing/1", Name: "a", Surprise: 1 },
              { href: "/thing/2", Name: "b", Surprise: 2 },
            ],
          },
        },
      }),
    );
    writeFileSync(
      manifest,
      JSON.stringify([{ label: "synthetic", to: probes }]),
    );

    const gaps = findFieldGaps({ bundle, manifest });
    rmSync(dir, { recursive: true, force: true });

    assert.equal(gaps.length, 1, "the inherited href must not be reported");
    assert.equal(gaps[0]?.schema, "Thing");
    assert.equal(gaps[0]?.field, "Surprise");
    assert.equal(gaps[0]?.instances, 2);
    assert.deepEqual(gaps[0]?.corpora, ["synthetic"]);
  });
});

describe("declared required", () => {
  const schemas = (
    parse(readFileSync("dist/openapi.yaml", "utf8")) as {
      components: { schemas: Record<string, Record<string, unknown>> };
    }
  ).components.schemas;

  test("includes requirements composed in through allOf", () => {
    // Six schemas inherit their required list this way. Reading `required`
    // alone would call these claims absent and silently stop checking them.
    const required = declaredRequired(schemas, "Device");
    const own = new Set(
      Array.isArray(schemas.Device?.required)
        ? (schemas.Device.required as string[])
        : [],
    );
    const base = new Set(
      Array.isArray(schemas.DeviceBase?.required)
        ? (schemas.DeviceBase.required as string[])
        : [],
    );
    assert.ok(base.size > 0, "DeviceBase declares requirements to inherit");
    for (const field of base)
      assert.ok(required.has(field), `${field} is required via DeviceBase`);
    for (const field of own) assert.ok(required.has(field));
  });

  test("does not fold in anyOf or oneOf branches", () => {
    // A branch of an alternation requires its fields only when that branch
    // matched, so folding them in manufactures requirements the document
    // never states.
    const alternation = {
      A: {
        anyOf: [{ $ref: "#/components/schemas/B" }],
        oneOf: [{ $ref: "#/components/schemas/C" }],
        required: ["own"],
      },
      B: { required: ["fromAnyOf"] },
      C: { required: ["fromOneOf"] },
    };
    assert.deepEqual([...declaredRequired(alternation, "A")], ["own"]);
  });
});

describe("required issues", () => {
  test("no required field is missing from an observed instance", () => {
    // Ajv already fails such a body, so this should always be empty; it is
    // here as an independent check that does not depend on every schema
    // actually being reached by the conformance suite.
    const falseClaims = findRequiredIssues().filter(
      (i) => i.kind === "false-claim",
    );
    assert.deepEqual(
      falseClaims.map(
        (i) => `${i.schema}.${i.field} ${i.present}/${i.observed}`,
      ),
      [],
    );
  });

  test("catches a required field the wire does not always send", () => {
    const dir = mkdtempSync(join(tmpdir(), "leap-required-"));
    const bundle = join(dir, "bundle.yaml");
    const probes = join(dir, "probes.json");
    const manifest = join(dir, "captures.json");

    writeFileSync(
      bundle,
      stringify({
        paths: {
          "/thing": {
            get: {
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/Things" },
                    },
                  },
                },
              },
            },
          },
        },
        components: {
          schemas: {
            Things: {
              type: "array",
              items: { $ref: "#/components/schemas/Thing" },
            },
            Base: {
              type: "object",
              properties: { href: { type: "string" } },
              required: ["href"],
            },
            Thing: {
              type: "object",
              allOf: [{ $ref: "#/components/schemas/Base" }],
              properties: {
                Name: { type: "string" },
                Rare: { type: "string" },
              },
              required: ["Name"],
            },
          },
        },
      }),
    );
    writeFileSync(
      probes,
      JSON.stringify({
        "/thing": {
          status: "200 OK",
          body: {
            Things: [
              { href: "/thing/1", Name: "a", Rare: "x" },
              { href: "/thing/2" },
            ],
          },
        },
      }),
    );
    writeFileSync(
      manifest,
      JSON.stringify([{ label: "synthetic", to: probes }]),
    );

    const issues = findRequiredIssues({
      bundle,
      manifest,
      candidateThreshold: 2,
    });
    rmSync(dir, { recursive: true, force: true });

    const claims = issues.filter((i) => i.kind === "false-claim");
    assert.equal(
      claims.length,
      1,
      "Name is required and missing from one of two",
    );
    assert.equal(claims[0]?.schema, "Thing");
    assert.equal(claims[0]?.field, "Name");
    assert.equal(claims[0]?.present, 1);
    assert.equal(claims[0]?.observed, 2);

    // href is inherited-required and present in both instances of Thing, so
    // it is neither a false claim nor a candidate for promotion there.
    assert.ok(!issues.some((i) => i.schema === "Thing" && i.field === "href"));
    // Rare is present in only one of two, so it is not universal.
    assert.ok(!issues.some((i) => i.field === "Rare"));

    // Base is required-bearing but never observed as its own schema -- no
    // response returns a bare Base -- so its claim is untested, not false.
    const untested = issues.filter((i) => i.kind === "untested");
    assert.deepEqual(
      untested.map((i) => `${i.schema}.${i.field}`),
      ["Base.href"],
    );
  });

  test("does not nominate a candidate on thin evidence", () => {
    // A field present in every one of three observations is not evidence of
    // universality. The threshold keeps small samples out.
    const thin = findRequiredIssues({ candidateThreshold: 10_000 }).filter(
      (i) => i.kind === "candidate",
    );
    assert.deepEqual(thin, []);
  });
});

describe("collection alternations", () => {
  test("walks a collection declared as oneOf(array, empty object)", () => {
    // Buttons is `oneOf` an array of Button or an empty object, because RA3's
    // read of /button returns a bare {}. Matching only `type: array` walked
    // each of Caseta's 40 buttons *as* a Buttons, found no properties, and
    // skipped all 40 -- so both checks under-reported on every such body.
    const dir = mkdtempSync(join(tmpdir(), "leap-oneof-"));
    const bundle = join(dir, "bundle.yaml");
    const probes = join(dir, "probes.json");
    const manifest = join(dir, "captures.json");

    writeFileSync(
      bundle,
      stringify({
        paths: {
          "/thing": {
            get: {
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/Things" },
                    },
                  },
                },
              },
            },
          },
        },
        components: {
          schemas: {
            Things: {
              oneOf: [
                {
                  type: "array",
                  items: { $ref: "#/components/schemas/Thing" },
                },
                { type: "object", additionalProperties: false },
              ],
            },
            Thing: { type: "object", properties: { Name: { type: "string" } } },
          },
        },
      }),
    );
    writeFileSync(
      probes,
      JSON.stringify({
        "/thing": {
          status: "200 OK",
          body: { Things: [{ Name: "a", Sneaky: 1 }] },
        },
      }),
    );
    writeFileSync(
      manifest,
      JSON.stringify([{ label: "synthetic", to: probes }]),
    );

    const gaps = findFieldGaps({ bundle, manifest });
    rmSync(dir, { recursive: true, force: true });

    assert.equal(gaps.length, 1, "the array branch must be traversed");
    assert.equal(gaps[0]?.schema, "Thing");
    assert.equal(gaps[0]?.field, "Sneaky");
  });

  test("sees the href-only ProgrammingModel embeds the schema documents", () => {
    // ProgrammingModel.yaml relaxed ProgrammingModelType because Buttons
    // embed a bare {href} reference that never carries it. Those embeds sit
    // behind the oneOf collection above; while they were skipped, this tool
    // nominated ProgrammingModelType for promotion and contradicted the
    // schema's own reasoning.
    const { instances } = collectInstances();
    const models = instances.get("ProgrammingModel") ?? [];
    const hrefOnly = models.filter(
      (i) => i.value.ProgrammingModelType === undefined,
    );
    assert.ok(hrefOnly.length > 0, "the falsifying context must be visible");
    assert.ok(
      !findRequiredIssues().some(
        (i) =>
          i.kind === "candidate" &&
          i.schema === "ProgrammingModel" &&
          i.field === "ProgrammingModelType",
      ),
    );
  });
});

describe("traversal depth", () => {
  test("the default depth is past the point the walk saturates", () => {
    // The bound exists to stop a cyclic body, not to sample. If a future
    // corpus nests deeper than the default, this fails rather than quietly
    // checking less than it reports.
    const count = (maxDepth?: number) => {
      const { instances } = collectInstances({ maxDepth });
      let total = 0;
      for (const seen of instances.values()) total += seen.length;
      return total;
    };
    const atDefault = count();
    assert.equal(atDefault, count(16), "deeper traversal must find no more");
    assert.ok(
      atDefault > count(3),
      "a depth of 3 was the old cap and dropped instances; if this no longer " +
        "holds the corpora changed shape and the default deserves re-checking",
    );
  });
});
