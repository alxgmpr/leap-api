import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test, { describe } from "node:test";
import { assertInvariants } from "../lib/site/invariants.ts";
import { buildModel } from "../lib/site/model.ts";
import { RECIPES } from "../lib/site/recipes.ts";

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? walk(join(dir, entry.name))
      : entry.name.endsWith(".html")
        ? [join(dir, entry.name)]
        : [],
  );
}

describe("build invariants", () => {
  const model = buildModel();

  test("the real model passes", () => {
    assert.doesNotThrow(() =>
      assertInvariants(model, [{ path: "index.html", html: "<html></html>" }]),
    );
  });

  test("a multi-key Body fails the build", () => {
    const broken = structuredClone(model);
    const frame = broken.resources
      .flatMap((r) => r.operations)
      .flatMap((o) => o.responses)
      .find((f) => f.Body);
    assert.ok(frame, "the corpora supply at least one captured body");
    frame.Body = { A: 1, B: 2 };
    assert.throws(() => assertInvariants(broken, []), /single-key wrapper/);
  });

  test("an ungraded frame fails the build", () => {
    const broken = structuredClone(model);
    const operation = broken.resources[0]?.operations[0];
    assert.ok(operation);
    // biome-ignore lint/suspicious/noExplicitAny: deliberately corrupting the model
    (operation.request as any).fidelity = undefined;
    assert.throws(() => assertInvariants(broken, []), /fidelity/);
  });

  test("a dropped path fails the build", () => {
    const broken = structuredClone(model);
    broken.resources = broken.resources.filter((r) => r.name !== "zone");
    assert.throws(() => assertInvariants(broken, []), /has no page/);
  });

  test("a duplicate page path fails the build", () => {
    assert.throws(
      () =>
        assertInvariants(model, [
          { path: "a.html", html: "" },
          { path: "a.html", html: "" },
        ]),
      /duplicate page paths/,
    );
  });

  test("a duplicate anchor id fails the build", () => {
    // One document means one id space: a doc heading colliding with an
    // operation id would silently hijack deep links.
    assert.throws(
      () =>
        assertInvariants(model, [
          {
            path: "index.html",
            html: '<h2 id="zone"></h2><article id="zone"></article>',
          },
        ]),
      /duplicate element ids/,
    );
  });

  test("a link to a page that does not exist fails the build", () => {
    const model = buildModel();
    assert.throws(
      () =>
        assertInvariants(model, [
          {
            path: "index.html",
            html: `<html><a href="schema/Nope.html">x</a></html>`,
          },
        ]),
      /schema\/Nope\.html/,
    );
  });

  test("a link to a page that does exist passes", () => {
    const model = buildModel();
    assert.doesNotThrow(() =>
      assertInvariants(model, [
        {
          path: "index.html",
          html: `<html><a href="schema/Zone.html">x</a></html>`,
        },
        { path: "schema/Zone.html", html: "<html></html>" },
      ]),
    );
  });

  test("a fragment missing from its target page fails the build", () => {
    // The target page exists, but nothing on it carries this id -- exactly
    // the case the plain page-existence check above cannot catch.
    const model = buildModel();
    assert.throws(
      () =>
        assertInvariants(model, [
          {
            path: "index.html",
            html: `<html><a href="schema/Zone.html#nope">x</a></html>`,
          },
          {
            path: "schema/Zone.html",
            html: '<html><h1 id="schema-Zone"></h1></html>',
          },
        ]),
      /schema\/Zone\.html#nope/,
    );
  });

  test("a fragment present on its target page passes", () => {
    const model = buildModel();
    assert.doesNotThrow(() =>
      assertInvariants(model, [
        {
          path: "index.html",
          html: `<html><a href="schema/Zone.html#schema-Zone">x</a></html>`,
        },
        {
          path: "schema/Zone.html",
          html: '<html><h1 id="schema-Zone"></h1></html>',
        },
      ]),
    );
  });

  test("a bare fragment is checked against the linking page's own ids", () => {
    const model = buildModel();
    assert.throws(
      () =>
        assertInvariants(model, [
          { path: "index.html", html: '<a href="#nope">x</a>' },
        ]),
      /index\.html#nope/,
    );
    assert.doesNotThrow(() =>
      assertInvariants(model, [
        {
          path: "index.html",
          html: '<h2 id="overview"></h2><a href="#overview">x</a>',
        },
      ]),
    );
  });
});

