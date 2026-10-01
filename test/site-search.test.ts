import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { describe } from "node:test";
import { buildSearchIndex, filterIndex } from "../site-src/search-index.js";

describe("search", () => {
  const model = JSON.parse(readFileSync("site/model.json", "utf8"));
  const index = buildSearchIndex(model);

  test("the shipped model stays small enough to fetch on every page", () => {
    const bytes = readFileSync("site/model.json").byteLength;
    assert.ok(
      bytes < 250_000,
      `model.json is ${Math.round(bytes / 1024)}KB — only what search and the timelines read belongs in it`,
    );
  });

  test("ships nothing the client never reads", () => {
    assert.equal(
      model.docs,
      undefined,
      "narrative markdown is rendered at build time",
    );
    assert.equal(
      model.coverage,
      undefined,
      "the coverage page is rendered at build time",
    );
    assert.equal(
      model.resources[0]?.operations[0]?.request,
      undefined,
      "frames are rendered at build time",
    );
  });

  test("indexes resources, operations, schemas and command types", () => {
    const kinds = new Set(index.map((e) => e.kind));
    assert.deepEqual([...kinds].sort(), [
      "command",
      "operation",
      "resource",
      "schema",
    ]);
  });

  test("every hit's href matches the shape the href module builds", () => {
    // boot.js renders a hit as `${root}${hit.href}`, exactly like href.ts
    // builds a cross-page link -- so every kind here must name its target
    // page explicitly, the same way href.resource/operation/schema do, not
    // a bare "#anchor" that only resolves by accident from one particular
    // page and never from any other.
    const resource = index.find(
      (e) => e.kind === "resource" && e.title === "zone",
    );
    assert.equal(resource?.href, "resource/zone.html");

    const operation = index.find(
      (e) => e.kind === "operation" && e.title === "/zone/status",
    );
    assert.ok(operation?.href.startsWith("resource/zone.html#"));

    // A command lands on its own member of the CommandType enum page --
    // GoToGroupLightingLevel is an area command, so no resource page fits all.
    const command = index.find(
      (e) => e.kind === "command" && e.title === "GoToGroupLightingLevel",
    );
    assert.equal(command?.href, "schema/CommandType.html#GoToGroupLightingLevel");

    // Schemas are the one kind with a page of their own as of Task 4.
    const schema = index.find((e) => e.kind === "schema" && e.title === "Zone");
    assert.equal(schema?.href, "schema/Zone.html");
  });

  test("every hit lands on a built page that carries its anchor", () => {
    // A hit pointing at a real page but no anchor on it lands at the top of
    // a page that may never mention the term -- command hits once all went
    // to resource/zone.html, which most commands never appear on.
    const pages = new Map<string, string>();
    const broken = index.filter((hit) => {
      const [page, anchor] = hit.href.split("#");
      const file = `site/${page}`;
      if (!pages.has(file)) {
        try {
          pages.set(file, readFileSync(file, "utf8"));
        } catch {
          return true;
        }
      }
      if (anchor === undefined) return false;
      const html = pages.get(file) ?? "";
      const escaped = anchor
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return !html.includes(`id="${escaped}"`);
    });
    assert.deepEqual(
      broken.map((h) => `${h.kind} ${h.title} -> ${h.href}`),
      [],
    );
  });

  test("a command hit lands on its own CommandType member", () => {
    for (const hit of index.filter((e) => e.kind === "command"))
      assert.equal(hit.href, `schema/CommandType.html#${hit.title}`);
  });

  test("finds an operation by its URL", () => {
    const hits = filterIndex(index, "zone/status");
    assert.ok(hits.some((h) => h.title === "/zone/status"));
  });

  test("finds a command by name, case-insensitively", () => {
    assert.ok(
      filterIndex(index, "gotodimmed").some((h) => h.kind === "command"),
    );
  });

  test("ranks a prefix match above a longer incidental match", () => {
    const hits = filterIndex(index, "zone");
    assert.equal(hits[0]?.title, "zone");
  });

  test("an empty query returns nothing rather than everything", () => {
    assert.equal(filterIndex(index, "   ").length, 0);
  });

  test("caps results so the dropdown stays usable", () => {
    assert.ok(filterIndex(index, "e").length <= 20);
  });
});
