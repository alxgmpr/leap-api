import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { computeCoverage } from "../tools/check-coverage.ts";

describe("computeCoverage", () => {
  test("returns all four counts", () => {
    const c = computeCoverage();
    assert.ok(Array.isArray(c.probedNotInSpec));
    assert.ok(Array.isArray(c.specWithoutFixture));
    assert.equal(typeof c.todoEnums, "number");
    assert.equal(typeof c.todoResponses, "number");
  });

  test("zone paths are in the spec after Task 10", () => {
    const c = computeCoverage();
    assert.ok(!c.probedNotInSpec.includes("/zone/{zoneId}"));
  });

  test("markers start from the known extraction gaps", () => {
    // `<= 118` / `<= 249` were upper bounds loose enough to pass for almost
    // any value (the firmware extraction's own totals -- 118 unrecovered
    // enums, and an early, since-shrunk count of unresolved responses), so
    // this assertion did not actually track whether markers were being
    // resolved or silently reintroduced. Assert the current, exact counts
    // instead -- verified against `npm run coverage` on the bundled spec.
    // Update both numbers (and say why in the commit) whenever a marker is
    // deliberately resolved or a new one is deliberately introduced; if
    // either number changes unexpectedly, that's a regression to
    // investigate, not a constant to bump.
    const c = computeCoverage();
    assert.equal(c.todoEnums, 79);
    assert.equal(c.todoResponses, 157);
  });
});
