import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { classifyField, classifyOperation } from "../lib/site/provenance.ts";

describe("provenance", () => {
  test("a 200 anywhere is confirmed on hardware", () => {
    const p = classifyOperation({
      url: "/zone/status",
      observations: [
        { corpus: "ra3", status: "200 OK" },
        { corpus: "caseta", status: "404 NotFound" },
      ],
    });
    assert.equal(p.verdict, "confirmed");
    assert.equal(p.observations.length, 2);
  });

  test("observed but never 200 is refused", () => {
    const p = classifyOperation({
      url: "/zone",
      observations: [{ corpus: "ra3", status: "405 MethodNotAllowed" }],
    });
    assert.equal(p.verdict, "refused");
  });

  test("a command processor is app RE even though probes refused it", () => {
    const p = classifyOperation({
      url: "/zone/{zoneId}/commandprocessor",
      observations: [{ corpus: "ra3", status: "400 BadRequest" }],
    });
    assert.equal(p.verdict, "app-re");
    assert.equal(p.observations.length, 1, "refusals are still shown");
  });

  test("an unobserved path with a TODO marker is not established", () => {
    const p = classifyOperation({
      url: "/zone/daylightinggainsettings",
      description: "TODO(response): no responseType recovered",
      observations: [],
    });
    assert.equal(p.verdict, "not-established");
  });

  test("an unobserved path with no marker was never asked", () => {
    const p = classifyOperation({ url: "/curve/1", observations: [] });
    assert.equal(p.verdict, "never-asked");
  });

  test("a field with observed values is confirmed", () => {
    assert.equal(
      classifyField({ type: "string", "x-observed-values": ["Good"] }),
      "confirmed",
    );
  });

  test("a field with a TODO marker is not established", () => {
    assert.equal(
      classifyField({
        type: "string",
        description: "TODO(enum): members of MaxWattageType were not recovered",
      }),
      "not-established",
    );
  });

  test("an open TODO outranks observed values on the same field", () => {
    assert.equal(
      classifyField({
        type: "string",
        description:
          "TODO(enum): members of InstanceStrategy were not recovered",
        "x-observed-values": ["Custom"],
      }),
      "not-established",
      "seeing a value is not the same as bounding the set",
    );
  });

  test("a plain firmware-extracted field is firmware", () => {
    assert.equal(classifyField({ type: "integer" }), "firmware");
    assert.equal(classifyField({ enum: ["Enabled", "Disabled"] }), "firmware");
  });
});
