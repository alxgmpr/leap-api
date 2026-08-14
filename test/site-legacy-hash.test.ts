import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { isOverviewPath, pageForLegacyHash } from "../site-src/legacy-hash.js";

describe("legacy hash redirect", () => {
  test("the overview anchor goes to index.html", () => {
    assert.equal(pageForLegacyHash("#overview"), "index.html");
  });

  test("tier anchors go to their own top-level page", () => {
    assert.equal(pageForLegacyHash("#resources"), "resources.html");
    assert.equal(pageForLegacyHash("#schemas"), "schemas.html");
    assert.equal(pageForLegacyHash("#recipes"), "recipes.html");
    assert.equal(pageForLegacyHash("#coverage"), "coverage.html");
  });

  test("resource, schema, doc and recipe anchors go to their page", () => {
    assert.equal(pageForLegacyHash("#resource-zone"), "resource/zone.html");
    assert.equal(
      pageForLegacyHash("#schema-ZoneStatus"),
      "schema/ZoneStatus.html",
    );
    assert.equal(pageForLegacyHash("#doc-protocol"), "docs/protocol.html");
    assert.equal(
      pageForLegacyHash("#recipe-turn-on-a-light"),
      "recipe/turn-on-a-light.html",
    );
  });

  test("an unrecognised hash returns null, so the caller does not redirect", () => {
    assert.equal(pageForLegacyHash("#not-a-real-section"), null);
    assert.equal(pageForLegacyHash("#"), null);
    assert.equal(pageForLegacyHash(""), null);
  });
});

describe("isOverviewPath", () => {
  test("matches the project site's directory root, with and without a repo prefix", () => {
    // This is a GitHub Pages project site, served at "/<repo>/" -- an old
    // single-page link ("https://.../leap-api/#resource-zone") lands here,
    // with no "index.html" segment anywhere in the pathname.
    assert.equal(isOverviewPath("/leap-api/"), true);
    assert.equal(isOverviewPath("/"), true);
  });

  test("matches the explicit index.html form too", () => {
    assert.equal(isOverviewPath("/leap-api/index.html"), true);
    assert.equal(isOverviewPath("/index.html"), true);
  });

  test("does not match a page that has its own URL", () => {
    assert.equal(isOverviewPath("/leap-api/resource/zone.html"), false);
    assert.equal(isOverviewPath("/leap-api/schema/Zone.html"), false);
  });
});
