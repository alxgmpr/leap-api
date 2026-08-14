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
import { renderResourceSections } from "../lib/site/render/resource.ts";
import {
  renderSchemaIndex,
  renderSchemaPage,
} from "../lib/site/render/schema.ts";

const OUT = "site";

const model = buildModel();

// One document, one scroll: narrative first, then the reference tiers.
const sections = [
  renderOverview(model),
  ...renderDocSections(model),
  ...renderRecipeSections(model),
  ...renderResourceSections(model),
  renderSchemaIndex(model),
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
