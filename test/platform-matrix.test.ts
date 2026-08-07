import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { describe } from "node:test";
import {
  buildMatrix,
  renderMatrixTable,
  templatePath,
} from "../lib/platform-matrix.ts";

describe("templatePath", () => {
  test("collapses numeric ids to disambiguated placeholders", () => {
    assert.equal(templatePath("/zone/518"), "/zone/{zoneId}");
    assert.equal(templatePath("/zone/518/status"), "/zone/{zoneId}/status");
    assert.equal(
      templatePath("/device/1020/linknode/1022"),
      "/device/{deviceId}/linknode/{linknodeId}",
    );
  });

  test("leaves id-free paths alone", () => {
    assert.equal(templatePath("/zone/status"), "/zone/status");
    assert.equal(templatePath("/server"), "/server");
  });

  test("leaves non-numeric segments alone — they may be literal sub-resources, not ids", () => {
    // Explicit test to pin safe behavior and reject shape-based XIDs.
    // If a path contains /something/numeric, we template the numeric.
    // If a path contains /something/nonNumeric, we leave it alone.
    // We do NOT guess that non-numeric segments are XIDs, because that
    // would mangle /zone/status to /zone/{zoneXid}, which is wrong.
    assert.equal(templatePath("/zone/status"), "/zone/status");
    assert.equal(
      templatePath("/system/loadshedding/status"),
      "/system/loadshedding/status",
    );
    assert.equal(
      templatePath("/device/435/status"),
      "/device/{deviceId}/status",
    );
  });
});

describe("buildMatrix", () => {
  test("records each platform's observed status per template", () => {
    const m = buildMatrix({
      ra3: { "/zone": { status: "405 MethodNotAllowed" } },
      caseta: { "/zone": { status: "200 OK" } },
    });
    assert.deepEqual(m["/zone"], {
      ra3: "405 MethodNotAllowed",
      caseta: "200 OK",
    });
  });

  test("marks platforms that never probed a path", () => {
    const m = buildMatrix({
      ra3: { "/timeclockevent": { status: "200 OK" } },
      caseta: {},
    });
    assert.equal(m["/timeclockevent"].caseta, "not probed");
  });

  test("collapses many concrete instances into one template row", () => {
    const m = buildMatrix({
      ra3: {
        "/zone/1": { status: "200 OK" },
        "/zone/2": { status: "200 OK" },
      },
    });
    assert.deepEqual(Object.keys(m), ["/zone/{zoneId}"]);
  });

  test("prefers a success over a failure when instances disagree", () => {
    const m = buildMatrix({
      ra3: {
        "/zone/1": { status: "404 NotFound" },
        "/zone/2": { status: "200 OK" },
      },
    });
    assert.equal(m["/zone/{zoneId}"].ra3, "200 OK");
  });
});

describe("renderMatrixTable", () => {
  test("renders a markdown table", () => {
    const md = renderMatrixTable({ ra3: "200 OK", caseta: "not probed" });
    assert.match(md, /\| Platform \| Status \|/);
    assert.match(md, /\| ra3 \| 200 OK \|/);
    assert.match(md, /\| caseta \| not probed \|/);
  });
});

describe("the real fixtures", () => {
  test("known divergences are captured", () => {
    const m = buildMatrix({
      ra3: JSON.parse(readFileSync("fixtures/ra3.json", "utf8")),
      caseta: JSON.parse(readFileSync("fixtures/caseta.json", "utf8")),
    });
    assert.equal(m["/zone"].ra3, "405 MethodNotAllowed");
    assert.equal(m["/zone"].caseta, "200 OK");
    assert.equal(m["/device"].ra3, "204 NoContent");
    assert.equal(m["/device"].caseta, "200 OK");
    assert.equal(m["/system/loadshedding/status"].ra3, "200 OK");
  });
});
