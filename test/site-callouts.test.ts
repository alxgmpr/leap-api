import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { describe } from "node:test";
import { calloutsFor } from "../lib/site/callouts.ts";
import { buildModel } from "../lib/site/model.ts";

describe("callouts", () => {
  const model = buildModel();
  const operations = model.resources.flatMap((r) => r.operations);
  const find = (url: string) => operations.find((o) => o.url === url);

  test("warns that 102 is not terminal, where 102 was actually seen", () => {
    const op = find("/firmwareimage/{firmwareimageId}");
    assert.ok(op);
    const texts = calloutsFor(op).map((c) => c.text);
    assert.ok(texts.some((t) => t.includes("102 is not terminal")));
  });

  test("warns about untagged auto-subscribe pushes on deviceheard", () => {
    const op = find("/device/status/deviceheard");
    assert.ok(op);
    assert.ok(
      calloutsFor(op).some((c) => c.text.includes("untagged")),
      "a client keyed on ClientTag silently drops these",
    );
  });

  test("warns about ClientTag reuse on every subscribable operation", () => {
    for (const op of operations.filter((o) => o.subscribable))
      assert.ok(
        calloutsFor(op).some((c) => c.text.includes("recycle")),
        `${op.url} is subscribable but carries no ClientTag warning`,
      );
  });

  test("stays rare: an ordinary read gets none", () => {
    const op = find("/zone/status");
    assert.ok(op);
    assert.deepEqual(
      calloutsFor(op).filter((c) => !c.text.includes("recycle")),
      [],
    );
  });

  test("every callout anchor resolves in the built site", () => {
    // calloutsFor is only ever rendered onto a resource page, one directory
    // below the docs/ pages it links into -- so every href here must cross
    // back up via "../docs/<slug>.html", not a bare "#anchor" that would
    // only resolve by accident, and the fragment must be a real id on that
    // doc's own page (Task 6 gave every doc its own page).
    const pageCache = new Map<string, string>();
    for (const op of operations)
      for (const callout of calloutsFor(op)) {
        assert.match(
          callout.href,
          /^\.\.\/docs\/[\w-]+\.html/,
          `${callout.href} is not a cross-page link into docs/`,
        );
        const [target, fragment] = callout.href.slice("../".length).split("#");
        const html =
          pageCache.get(target as string) ??
          readFileSync(`site/${target}`, "utf8");
        pageCache.set(target as string, html);
        if (fragment !== undefined)
          assert.ok(
            html.includes(`id="${fragment}"`),
            `${callout.href} points at an anchor nothing renders`,
          );
      }
  });
});
