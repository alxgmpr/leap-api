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
    const c = computeCoverage();
    assert.ok(c.todoEnums <= 118);
    assert.ok(c.todoResponses <= 249);
  });
});
