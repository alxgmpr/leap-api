import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { href, ROOT_NESTED } from "../lib/site/href.ts";
import { buildModel } from "../lib/site/model.ts";
import {
  renderSchemaIndex,
  renderSchemaPage,
} from "../lib/site/render/schema.ts";

describe("schema pages", () => {
  const model = buildModel();
  const zone = model.schemas.find((s) => s.name === "ZoneStatus");
  if (!zone) throw new Error("ZoneStatus missing from the model");

  test("one page per schema, with its own h1", () => {
    const section = renderSchemaPage(model, zone);
    assert.equal(section.id, "schema-ZoneStatus");
    assert.match(section.html, /<h1>ZoneStatus<\/h1>/);
  });

  test("a type reference points at that type's page", () => {
    const section = renderSchemaPage(model, zone);
    assert.ok(
      !section.html.includes('href="#schema-'),
      "schema references must be page URLs, not anchors",
    );
  });

  test("the index links every schema", () => {
    const index = renderSchemaIndex(model);
    assert.equal(index.id, "schemas");
    for (const s of model.schemas)
      assert.ok(
        index.html.includes(href.schema("", s.name)),
        `${s.name} missing from the schema index`,
      );
  });

  test("href.schema resolves from a nested page", () => {
    assert.equal(href.schema(ROOT_NESTED, "Zone"), "../schema/Zone.html");
  });

  // The six cases below restate, against renderSchemaPage's per-schema API,
  // the coverage renderSchema/renderSchemaSection carried before the split.

  test("lists fields with types and required marks", () => {
    const entry = model.schemas.find((s) => s.name === "Zone");
    if (!entry) throw new Error("Zone missing from the model");
    const html = renderSchemaPage(model, entry).html;
    assert.match(html, /Name/);
    assert.match(html, /class="required"/);
  });

  test("marks a TODO field as not established", () => {
    const entry = model.schemas.find((s) => s.name === "Zone");
    if (!entry) throw new Error("Zone missing from the model");
    const html = renderSchemaPage(model, entry).html;
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
    const html = renderSchemaPage(model, found).html;
    assert.match(html, /class="observed">observed: /);
  });

  test("a deliberately-open type shows its observed values and reads confirmed", () => {
    // ServiceType is the one closed enum hardware falsified -- it is now a
    // bare string carrying x-observed-values at the schema level.
    const entry = model.schemas.find((s) => s.name === "ServiceType");
    if (!entry) throw new Error("ServiceType missing from the model");
    const html = renderSchemaPage(model, entry).html;
    assert.match(html, /chip-confirmed/);
    assert.match(html, /observed: .*Alexa/);
    assert.match(html, /open <code>string<\/code>, not a closed set/);
  });

  test("links back to the operations that use it", () => {
    const entry = model.schemas.find((s) => s.name === "ZoneStatuses");
    if (!entry) throw new Error("ZoneStatuses missing from the model");
    const html = renderSchemaPage(model, entry).html;
    assert.match(html, /\/zone\/status/);
  });

  test("renders a collection wrapper as an array of its element type", () => {
    const entry = model.schemas.find((s) => s.name === "ZoneStatuses");
    if (!entry) throw new Error("ZoneStatuses missing from the model");
    const html = renderSchemaPage(model, entry).html;
    assert.match(html, /array of/);
    assert.match(html, /href="\.\.\/schema\/ZoneStatus\.html"/);
  });
});
