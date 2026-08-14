import { buildRequestFrame } from "../frames.ts";
import { href, ROOT_TOP } from "../href.ts";
import type { LeapModel } from "../model.ts";
import { RECIPES, type Recipe } from "../recipes.ts";
import { renderFrame } from "./highlight.ts";
import { esc } from "./html.ts";
import type { Section } from "./layout.ts";

function renderRecipe(recipe: Recipe, model: LeapModel): Section {
  const html = `<h3>${esc(recipe.title)}</h3>
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
<h4>Step ${index + 1}: <span class="communique">${esc(step.communiqueType)}</span> <code>${esc(step.url)}</code></h4>
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

export function renderRecipeSections(model: LeapModel): Section[] {
  const index: Section = {
    id: "recipes",
    html: `<h2 class="part">Recipes</h2>
<p class="lede">Frame sequences for the common tasks — pairing, discovery,
reading state, driving a zone, watching for changes — with captured replies
where this project has them.</p>
<ul class="recipes">${RECIPES.map(
      (r) =>
        `<li><a href="${esc(href.recipe(ROOT_TOP, r.slug))}"><strong>${esc(r.title)}</strong></a> — ${esc(r.intent)}</li>`,
    ).join("")}</ul>`,
  };
  return [index, ...RECIPES.map((recipe) => renderRecipe(recipe, model))];
}
