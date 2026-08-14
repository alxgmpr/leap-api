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
    const html = readFileSync("site/index.html", "utf8");
    for (const op of operations)
      for (const callout of calloutsFor(op)) {
        assert.ok(
          callout.href.startsWith("#"),
          `${callout.href} is not an in-page anchor`,
        );
        assert.ok(
          html.includes(`id="${callout.href.slice(1)}"`),
          `${callout.href} points at an anchor nothing renders`,
        );
      }
  });
});
