import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { buildModel } from "../lib/site/model.ts";

describe("site model", () => {
  const model = buildModel();

  test("groups every bundled path under a resource", () => {
    const urls = model.resources.flatMap((r) => r.operations.map((o) => o.url));
    assert.equal(new Set(urls).size, 211);
    assert.ok(model.resources.some((r) => r.name === "zone"));
  });

  test("leads with CommuniqueType", () => {
    const zone = model.resources.find((r) => r.name === "zone");
    const status = zone?.operations.find((o) => o.url === "/zone/status");
    assert.equal(status?.communiqueType, "ReadRequest");
    assert.equal(status?.subscribable, true);
    assert.equal(status?.eventSchema, "ZoneStatus");
  });

  test("keeps a subscribe-only route, which no HTTP verb would carry", () => {
    const device = model.resources.find((r) => r.name === "device");
    const heard = device?.operations.find(
      (o) => o.url === "/device/status/deviceheard",
    );
    assert.ok(heard, "the SUBSCRIBE-only route must not be dropped");
    assert.equal(heard.communiqueType, "SubscribeRequest");
    assert.equal(heard.subscribable, true);
    assert.equal(heard.eventSchema, "DeviceStatus");
  });

  test("attaches a captured 200 only to the CommuniqueType the probes sent", () => {
    // Every corpus sent ReadRequest and nothing else, so a captured body is
    // evidence for the read alone -- hanging one on a write would label that
    // write with a read's answer.
    for (const resource of model.resources)
      for (const operation of resource.operations)
        if (operation.communiqueType !== "ReadRequest")
          assert.equal(
            operation.responses.length,
            0,
            `${operation.communiqueType} ${operation.url} carries a read's captured answer`,
          );
  });

  test("attaches a captured response body, already wrapped", () => {
    const zone = model.resources.find((r) => r.name === "zone");
    const status = zone?.operations.find((o) => o.url === "/zone/status");
    const ok = status?.responses.find((f) =>
      f.Header.StatusCode?.startsWith("200"),
    );
    assert.equal(ok?.fidelity, "captured-body");
    assert.deepEqual(Object.keys(ok?.Body ?? {}), ["ZoneStatuses"]);
  });

  test("every operation carries a provenance verdict", () => {
    for (const resource of model.resources)
      for (const operation of resource.operations)
        assert.ok(
          operation.provenance.verdict,
          `${operation.url} has no verdict`,
        );
  });

  test("every frame carries a fidelity level", () => {
    for (const resource of model.resources)
      for (const operation of resource.operations)
        for (const frame of [operation.request, ...operation.responses])
          assert.ok(frame.fidelity, `${operation.url} has an ungraded frame`);
  });

  test("loads the five narrative docs", () => {
    assert.deepEqual(model.docs.map((d) => d.slug).sort(), [
      "discovery",
      "mapping",
      "platforms",
      "protocol",
      "subscriptions",
    ]);
  });

  test("loads the frame logs used by the timelines", () => {
    const pushProbe = model.frameLogs.find((l) => l.id === "push-probe");
    assert.ok(pushProbe);
    assert.ok(pushProbe.frames.some((f) => f.fidelity === "captured-frame"));
  });

  test("carries the command table and the coverage report", () => {
    assert.ok(model.commandTable.length > 0);
    assert.equal(model.coverage.probedNotInSpec.length, 0);
  });
});
