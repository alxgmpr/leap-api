import { buildRequestFrame } from "../frames.ts";
import type { LeapModel } from "../model.ts";
import { RECIPES, type Recipe } from "../recipes.ts";
import { renderFrame } from "./highlight.ts";
import { siteNav } from "./home.ts";
import { esc } from "./html.ts";
import { type Page, page } from "./layout.ts";

const ROOT = "../../";

function renderRecipe(recipe: Recipe, model: LeapModel): Page {
  const main = `<h1>${esc(recipe.title)}</h1>
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

  return {
    path: `recipes/${recipe.slug}/index.html`,
    html: page({
      title: recipe.title,
      relativeRoot: ROOT,
      nav: siteNav(model),
      main,
    }),
  };
}

export function renderRecipePages(model: LeapModel): Page[] {
  const index: Page = {
    path: "recipes/index.html",
    html: page({
      title: "Recipes",
      relativeRoot: "../",
      nav: siteNav(model),
      main: `<h1>Recipes</h1>
<p class="lede">Frame sequences for the common tasks — pairing, discovery,
reading state, driving a zone, watching for changes — with captured replies
where this project has them.</p>
<ul class="recipes">${RECIPES.map(
        (r) =>
          `<li><a href="${esc(r.slug)}/index.html"><strong>${esc(r.title)}</strong></a> — ${esc(r.intent)}</li>`,
      ).join("")}</ul>`,
    }),
  };
  return [index, ...RECIPES.map((recipe) => renderRecipe(recipe, model))];
}
