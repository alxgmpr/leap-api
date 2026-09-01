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
    // 63 (2026-08-31): the firmware-binary enum pass resolved 13 markers
    // across 8 leapobj types (CCOLevel, ReceptacleLevel, FanSpeed,
    // ConnectedStatus, NetworkInterfaceConnectedStatus, MaxWattageType,
    // OccupancySensorSensitivity, OccupancyMode) by disassembling the RA3
    // leap-server functions that consume each value -- exhaustive switches
    // whose member strings the struct extraction had dropped. The remaining
    // 63 are not recoverable this way: their values are computed by other RA3
    // daemons (which carry no leapobj types) or the RF coprocessor, and are
    // absent as static strings from every available RA3 binary.
    // 58 (2026-09-01): the app-RE pass resolved 5 more markers across 4
    // leapobj types the firmware binary could not give (their values are
    // forwarded from other daemons, absent as static strings): ZoneLockState,
    // DiscoveryMechanism, PowerCycleDiscovery and
    // RemoteAddressingDeviceAccessibility, all enumerated in the decompiled
    // Lutron app (api-discovery.md), the same source as CommandType.
    const c = computeCoverage();
    assert.equal(c.todoEnums, 58);
    assert.equal(c.todoResponses, 140);
  });
});
