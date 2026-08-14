import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test, { describe } from "node:test";

describe("built site", () => {
  test("emits a home page", () => {
    assert.ok(existsSync("site/index.html"), "run `npm run build:site` first");
  });

  test("home page shows the envelope and the wrapper rule", () => {
    const html = readFileSync("site/index.html", "utf8");
    assert.match(html, /CommuniqueType/);
    assert.match(html, /Every payload is wrapped/i);
  });

  test("assets are copied and referenced relatively", () => {
    assert.ok(existsSync("site/assets/app.css"));
    const html = readFileSync("site/index.html", "utf8");
    assert.match(html, /href="assets\/app\.css"/);
    assert.ok(
      !html.includes('href="/assets'),
      "root-absolute paths break Pages subpaths",
    );
  });

  test("ships the model for the client-side enhancements", () => {
    assert.ok(existsSync("site/model.json"));
  });
});
