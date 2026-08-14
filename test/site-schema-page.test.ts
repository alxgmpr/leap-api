import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { buildModel } from "../lib/site/model.ts";
import { renderSchemaSection } from "../lib/site/render/schema.ts";

describe("schema section", () => {
  const model = buildModel();
  const section = renderSchemaSection(model);
  const article = (name: string): string => {
    const match = new RegExp(
      `<article class="schema-article" id="schema-${name}">[\\s\\S]*?</article>`,
    ).exec(section.html);
    return match?.[0] ?? "";
  };

  test("emits one article per schema", () => {
    const count = (section.html.match(/class="schema-article"/g) ?? []).length;
    assert.equal(count, model.schemas.length);
    assert.ok(article("Zone"));
  });

  test("lists fields with types and required marks", () => {
    const html = article("Zone");
    assert.match(html, /Name/);
    assert.match(html, /class="required"/);
  });

  test("marks a TODO field as not established", () => {
    const html = article("Zone");
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
    const html = article(found.name);
    assert.match(html, /class="observed">observed: /);
  });

  test("a deliberately-open type shows its observed values and reads confirmed", () => {
    // ServiceType is the one closed enum hardware falsified -- it is now a
    // bare string carrying x-observed-values at the schema level.
    const html = article("ServiceType");
    assert.match(html, /chip-confirmed/);
    assert.match(html, /observed: .*Alexa/);
    assert.match(html, /open <code>string<\/code>, not a closed set/);
  });

  test("links back to the operations that use it", () => {
    const html = article("ZoneStatuses");
    assert.match(html, /\/zone\/status/);
  });

  test("renders a collection wrapper as an array of its element type", () => {
    const html = article("ZoneStatuses");
    assert.match(html, /array of/);
    assert.match(html, /#schema-ZoneStatus/);
  });
});
