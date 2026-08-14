import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { toClientModel } from "../lib/site/client-model.ts";
import { href, ROOT_NESTED, ROOT_TOP } from "../lib/site/href.ts";
import { assertInvariants } from "../lib/site/invariants.ts";
import { buildModel } from "../lib/site/model.ts";
import { RECIPES } from "../lib/site/recipes.ts";
import { renderCoveragePage } from "../lib/site/render/coverage.ts";
import { renderDocPage } from "../lib/site/render/docs.ts";
import { renderOverview, siteNav } from "../lib/site/render/home.ts";
import { type Page, page } from "../lib/site/render/layout.ts";
import {
  renderRecipeIndex,
  renderRecipePage,
} from "../lib/site/render/recipes.ts";
import {
  renderResourceIndex,
  renderResourcePage,
} from "../lib/site/render/resource.ts";
import {
  renderSchemaIndex,
  renderSchemaPage,
} from "../lib/site/render/schema.ts";

const OUT = "site";

const model = buildModel();

// Every narrative doc, every recipe, and coverage now has its own page
// (Task 6) -- the same one-page-per-entity shape Tasks 4 and 5 gave schemas
// and resources. index.html carries only the overview.
const pages: Page[] = [
  {
    path: "index.html",
    html: page({
      title: "Reference",
      root: ROOT_TOP,
      nav: siteNav(model, ROOT_TOP),
      sections: [renderOverview(model)],
      current: href.overview(ROOT_TOP),
    }),
  },
  {
    path: "resources.html",
    html: page({
      title: "Resources",
      root: ROOT_TOP,
      nav: siteNav(model, ROOT_TOP),
      sections: [renderResourceIndex(model)],
      current: href.tier(ROOT_TOP, "resources"),
    }),
  },
  {
    path: "schemas.html",
    html: page({
      title: "Schemas",
      root: ROOT_TOP,
      nav: siteNav(model, ROOT_TOP),
      sections: [renderSchemaIndex(model)],
      current: href.tier(ROOT_TOP, "schemas"),
    }),
  },
  {
    path: "recipes.html",
    html: page({
      title: "Recipes",
      root: ROOT_TOP,
      nav: siteNav(model, ROOT_TOP),
      sections: [renderRecipeIndex(model)],
      current: href.tier(ROOT_TOP, "recipes"),
    }),
  },
  {
    path: "coverage.html",
    html: page({
      title: "Coverage",
      root: ROOT_TOP,
      nav: siteNav(model, ROOT_TOP),
      sections: [renderCoveragePage(model)],
      current: href.tier(ROOT_TOP, "coverage"),
    }),
  },
  ...model.docs.map((doc) => ({
    path: `docs/${doc.slug}.html`,
    html: page({
      title: doc.title,
      root: ROOT_NESTED,
      nav: siteNav(model, ROOT_NESTED),
      sections: [renderDocPage(model, doc)],
      current: href.doc(ROOT_NESTED, doc.slug),
    }),
  })),
  ...RECIPES.map((recipe) => ({
    path: `recipe/${recipe.slug}.html`,
    html: page({
      title: recipe.title,
      root: ROOT_NESTED,
      nav: siteNav(model, ROOT_NESTED),
      sections: [renderRecipePage(model, recipe)],
      current: href.tier(ROOT_NESTED, "recipes"),
    }),
  })),
  ...model.resources.map((resource) => ({
    path: `resource/${resource.name}.html`,
    html: page({
      title: resource.name,
      root: ROOT_NESTED,
      nav: siteNav(model, ROOT_NESTED),
      sections: [renderResourcePage(model, resource)],
      current: href.resource(ROOT_NESTED, resource.name),
    }),
  })),
  ...model.schemas.map((entry) => ({
    path: `schema/${entry.name}.html`,
    html: page({
      title: entry.name,
      root: ROOT_NESTED,
      nav: siteNav(model, ROOT_NESTED),
      sections: [renderSchemaPage(model, entry)],
      current: href.tier(ROOT_NESTED, "schemas"),
    }),
  })),
];

assertInvariants(model, pages);

rmSync(OUT, { recursive: true, force: true });
for (const p of pages) {
  const target = join(OUT, p.path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, p.html, "utf8");
}
cpSync("site-src", join(OUT, "assets"), { recursive: true });
writeFileSync(
  join(OUT, "model.json"),
  JSON.stringify(toClientModel(model)),
  "utf8",
);
console.log(`built ${pages.length} pages into ${OUT}/`);
