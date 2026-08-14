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

  test("injected platform data only appears under `get`, never other HTTP methods or path-item extensions", () => {
    // The probe sweeps that produced x-leap-platforms only ever sent
    // ReadRequest (GET). Injecting that data onto post/put/delete would
    // mislabel write operations with a status that was actually the
    // response to a GET on the same URL -- see docs/mapping.md's
    // x-leap-platforms bullet. The only correct invariant is "get only",
    // not merely "some HTTP method" (the previous version of this test
    // accepted injection under post/put/delete as long as it was under an
    // operation object, which is exactly the bug this test should catch).
    const otherHttpMethods = new Set([
      "post",
      "put",
      "delete",
      "patch",
      "head",
      "options",
      "trace",
    ]);

    for (const [path, item] of Object.entries(
      doc.paths as Record<string, Record<string, unknown>>,
    )) {
      // Path-item-level extensions (e.g. the commandprocessor paths, which
      // have no GET) must never carry platform data either.
      assert.ok(
        !("x-leap-platforms" in item),
        `x-leap-platforms injected at path-item level for ${path}`,
      );

      for (const method of otherHttpMethods) {
        const op = item[method];
        if (!op || typeof op !== "object") continue;
        const operation = op as Record<string, unknown>;
        assert.ok(
          !("x-leap-platforms" in operation),
          `x-leap-platforms injected into ${method} ${path}`,
        );
        if (typeof operation.description === "string") {
          assert.ok(
            !operation.description.includes("Platform availability"),
            `platform table description injected into ${method} ${path}`,
          );
        }
      }
    }
  });
});