describe("generated site", () => {
  const files = walk("site").map((f) => f.replace(/\\/g, "/"));

  // Task 4 split schemas out of the single document; Task 5 split resources
  // out too and promoted both tier indexes (resources.html, schemas.html) to
  // real pages; Task 6 finishes the split -- every doc, every recipe and
  // coverage now has its own page, and index.html is just the overview.
  test("emits index.html, every tier index, and one page per resource, schema, doc and recipe", () => {
    const model = buildModel();
    assert.equal(
      files.length,
      model.resources.length +
        model.schemas.length +
        model.docs.length +
        RECIPES.length +
        5, // index, resources, schemas, recipes, coverage
    );
    assert.ok(files.includes("site/index.html"));
    assert.ok(files.includes("site/resources.html"));
    assert.ok(files.includes("site/schemas.html"));
    assert.ok(files.includes("site/recipes.html"));
    assert.ok(files.includes("site/coverage.html"));
    for (const resource of model.resources)
      assert.ok(
        files.includes(`site/resource/${resource.name}.html`),
        `resource/${resource.name}.html is missing`,
      );
    for (const entry of model.schemas)
      assert.ok(
        files.includes(`site/schema/${entry.name}.html`),
        `schema/${entry.name}.html is missing`,
      );
    for (const doc of model.docs)
      assert.ok(
        files.includes(`site/docs/${doc.slug}.html`),
        `docs/${doc.slug}.html is missing`,
      );
    for (const recipe of RECIPES)
      assert.ok(
        files.includes(`site/recipe/${recipe.slug}.html`),
        `recipe/${recipe.slug}.html is missing`,
      );
  });

  test("index.html carries only the overview", () => {
    const html = readFileSync("site/index.html", "utf8");
    assert.ok(html.includes('id="overview"'), "#overview is missing");
    // Docs, recipes and coverage moved to their own pages in this task --
    // nothing but the overview's own section should remain.
    for (const anchor of ["doc-protocol", "recipes", "coverage"])
      assert.ok(
        !html.includes(`id="${anchor}"`),
        `#${anchor} should have moved off index.html`,
      );
  });

  test("a doc page carries its own h1 and a working table of contents", () => {
    const html = readFileSync("site/docs/protocol.html", "utf8");
    assert.ok(html.includes('id="doc-protocol"'));
    assert.match(html, /<h1 id="[\w-]+">/);
    assert.match(html, /class="toc"/);
  });

  test("a recipe page carries its own h1 and section anchor", () => {
    const html = readFileSync(`site/recipe/${RECIPES[0]?.slug}.html`, "utf8");
    assert.ok(html.includes(`id="recipe-${RECIPES[0]?.slug}"`));
    assert.match(html, /<h1>/);
  });

  test("the recipes and coverage tier indexes carry their own promoted heading", () => {
    const recipes = readFileSync("site/recipes.html", "utf8");
    assert.ok(recipes.includes('id="recipes"'));
    assert.match(recipes, /<h1 class="part">Recipes<\/h1>/);

    const coverage = readFileSync("site/coverage.html", "utf8");
    assert.ok(coverage.includes('id="coverage"'));
    assert.match(coverage, /<h1 class="part">Coverage<\/h1>/);
  });

  test("a resource page carries its own h1 and section anchor", () => {
    const html = readFileSync("site/resource/zone.html", "utf8");
    assert.ok(html.includes('id="resource-zone"'));
    assert.match(html, /<h1>zone<\/h1>/);
  });

  test("a schema page carries its own h1 and section anchor", () => {
    const html = readFileSync("site/schema/Zone.html", "utf8");
    assert.ok(html.includes('id="schema-Zone"'));
    assert.match(html, /<h1>Zone<\/h1>/);
  });

  test("the resources and schemas tier indexes carry their own promoted heading", () => {
    const resources = readFileSync("site/resources.html", "utf8");
    assert.ok(resources.includes('id="resources"'));
    assert.match(resources, /<h1 class="part">Resources<\/h1>/);

    const schemas = readFileSync("site/schemas.html", "utf8");
    assert.ok(schemas.includes('id="schemas"'));
    assert.match(schemas, /<h1 class="part">Schemas<\/h1>/);
  });

  test("every same-page anchor resolves within its own page", () => {
    for (const file of files) {
      const html = readFileSync(file, "utf8");
      const ids = new Set(
        [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1] as string),
      );
      const dead: string[] = [];
      for (const match of html.matchAll(/href="#([^"]+)"/g))
        if (!ids.has(match[1] as string)) dead.push(`#${match[1]}`);
      assert.deepEqual(dead, [], `${file} has dead same-page anchors`);
    }
  });

  test("resources.html and schemas.html link to their pages by URL, not root-absolute", () => {
    const resources = readFileSync("site/resources.html", "utf8");
    assert.ok(
      /href="resource\/[\w-]+\.html"/.test(resources),
      "a resource reference must be a page URL from resources.html",
    );

    const schemas = readFileSync("site/schemas.html", "utf8");
    assert.ok(
      /href="schema\/\w+\.html"/.test(schemas),
      "a schema reference must be a page URL from schemas.html",
    );

    for (const file of files) {
      const html = readFileSync(file, "utf8");
      assert.ok(
        !html.includes('href="/'),
        `${file} has a root-absolute link, which breaks GitHub Pages subpaths`,
      );
    }
  });
});
