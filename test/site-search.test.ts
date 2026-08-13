import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { describe } from "node:test";
import { buildSearchIndex, filterIndex } from "../site-src/search-index.js";

describe("search", () => {
  const model = JSON.parse(readFileSync("site/model.json", "utf8"));
  const index = buildSearchIndex(model);

  test("indexes resources, operations, schemas and command types", () => {
    const kinds = new Set(index.map((e) => e.kind));
    assert.deepEqual([...kinds].sort(), [
      "command",
      "operation",
      "resource",
      "schema",
    ]);
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
