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
});

describe("generated site", () => {
  const files = walk("site").map((f) => f.replace(/\\/g, "/"));

  test("emits every page type", () => {
    for (const expected of [
      "site/index.html",
      "site/resource/zone/index.html",
      "site/schema/Zone/index.html",
      "site/docs/protocol/index.html",
      "site/recipes/index.html",
      "site/coverage/index.html",
    ])
      assert.ok(files.includes(expected), `${expected} was not generated`);
  });

  test("every internal link resolves to a generated file", () => {
    const generated = new Set(files);
    const dead: string[] = [];
    for (const file of files) {
      const html = readFileSync(file, "utf8");
      const dir = file.slice(0, file.lastIndexOf("/"));
      for (const match of html.matchAll(/href="([^":#]+\.html)(#[^"]*)?"/g)) {
        const target = new URL(
          match[1] as string,
          `file:///${dir}/`,
        ).pathname.replace(/^\/+/, "");
        if (!generated.has(target)) dead.push(`${file} -> ${match[1]}`);
      }
    }
    assert.deepEqual(dead, []);
  });

  test("no page links to a root-absolute path", () => {
    for (const file of files)
      assert.ok(
        !readFileSync(file, "utf8").includes('href="/'),
        `${file} uses a root-absolute link, which breaks GitHub Pages subpaths`,
      );
  });
});
