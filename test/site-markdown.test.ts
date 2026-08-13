import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { describe } from "node:test";
import { parse } from "yaml";
import {
  renderMarkdown,
  splitInjectedTable,
} from "../lib/site/render/markdown.ts";

describe("description markdown", () => {
  test("renders tables, code and emphasis", () => {
    const html = renderMarkdown(
      "Some **bold** and `code`.\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n",
    );
    assert.match(html, /<strong>bold<\/strong>/);
    assert.match(html, /<code>code<\/code>/);
    assert.match(html, /<table>/);
  });

  test("emits no heading ids, so an embedded description cannot collide with the page", () => {
    const html = renderMarkdown("## CommandType -> parameter field\n");
    assert.match(html, /<h2>/);
    assert.ok(!html.includes("id="));
  });

  test("splits the injected platform table off the authored prose", () => {
    const { prose, injected } = splitInjectedTable(
      "Send a command to a zone.\n\n**Platform availability**\n\n| Platform | Status |\n| --- | --- |\n| ra3 | 200 OK |",
    );
    assert.equal(prose, "Send a command to a zone.");
    assert.match(injected ?? "", /Platform availability/);
  });

  test("leaves a description with no injected table alone", () => {
    const { prose, injected } = splitInjectedTable("Just prose.");
    assert.equal(prose, "Just prose.");
    assert.equal(injected, null);
  });

  test("a description that is only the injected table yields empty prose", () => {
    const { prose } = splitInjectedTable(
      "**Platform availability**\n\n| Platform | Status |\n| --- | --- |\n| ra3 | 200 OK |",
    );
    assert.equal(prose, "");
  });

  test("the real bundle's descriptions split cleanly", () => {
    const doc = parse(readFileSync("dist/openapi.yaml", "utf8")) as {
      paths: Record<
        string,
        Record<
          string,
          { description?: string; "x-leap-platforms"?: unknown } | undefined
        >
      >;
    };
    let split = 0;
    let injectedByBundle = 0;
    for (const item of Object.values(doc.paths))
      for (const operation of Object.values(item)) {
        if (!operation || typeof operation !== "object") continue;
        if (operation["x-leap-platforms"]) injectedByBundle += 1;
        const description = operation.description;
        if (typeof description !== "string") continue;
        const { prose, injected } = splitInjectedTable(description);
        if (injected) split += 1;
        assert.ok(
          !prose.includes("**Platform availability**"),
          "no injected table may survive into the prose half",
        );
      }
    // tools/bundle.ts injects exactly where it sets x-leap-platforms, so the
    // two counts must agree -- a drift means the marker or the injection moved.
    assert.equal(split, injectedByBundle);
    assert.ok(split > 0);
  });
});
