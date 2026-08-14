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

  test("every tier is its own top-level page", () => {
    assert.equal(href.tier(ROOT_TOP, "resources"), "resources.html");
    assert.equal(href.tier(ROOT_TOP, "schemas"), "schemas.html");
    assert.equal(href.tier(ROOT_TOP, "recipes"), "recipes.html");
    assert.equal(href.tier(ROOT_TOP, "coverage"), "coverage.html");
  });

  test("docs, recipes and tiers", () => {
    assert.equal(href.doc(ROOT_TOP, "protocol"), "docs/protocol.html");
    assert.equal(
      href.docHeading(ROOT_TOP, "protocol", "the-envelope"),
      "docs/protocol.html#the-envelope",
    );
    assert.equal(
      href.recipe(ROOT_TOP, "turn-on-a-light"),
      "recipe/turn-on-a-light.html",
    );
    assert.equal(href.overview(ROOT_TOP), "index.html");
  });

  test("nested pages reach the root via ROOT_NESTED", () => {
    assert.equal(href.resource(ROOT_NESTED, "zone"), "../resource/zone.html");
    assert.equal(href.schema(ROOT_NESTED, "Zone"), "../schema/Zone.html");
    assert.equal(href.overview(ROOT_NESTED), "../index.html");
    assert.equal(href.tier(ROOT_NESTED, "resources"), "../resources.html");
    assert.equal(href.tier(ROOT_NESTED, "schemas"), "../schemas.html");
    assert.equal(href.tier(ROOT_NESTED, "recipes"), "../recipes.html");
    assert.equal(href.tier(ROOT_NESTED, "coverage"), "../coverage.html");
    assert.equal(href.doc(ROOT_NESTED, "protocol"), "../docs/protocol.html");
    assert.equal(
      href.docHeading(ROOT_NESTED, "protocol", "the-envelope"),
      "../docs/protocol.html#the-envelope",
    );
    assert.equal(
      href.recipe(ROOT_NESTED, "turn-on-a-light"),
      "../recipe/turn-on-a-light.html",
    );
  });
});
