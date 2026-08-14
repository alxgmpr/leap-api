import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { buildModel } from "../lib/site/model.ts";
import { RECIPES } from "../lib/site/recipes.ts";
import { renderCoverageSection } from "../lib/site/render/coverage.ts";
import { renderRecipeSections } from "../lib/site/render/recipes.ts";

describe("recipes", () => {
  const model = buildModel();

  test("ships five recipes, each with steps", () => {
    assert.equal(RECIPES.length, 5);
    for (const recipe of RECIPES)
      assert.ok(recipe.steps.length > 0, recipe.title);
  });

  test("every recipe URL is bundled or declared as outside the bundle", () => {
    const urls = new Set(
      model.resources.flatMap((r) => r.operations.map((o) => o.url)),
    );
    for (const recipe of RECIPES)
      for (const step of recipe.steps)
        assert.ok(
          urls.has(step.url) || step.outsideBundle !== undefined,
          `${recipe.title}: ${step.url} is neither bundled nor declared outside the bundle`,
        );
  });

  test("renders an index and a section per recipe", () => {
    const sections = renderRecipeSections(model);
    assert.equal(sections.length, RECIPES.length + 1);
    assert.ok(sections.some((s) => s.id === "recipes"));
  });

  test("the turn-on-a-light recipe shows the observed 201 reply", () => {
    const sections = renderRecipeSections(model);
    const html =
      sections.find((s) => s.id.includes("turn-on-a-light"))?.html ?? "";
    assert.match(html, /201 Created/);
    assert.match(html, /captured-frame/);
  });

  test("the subscribe recipe shows a push arriving on the subscription's tag", () => {
    const sections = renderRecipeSections(model);
    const html =
      sections.find((s) => s.id.includes("watch-for-changes"))?.html ?? "";
    assert.match(html, /lt-18/);
    assert.match(html, /ReadResponse/);
  });
});

describe("coverage section", () => {
  const model = buildModel();

  test("states the uncovered counts plainly", () => {
    const html = renderCoverageSection(model).html;
    assert.match(html, /no 200 capture/);
    assert.match(
      html,
      new RegExp(String(model.coverage.specWithoutFixture.length)),
    );
    assert.match(html, /224 not covered/);
  });
});
