import { buildRequestFrame } from "../frames.ts";
import { href, ROOT_TOP } from "../href.ts";
import type { LeapModel } from "../model.ts";
import { RECIPES, type Recipe } from "../recipes.ts";
import { renderFrame } from "./highlight.ts";
import { esc } from "./html.ts";
import type { Section } from "./layout.ts";

/**
 * One recipe, as its own page. Headings are promoted one level from the
 * shared-document form (h3 -> h1, h4 -> h2): a recipe page owns its heading
 * hierarchy outright instead of nesting under the single-page document's h1
 * -- the same promotion `renderResourcePage` and `renderSchemaPage` make.
 */
export function renderRecipePage(model: LeapModel, recipe: Recipe): Section {
  const html = `<h1>${esc(recipe.title)}</h1>
<p class="lede">${esc(recipe.intent)}</p>
${recipe.steps
  .map((step, index) => {
    const captured = step.capturedFrom
      ? (model.frameLogs
          .find((log) => log.id === step.capturedFrom?.log)
          ?.frames.filter(
            (frame) => frame.Header.ClientTag === step.capturedFrom?.clientTag,
          ) ?? [])
      : [];
    return `<section class="step">
<h2>Step ${index + 1}: <span class="communique">${esc(step.communiqueType)}</span> <code>${esc(step.url)}</code></h2>
${step.outsideBundle ? `<p class="unresolved">Not a bundled path — ${esc(step.outsideBundle)}.</p>` : ""}
<p>${esc(step.prose)}</p>
${renderFrame(
  buildRequestFrame({ url: step.url, communiqueType: step.communiqueType }),
  "Request",
)}
${captured.map((frame) => renderFrame(frame, "Captured on hardware")).join("")}
</section>`;
  })
  .join("")}`;

  return { id: `recipe-${recipe.slug}`, html };
}

/** The recipes tier index: its own page (Task 6), linking every recipe. */
export function renderRecipeIndex(_model: LeapModel): Section {
  const html = `<h1 class="part">Recipes</h1>
<p class="lede">Frame sequences for the common tasks — pairing, discovery,
reading state, driving a zone, watching for changes — with captured replies
where this project has them.</p>
<ul class="recipes">${RECIPES.map(
    (r) =>
      `<li><a href="${esc(href.recipe(ROOT_TOP, r.slug))}"><strong>${esc(r.title)}</strong></a> — ${esc(r.intent)}</li>`,
  ).join("")}</ul>`;
  return { id: "recipes", html };
}
