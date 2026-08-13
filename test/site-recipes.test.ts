import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { buildModel } from "../lib/site/model.ts";
import { RECIPES } from "../lib/site/recipes.ts";
import { renderCoveragePage } from "../lib/site/render/coverage.ts";
import { renderRecipePages } from "../lib/site/render/recipes.ts";

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

  test("renders an index and a page per recipe", () => {
    const pages = renderRecipePages(model);
    assert.equal(pages.length, RECIPES.length + 1);
    assert.ok(pages.some((p) => p.path === "recipes/index.html"));
  });

  test("the turn-on-a-light recipe shows the observed 201 reply", () => {
    const pages = renderRecipePages(model);
    const html =
      pages.find((p) => p.path.includes("turn-on-a-light"))?.html ?? "";
    assert.match(html, /201 Created/);
    assert.match(html, /captured-frame/);
  });

  test("the subscribe recipe shows a push arriving on the subscription's tag", () => {
    const pages = renderRecipePages(model);
    const html =
      pages.find((p) => p.path.includes("watch-for-changes"))?.html ?? "";
    assert.match(html, /lt-18/);
    assert.match(html, /ReadResponse/);
  });
});

describe("coverage page", () => {
  const model = buildModel();

  test("states the uncovered counts plainly", () => {
    const html = renderCoveragePage(model)[0]?.html ?? "";
    assert.match(html, /no 200 capture/);
    assert.match(
      html,
      new RegExp(String(model.coverage.specWithoutFixture.length)),
    );
    assert.match(html, /224 genuinely not covered/);
  });
});
