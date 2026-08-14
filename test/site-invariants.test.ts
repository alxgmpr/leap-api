import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test, { describe } from "node:test";
import { assertInvariants } from "../lib/site/invariants.ts";
import { buildModel } from "../lib/site/model.ts";

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
});

describe("generated site", () => {
  const files = walk("site").map((f) => f.replace(/\\/g, "/"));

  // Task 4 splits schemas out of the single document: index.html plus one
  // page per schema. Later tasks split resources, docs, recipes and coverage
  // the same way.
  test("emits index.html plus one page per schema", () => {
    const model = buildModel();
    assert.equal(files.length, model.schemas.length + 1);
    assert.ok(files.includes("site/index.html"));
    for (const entry of model.schemas)
      assert.ok(
        files.includes(`site/schema/${entry.name}.html`),
        `schema/${entry.name}.html is missing`,
      );
  });

  test("every section still on index.html is present", () => {
    const html = readFileSync("site/index.html", "utf8");
    for (const anchor of [
      "overview",
      "doc-protocol",
      "recipes",
      "resource-zone",
      "schemas",
      "coverage",
    ])
      assert.ok(html.includes(`id="${anchor}"`), `#${anchor} is missing`);
  });

  test("a schema page carries its own h1 and section anchor", () => {
    const html = readFileSync("site/schema/Zone.html", "utf8");
    assert.ok(html.includes('id="schema-Zone"'));
    assert.match(html, /<h1>Zone<\/h1>/);
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

  test("index.html links to schema pages by URL, not root-absolute", () => {
    const html = readFileSync("site/index.html", "utf8");
    assert.ok(
      /href="schema\/\w+\.html"/.test(html),
      "a schema reference must be a page URL from index.html",
    );
    assert.ok(
      !html.includes('href="/'),
      "a root-absolute link breaks GitHub Pages subpaths",
    );
  });
});
