import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { describe } from "node:test";
import { parse } from "yaml";

describe("bundled spec", () => {
  const doc = parse(readFileSync("dist/openapi.yaml", "utf8"));

  test("is OpenAPI 3.1.0", () => {
    assert.equal(doc.openapi, "3.1.0");
  });

  test("declares a non-http server scheme", () => {
    assert.match(doc.servers[0].url, /^leaps:\/\//);
  });

  test("every $ref resolves inside the document", () => {
    const refs: string[] = [];
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (node && typeof node === "object") {
        for (const [k, v] of Object.entries(node)) {
          if (k === "$ref" && typeof v === "string") refs.push(v);
          else walk(v);
        }
      }
    };
    walk(doc);
    for (const ref of refs) {
      const name = ref.replace("#/components/schemas/", "");
      assert.ok(doc.components.schemas[name], `unresolved $ref: ${ref}`);
    }
  });

  test("no _generated content leaked into the bundle", () => {
    assert.ok(
      !readFileSync("dist/openapi.yaml", "utf8").includes("_generated"),
    );
  });
});
