import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { describe } from "node:test";
import { parse } from "yaml";

const INDEX = "spec/components/schemas/_generated/_index.json";

describe("generated schemas", () => {
  test("one file per vendored type", () => {
    const types = JSON.parse(readFileSync("vendor/leap-types.json", "utf8"));
    const index = JSON.parse(readFileSync(INDEX, "utf8"));
    assert.equal(index.generated.length, Object.keys(types).length);
  });

  test("records the 118 unrecovered enums", () => {
    const index = JSON.parse(readFileSync(INDEX, "utf8"));
    assert.equal(index.todoEnums.length, 118);
    assert.ok(index.todoEnums.includes("EnabledState"));
    assert.ok(index.todoEnums.includes("CommandType"));
  });

  test("Zone matches the observed wire shape", () => {
    const zone = parse(
      readFileSync("spec/components/schemas/_generated/Zone.yaml", "utf8"),
    );
    assert.equal(zone.type, "object");
    assert.deepEqual(zone.properties.href, { type: "string" });
    assert.deepEqual(zone.properties.AssociatedArea, {
      $ref: "#/components/schemas/HyperReference",
    });
    assert.ok(zone.required.includes("Name"));
    assert.ok(zone.required.includes("XID"));
  });

  test("Command is flat with CommandType required and many optional parameter fields", () => {
    const cmd = parse(
      readFileSync("spec/components/schemas/_generated/Command.yaml", "utf8"),
    );
    assert.deepEqual(cmd.required, ["CommandType"]);
    assert.ok(!("oneOf" in cmd));
    const paramFields = Object.keys(cmd.properties).filter((k) =>
      k.endsWith("Parameters"),
    );
    assert.ok(
      paramFields.length >= 50,
      `expected >=50 parameter fields, got ${paramFields.length}`,
    );
    assert.ok("DimmedLevelParameters" in cmd.properties);
    assert.ok(
      "IgnoreLevelAndTurnOn" in
        parse(
          readFileSync(
            "spec/components/schemas/_generated/DimmedLevelParameters.yaml",
            "utf8",
          ),
        ).properties,
    );
  });
});
