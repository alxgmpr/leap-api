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
});
