import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { toClientModel } from "../lib/site/client-model.ts";
import { href, ROOT_NESTED, ROOT_TOP } from "../lib/site/href.ts";
import { assertInvariants } from "../lib/site/invariants.ts";
import { buildModel } from "../lib/site/model.ts";
import { renderCoverageSection } from "../lib/site/render/coverage.ts";
import { renderDocSections } from "../lib/site/render/docs.ts";
import { renderOverview, siteNav } from "../lib/site/render/home.ts";
import { type Page, page } from "../lib/site/render/layout.ts";
import { renderRecipeSections } from "../lib/site/render/recipes.ts";
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

// One document, one scroll: narrative first, then the tiers still awaiting
// their own split (docs, recipes, coverage -- Task 6). Resources and schemas
// have their own pages as of Tasks 4 and 5.
const sections = [
  renderOverview(model),
  ...renderDocSections(model),
  ...renderRecipeSections(model),
  renderCoverageSection(model),
];

const pages: Page[] = [
  {
    path: "index.html",
    html: page({
      title: "Reference",
      root: ROOT_TOP,
      nav: siteNav(model, ROOT_TOP),
      sections,
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
console.log(
  `built ${pages.length} page (${sections.length} sections) into ${OUT}/`,
);
