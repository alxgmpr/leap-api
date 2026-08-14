import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { buildModel } from "../lib/site/model.ts";
import { renderSchemaPage } from "../lib/site/render/schema.ts";

describe("cross-references go through the href module", () => {
  const model = buildModel();

  test("no renderer hand-writes a schema anchor", async () => {
    const sources = [
      "lib/site/render/schema.ts",
      "lib/site/render/resource.ts",
      "lib/site/render/recipes.ts",
      "lib/site/render/home.ts",
      "lib/site/render/highlight.ts",
    ];
    const { readFileSync } = await import("node:fs");
    for (const path of sources) {
      const src = readFileSync(path, "utf8");
      assert.ok(
        !/href="#(resource|schema|doc|recipe)-\$\{/.test(src),
        `${path} still builds an anchor by hand`,
      );
    }
  });

  test("rendered output still contains the same references", () => {
    // Schema pages now live one directory deep, so a resource reference
    // resolves through ROOT_NESTED to a page URL, not a bare anchor.
    const zone = model.schemas.find((s) => s.name === "ZoneStatus");
    if (!zone) throw new Error("ZoneStatus missing from the model");
    const section = renderSchemaPage(model, zone);
    assert.match(section.html, /href="\.\.\/index\.html#resource-/);
  });
});
