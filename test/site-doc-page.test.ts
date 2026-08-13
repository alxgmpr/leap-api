import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { buildModel } from "../lib/site/model.ts";
import { headingAnchors, renderDocPages } from "../lib/site/render/docs.ts";

describe("narrative doc pages", () => {
  const model = buildModel();
  const pages = renderDocPages(model);

  test("emits one page per narrative doc", () => {
    assert.equal(pages.length, 5);
    assert.ok(pages.some((p) => p.path === "docs/protocol/index.html"));
  });

  test("renders markdown to HTML", () => {
    const html =
      pages.find((p) => p.path === "docs/protocol/index.html")?.html ?? "";
    assert.match(html, /<h2 id="the-envelope">/);
    assert.match(html, /<table>/);
  });

  test("derives stable anchors from headings", () => {
    const anchors = headingAnchors(
      "# Title\n\n## The envelope\n\n### Status codes\n",
    );
    assert.deepEqual(anchors, [
      { text: "Title", id: "title" },
      { text: "The envelope", id: "the-envelope" },
      { text: "Status codes", id: "status-codes" },
    ]);
  });

  test("ignores headings inside fenced code blocks", () => {
    const anchors = headingAnchors(
      "# Real\n\n```bash\n# not a heading\n```\n\n## Also real\n",
    );
    assert.deepEqual(
      anchors.map((a) => a.id),
      ["real", "also-real"],
    );
  });

  test("builds a table of contents whose links resolve to rendered ids", () => {
    const html =
      pages.find((p) => p.path === "docs/subscriptions/index.html")?.html ?? "";
    assert.match(html, /class="toc"/);
    const targets = [...html.matchAll(/<a href="#([^"]+)"/g)].map((m) => m[1]);
    assert.ok(targets.length > 5);
    for (const id of targets)
      assert.ok(
        html.includes(`id="${id}"`),
        `table of contents links to #${id}, which no heading renders`,
      );
  });
});
