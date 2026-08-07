import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { describe } from "node:test";
import { parse } from "yaml";

const INDEX = "spec/paths/_generated/_index.json";

describe("generated paths", () => {
  test("covers every vendored route", () => {
    const routes = JSON.parse(readFileSync("vendor/leap-routes.json", "utf8"));
    const index = JSON.parse(readFileSync(INDEX, "utf8"));
    assert.equal(index.paths.length, routes.length);
  });

  test("records the routes missing a responseType", () => {
    const routes = JSON.parse(readFileSync("vendor/leap-routes.json", "utf8"));
    const index = JSON.parse(readFileSync(INDEX, "utf8"));
    const expected = routes.filter(
      (r: { responseType?: string }) => !r.responseType,
    ).length;
    assert.equal(index.todoResponses.length, expected);
    assert.equal(expected, 249);
  });

  test("groups by first path segment", () => {
    const index = JSON.parse(readFileSync(INDEX, "utf8"));
    assert.ok(index.families.includes("zone"));
    assert.ok(index.families.includes("device"));
    assert.ok(index.families.includes("area"));
  });

  test("zone family carries refs and subscribe flags", () => {
    const zone = parse(readFileSync("spec/paths/_generated/zone.yaml", "utf8"));
    const single = zone["/zone/{zoneId}"];
    assert.ok(single.get);
    assert.equal(
      single.get.responses["200"].content["application/json"].schema.$ref,
      "#/components/schemas/Zone",
    );
    assert.equal(
      zone["/zone/{zoneId}/status"].get["x-leap-subscribable"],
      true,
    );
  });

  test("summaries are seeded from the legacy spec where one exists", () => {
    const zone = parse(readFileSync("spec/paths/_generated/zone.yaml", "utf8"));
    const summary = zone["/zone/{zoneId}"].get.summary;
    assert.ok(typeof summary === "string" && summary.length > 0);
  });
});
