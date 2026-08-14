import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { href, ROOT_NESTED, ROOT_TOP } from "../lib/site/href.ts";

describe("href", () => {
  test("resource and schema references", () => {
    assert.equal(href.resource(ROOT_TOP, "zone"), "index.html#resource-zone");
    assert.equal(href.schema(ROOT_TOP, "ZoneStatus"), "schema/ZoneStatus.html");
  });

  test("an operation reference carries its own anchor", () => {
    assert.equal(
      href.operation(ROOT_TOP, "zone", "readZone"),
      "index.html#readZone",
    );
  });

  test("docs, recipes and tiers", () => {
    assert.equal(href.doc(ROOT_TOP, "protocol"), "index.html#doc-protocol");
    assert.equal(
      href.docHeading(ROOT_TOP, "protocol", "the-envelope"),
      "index.html#the-envelope",
    );
    assert.equal(
      href.recipe(ROOT_TOP, "turn-on-a-light"),
      "index.html#recipe-turn-on-a-light",
    );
    assert.equal(href.tier(ROOT_TOP, "schemas"), "index.html#schemas");
    assert.equal(href.overview(ROOT_TOP), "index.html");
  });

  test("nested pages reach the root via ROOT_NESTED", () => {
    assert.equal(
      href.resource(ROOT_NESTED, "zone"),
      "../index.html#resource-zone",
    );
    assert.equal(href.schema(ROOT_NESTED, "Zone"), "../schema/Zone.html");
    assert.equal(href.overview(ROOT_NESTED), "../index.html");
  });
});
