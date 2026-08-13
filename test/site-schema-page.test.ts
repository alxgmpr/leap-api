import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { buildModel } from "../lib/site/model.ts";
import { renderSchemaPages } from "../lib/site/render/schema.ts";

describe("schema pages", () => {
  const model = buildModel();
  const pages = renderSchemaPages(model);

  test("emits one page per schema", () => {
    assert.equal(pages.length, model.schemas.length);
    assert.ok(pages.some((p) => p.path === "schema/Zone/index.html"));
  });

  test("lists fields with types and required marks", () => {
    const html =
      pages.find((p) => p.path === "schema/Zone/index.html")?.html ?? "";
    assert.match(html, /Name/);
    assert.match(html, /class="required"/);
  });

  test("marks a TODO field as not established", () => {
    const html =
      pages.find((p) => p.path === "schema/Zone/index.html")?.html ?? "";
    assert.match(html, /MaxWattageType[\s\S]{0,600}chip-not-established/);
  });

  test("shows observed values even where the member set is unestablished", () => {
    // 18 of the 24 fields carrying x-observed-values also carry a TODO(enum).
    // The chip reads not-established -- seeing a value does not bound a set --
    // but the values themselves must still be on the page.
    const found = model.schemas.find((s) =>
      Object.values((s.node.properties ?? {}) as Record<string, unknown>).some(
        (p) =>
          Array.isArray((p as Record<string, unknown>)["x-observed-values"]),
      ),
    );
    assert.ok(found, "the bundle carries an x-observed-values key somewhere");
    const html =
      pages.find((p) => p.path === `schema/${found.name}/index.html`)?.html ??
      "";
    assert.match(html, /class="observed">observed: /);
  });

  test("a deliberately-open type shows its observed values and reads confirmed", () => {
    // ServiceType is the one closed enum hardware falsified -- it is now a
    // bare string carrying x-observed-values at the schema level.
    const html =
      pages.find((p) => p.path === "schema/ServiceType/index.html")?.html ?? "";
    assert.match(html, /chip-confirmed/);
    assert.match(html, /observed: .*Alexa/);
    assert.match(html, /open <code>string<\/code>, not a closed set/);
  });

  test("links back to the operations that use it", () => {
    const html =
      pages.find((p) => p.path === "schema/ZoneStatuses/index.html")?.html ??
      "";
    assert.match(html, /\/zone\/status/);
  });

  test("renders a collection wrapper as an array of its element type", () => {
    const html =
      pages.find((p) => p.path === "schema/ZoneStatuses/index.html")?.html ??
      "";
    assert.match(html, /array of/);
    assert.match(html, /schema\/ZoneStatus\/index\.html/);
  });
});
