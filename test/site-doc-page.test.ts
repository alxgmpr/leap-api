import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { buildModel } from "../lib/site/model.ts";
import { headingAnchors, renderDocSections } from "../lib/site/render/docs.ts";

describe("narrative doc pages", () => {
  const model = buildModel();
  const sections = renderDocSections(model);

  test("emits one section per narrative doc", () => {
    assert.equal(sections.length, 5);
    assert.ok(sections.some((s) => s.id === "doc-protocol"));
  });

  test("renders markdown to HTML", () => {
    const html = sections.find((s) => s.id === "doc-protocol")?.html ?? "";
    // Headings demote one level in the single-page scroll: `##` renders h3.
    assert.match(html, /<h3 id="the-envelope">/);
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
    const html = sections.find((s) => s.id === "doc-subscriptions")?.html ?? "";
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
