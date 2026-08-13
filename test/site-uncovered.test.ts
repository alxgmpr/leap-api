import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { describe } from "node:test";
import { parse } from "yaml";
import { buildModel } from "../lib/site/model.ts";
import {
  classifyRoutes,
  readRoutes,
  summarize,
} from "../lib/site/uncovered.ts";

describe("uncovered firmware routes", () => {
  const doc = parse(readFileSync("dist/openapi.yaml", "utf8")) as {
    paths: Record<string, unknown>;
  };
  const bundledPaths = new Set(Object.keys(doc.paths));
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
      "182 firmware routes are bundled under their own path",
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
      "/devicestatus",
      "/devicestatus/deviceheard",
      "/occupancygroupstatus",
      "/systemaway",
      "/timeclockstatus",
    ]);
  });

  test("the four xid twins classify as represented", () => {
    assert.equal(summary["represented-xid-twin"], 4);
    for (const route of absent.filter(
      (r) => r.absence === "represented-xid-twin",
    ))
      assert.ok(
        bundledPaths.has(route.path.replaceAll("Xid}", "Id}")),
        `${route.path} claims an {id} twin that is not bundled`,
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
    assert.match(html, /path taken at face value · 168/);
    assert.match(html, /the path itself is in doubt · 51/);
  });

  test("asserts no shape for anything it does not document", () => {
    assert.match(html, /No shape, status or platform is asserted/);
    assert.ok(model.resources.length > 0);
  });
});
