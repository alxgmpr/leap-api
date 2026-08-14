import assert from "node:assert/strict";
import test, { describe } from "node:test";
import {
  classifyNoFixture,
  groupNoFixture,
  NO_FIXTURE_REASONS,
} from "../lib/site/no-fixture.ts";
import { computeCoverage } from "../tools/check-coverage.ts";

describe("no-200 path classification", () => {
  const paths = computeCoverage().specWithoutFixture;
  const keys = new Set(NO_FIXTURE_REASONS.map((r) => r.key));

  test("every no-fixture path maps to a declared reason", () => {
    for (const p of paths) {
      assert.ok(
        keys.has(classifyNoFixture(p)),
        `${p} classified to a known key`,
      );
    }
  });

  test("grouping partitions the whole list with no loss or overlap", () => {
    const grouped = groupNoFixture(paths);
    const total = grouped.reduce((n, g) => n + g.paths.length, 0);
    assert.equal(total, paths.length, "every path is in exactly one group");
    const flat = grouped.flatMap((g) => g.paths);
    assert.equal(new Set(flat).size, flat.length, "no path appears twice");
  });

  test("structural reasons can never be probed off the list", () => {
    // These four are pure route-design facts about the current bundle. If a
    // path family is added or renamed the counts move; the assertion is here
    // so that move is a conscious edit, not a silent drift.
    const byKey = Object.fromEntries(
      groupNoFixture(paths).map((g) => [g.reason.key, g.paths.length]),
    );
    assert.equal(byKey.paging, 10);
    assert.equal(byKey.commandprocessor, 10);
    assert.equal(byKey["query-action"], 7);
    assert.equal(byKey.pairing, 3);
    assert.equal(byKey["subscribe-only"], 1);
  });

  test("deviceheard is subscribe-only, not a missing read", () => {
    assert.equal(
      classifyNoFixture("/device/status/deviceheard"),
      "subscribe-only",
    );
  });

  test("a /preset/{id} assignment is a preset sub-resource, its collection is not", () => {
    assert.equal(
      classifyNoFixture("/preset/{presetId}/dimmedlevelassignment"),
      "preset-assignment",
    );
    // presetassignment/deprecated is the one non-{id} member of the family
    assert.equal(
      classifyNoFixture("/presetassignment/deprecated"),
      "preset-assignment",
    );
  });

  test("/service integrations and empty core features split apart", () => {
    assert.equal(
      classifyNoFixture("/service/sonoshousehold"),
      "service-integration",
    );
    assert.equal(
      classifyNoFixture("/zone/{zoneId}/zonescene"),
      "feature-not-configured",
    );
  });
});
