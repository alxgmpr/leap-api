import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { describe } from "node:test";
import { parse, stringify } from "yaml";
import { declaredProperties, findFieldGaps } from "../lib/observed-fields.ts";

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
