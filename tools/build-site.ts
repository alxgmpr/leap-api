import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { parse } from "yaml";
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

// Machine-readable surface: the bundled spec, the raw markdown docs, and
// llms.txt pointing an agent at all of it. The HTML pages are for people;
// this is what an LLM client-writer is expected to fetch.
const SITE_URL = "https://alxgmpr.github.io/leap-api";
const specYaml = readFileSync("dist/openapi.yaml", "utf8");
cpSync("dist/openapi.yaml", join(OUT, "openapi.yaml"));
writeFileSync(
  join(OUT, "openapi.json"),
  JSON.stringify(parse(specYaml)),
  "utf8",
);
for (const doc of model.docs) {
  writeFileSync(join(OUT, "docs", `${doc.slug}.md`), doc.markdown, "utf8");
}

// One trigger line per doc: the wording an agent routes on. A doc added
// without a line here still gets a title-only entry.
const DOC_TRIGGERS: Record<string, string> = {
  protocol:
    "wire transport, framing, envelopes, tags, status codes — read before writing a client",
  subscriptions: "subscribe semantics, push frames, event ordering",
  platforms: "RA3 vs Caseta divergence — which endpoints behave differently",
  discovery: "finding processors, pairing, mTLS certificates",
  mapping: "how LEAP maps onto OpenAPI and how this spec was derived",
};
const docLines = model.docs
  .map(
    (doc) =>
      `- [${doc.slug}.md](${SITE_URL}/docs/${doc.slug}.md): ${DOC_TRIGGERS[doc.slug] ?? doc.title}`,
  )
  .join("\n");
writeFileSync(
  join(OUT, "llms.txt"),
  `# Lutron LEAP API

> Unofficial reference for Lutron LEAP — the newline-delimited JSON protocol
> RA3/HWQS processors and Caseta bridges speak over mutual-TLS port 8081.
> Built from a firmware route/type extraction cross-checked against ~5,000
> requests captured on live hardware. Not affiliated with or endorsed by
> Lutron Electronics.

LEAP is not HTTP: each request is a JSON envelope over one persistent
socket, and every \`Body\` wraps the real payload under a single key named
by \`Header.MessageBodyType\` — schemas in the spec describe the unwrapped
payload. Operations and schemas marked \`x-leap-verified: false\` come from
the firmware extraction and were never exercised on hardware; everything
else is validated against captured traffic. \`x-leap-platforms\` records
per-platform (RA3/Caseta) observed behavior. Closed enums are lower bounds.

## Spec

- [openapi.yaml](${SITE_URL}/openapi.yaml): the full OpenAPI 3.1 document
- [openapi.json](${SITE_URL}/openapi.json): the same document as JSON
- [model.json](${SITE_URL}/model.json): compact index of resources and operations

## Docs

${docLines}

## Coverage

- [coverage.html](${SITE_URL}/coverage.html): what is verified on hardware vs imported, and what remains unprobed
`,
  "utf8",
);

console.log(`built ${pages.length} pages into ${OUT}/`);
