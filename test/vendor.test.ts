import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { describe } from "node:test";

type Route = {
  ident: string;
  path: string;
  verbs: string[];
  handlers: Record<string, string>;
  responseType?: string;
};

const routes: Route[] = JSON.parse(
  readFileSync("vendor/leap-routes.json", "utf8"),
);
const types: Record<string, string> = JSON.parse(
  readFileSync("vendor/leap-types.json", "utf8"),
);

describe("vendored firmware extraction", () => {
  test("route and type counts match the recorded extraction", () => {
    assert.equal(routes.length, 410);
    assert.equal(Object.keys(types).length, 636);
  });

  test("every route has a path and at least one verb", () => {
    for (const r of routes) {
      assert.ok(r.path.startsWith("/"), `bad path: ${r.path}`);
      assert.ok(r.verbs.length > 0, `no verbs: ${r.path}`);
    }
  });

  test("verb vocabulary is closed", () => {
    const seen = new Set(routes.flatMap((r) => r.verbs));
    assert.deepEqual(
      [...seen].sort(),
      ["CREATE", "DELETE", "GET", "SUBSCRIBE", "UPDATE"],
    );
  });

  test("every type value is a Go struct definition", () => {
    for (const [name, src] of Object.entries(types)) {
      assert.ok(src.includes("struct {"), `not a struct: ${name}`);
    }
  });
});
