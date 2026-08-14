import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { href, ROOT_NESTED, ROOT_TOP } from "../lib/site/href.ts";

describe("href", () => {
  test("resource and schema references", () => {
    assert.equal(href.resource(ROOT_TOP, "zone"), "resource/zone.html");
    assert.equal(href.schema(ROOT_TOP, "ZoneStatus"), "schema/ZoneStatus.html");
  });

  test("an operation reference carries the page and the anchor", () => {
    assert.equal(
      href.operation(ROOT_TOP, "zone", "readZone"),
      "resource/zone.html#readZone",
    );
  });

  test("resources and schemas are top-level tier pages; recipes and coverage stay on index.html", () => {
    assert.equal(href.tier(ROOT_TOP, "resources"), "resources.html");
    assert.equal(href.tier(ROOT_TOP, "schemas"), "schemas.html");
    assert.equal(href.tier(ROOT_TOP, "recipes"), "index.html#recipes");
    assert.equal(href.tier(ROOT_TOP, "coverage"), "index.html#coverage");
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
    assert.equal(href.overview(ROOT_TOP), "index.html");
  });

  test("nested pages reach the root via ROOT_NESTED", () => {
    assert.equal(href.resource(ROOT_NESTED, "zone"), "../resource/zone.html");
    assert.equal(href.schema(ROOT_NESTED, "Zone"), "../schema/Zone.html");
    assert.equal(href.overview(ROOT_NESTED), "../index.html");
    assert.equal(href.tier(ROOT_NESTED, "resources"), "../resources.html");
    assert.equal(href.tier(ROOT_NESTED, "schemas"), "../schemas.html");
  });
});
