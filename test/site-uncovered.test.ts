import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { describe } from "node:test";
import { parse } from "yaml";
import { disambiguatePath } from "../lib/route-to-path.ts";
import { buildModel } from "../lib/site/model.ts";
import {
  classifyRoutes,
  readRoutes,
  summarize,
} from "../lib/site/uncovered.ts";

describe("uncovered firmware routes", () => {
  const doc = parse(readFileSync("dist/openapi.yaml", "utf8")) as {
    paths: Record<string, Record<string, unknown>>;
  };
  // The refined tier alone, as tools/derive-unverified.ts does: the bundle now
  // also carries the import, and counting that as covered would classify the
  // very routes it imported as no longer absent.
  const bundledPaths = new Set(
    Object.entries(doc.paths)
      .filter(([, item]) => item["x-leap-verified"] !== false)
      .map(([path]) => path),
  );
  const absent = classifyRoutes({ bundledPaths });
  const summary = summarize(absent);

  test("accounts for every route the extraction recovered", () => {
    const total = readRoutes().length;
    const covered = total - absent.length;
    assert.equal(total, 410);
    assert.equal(absent.length, 228, "the README's own count");
    assert.equal(
      covered,
      182,
      "182 firmware routes are refined under their own path",
    );
  });

  test("the five proven mangles classify as represented, not missing", () => {
    // These are the only ground truth available: captures confirmed the
    // slashed form for each, and the bundle documents them under it.
    const corrected = absent
      .filter((r) => r.absence === "represented-corrected")
      .map((r) => r.path)
      .sort();
    assert.deepEqual(corrected, [
      // The concatenation is not always in the leading segment: this one is
      // /device/{id}/buttongroup/expanded, hand-authored in the refined tree.
      "/device/{deviceId}/buttongroupexpanded",
      "/devicestatus",
      "/devicestatus/deviceheard",
      "/occupancygroupstatus",
      "/systemaway",
      "/timeclockstatus",
    ]);
  });

  test("every xid twin is represented, whether its id form is refined or imported", () => {
    // Importing both forms would put two paths differing only in a parameter
    // name into the document -- forbidden, and a hard error in redocly.yaml.
    assert.equal(summary["represented-xid-twin"], 8);
    const idForms = new Set(
      readRoutes().map((r) =>
        disambiguatePath(r.path.replaceAll("{xid}", "{id}")),
      ),
    );
    for (const route of absent.filter(
      (r) => r.absence === "represented-xid-twin",
    ))
      assert.ok(
        idForms.has(route.path.replaceAll("Xid}", "Id}")),
        `${route.path} claims an {id} twin that does not exist`,
      );
  });

  test("no imported path collides with another only by parameter name", () => {
    const imported = JSON.parse(
      readFileSync("spec/unverified-paths.json", "utf8"),
    ).paths as string[];
    const all = new Set([...imported, ...bundledPaths]);
    for (const path of all)
      if (/\{[a-z]+Xid\}/.test(path))
        assert.ok(
          !all.has(path.replaceAll("Xid}", "Id}")),
          `${path} and its {id} twin are both in the document`,
        );
  });

  test("a path in doubt always offers its slashed reading, and never asserts it", () => {
    const inDoubt = absent.filter(
      (r) => r.absence === "uncovered-path-in-doubt",
    );
    assert.ok(inDoubt.length > 0);
    for (const route of inDoubt) {
      assert.ok(
        route.slashedReading,
        `${route.path} has no alternative reading`,
      );
      assert.ok(
        !bundledPaths.has(route.slashedReading as string),
        "if the slashed form were bundled this would be represented-corrected",
      );
    }
  });

  test("a route taken at face value offers no alternative reading", () => {
    for (const route of absent.filter((r) => r.absence === "uncovered"))
      assert.equal(route.slashedReading, null);
  });

  test("classification is exhaustive", () => {
    const counted =
      summary.uncovered +
      summary["uncovered-path-in-doubt"] +
      summary["represented-corrected"] +
      summary["represented-xid-twin"];
    assert.equal(counted, absent.length);
  });

  test("no absent route is silently also bundled", () => {
    for (const route of absent)
      assert.ok(
        !bundledPaths.has(route.path),
        `${route.path} is bundled and must not be listed as absent`,
      );
  });
});

describe("the coverage page states it", () => {
  const model = buildModel();
  const html = readFileSync("site/coverage/index.html", "utf8");

  test("reports the extraction's real total, not a derived sum", () => {
    // bundledPaths.size + absent overstates it: 29 bundled paths have no
    // firmware route behind them at all.
    assert.match(html, /extraction recovered 410 route templates/);
    assert.ok(!html.includes("recovered 439"));
  });

  test("lists both kinds of absence separately", () => {
    assert.match(html, /Imported, unverified — 163 paths, 80 schemas/);
    assert.match(html, /Not represented — 51 paths/);
    assert.match(html, /The paths in doubt · 51/);
  });

  test("says plainly that representation is not verification", () => {
    assert.match(html, /representation is not\s+verification/);
    assert.match(html, /No capture has exercised them/);
    assert.ok(model.resources.length > 0);
  });
});
