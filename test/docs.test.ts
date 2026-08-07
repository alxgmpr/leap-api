import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test, { describe } from "node:test";

const REQUIRED = [
  "docs/protocol.md",
  "docs/mapping.md",
  "docs/subscriptions.md",
  "docs/platforms.md",
  "docs/discovery.md",
  "README.md",
];

describe("documentation", () => {
  for (const file of REQUIRED) {
    test(`${file} exists and has content`, () => {
      assert.ok(existsSync(file), `missing ${file}`);
      assert.ok(readFileSync(file, "utf8").length > 400, `${file} is a stub`);
    });
  }

  test("no unresolved placeholders in prose", () => {
    for (const file of REQUIRED) {
      const text = readFileSync(file, "utf8");
      assert.ok(!/\bTBD\b/.test(text), `${file} contains TBD`);
      assert.ok(!/\bFIXME\b/.test(text), `${file} contains FIXME`);
    }
  });

  test("README states the document is unofficial", () => {
    assert.match(readFileSync("README.md", "utf8"), /unofficial/i);
  });
});
