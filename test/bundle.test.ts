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

  test("injected platform data only appears under HTTP method keys, not path-item extensions", () => {
    const httpMethods = new Set([
      "get",
      "post",
      "put",
      "delete",
      "patch",
      "head",
      "options",
      "trace",
    ]);

    const walk = (node: unknown, path: string[]): void => {
      if (Array.isArray(node)) {
        for (let idx = 0; idx < node.length; idx++)
          walk(node[idx], [...path, `[${idx}]`]);
        return;
      }
      if (node && typeof node === "object") {
        const obj = node as Record<string, unknown>;

        // Check if this looks like a path item (has operation-like keys or parameters)
        const keys = Object.keys(obj);
        const hasHttpMethods = keys.some((k) => httpMethods.has(k));
        const hasParameters = keys.includes("parameters");
        const hasExtensions = keys.some((k) => k.startsWith("x-"));

        if ((hasHttpMethods || hasParameters) && hasExtensions) {
          // This is a path item; check that injected data only appears under HTTP methods
          for (const [k, v] of Object.entries(obj)) {
            if (k.startsWith("x-")) {
              // This is an extension at path-item level
              // It should NOT have x-leap-platforms or a description with platform table
              if (v && typeof v === "object") {
                const ext = v as Record<string, unknown>;
                assert.ok(
                  !("x-leap-platforms" in ext),
                  `x-leap-platforms injected into path-item extension ${k} at ${path.join(".")}`,
                );
                // description might be a string in extensions (e.g., in x-leap-event-schema)
                // If it has our platform table marker, that's wrong
                if (typeof ext.description === "string") {
                  assert.ok(
                    !ext.description.includes("Platform availability"),
                    `platform table description injected into path-item extension ${k} at ${path.join(".")}`,
                  );
                }
              }
            }
          }
        }

        for (const [k, v] of Object.entries(obj)) {
          walk(v, [...path, k]);
        }
      }
    };

    walk(doc, ["paths"]);
  });
});
