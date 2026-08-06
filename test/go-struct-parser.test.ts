import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { describe } from "node:test";
import { parseGoStruct } from "../lib/go-struct-parser.ts";

describe("parseGoStruct", () => {
  test("parses plain and pointer fields", () => {
    const src = [
      "type leapobj.Zone struct {",
      "    HyperReference leapobj.HyperReference",
      "    XID        string",
      "    Name       string",
      "    Category   *leapobj.ZoneCategory",
      "}",
    ].join("\n");
    const s = parseGoStruct("Zone", src);
    assert.equal(s.name, "Zone");
    assert.deepEqual(s.fields, [
      {
        name: "HyperReference",
        type: "leapobj.HyperReference",
        optional: false,
        array: false,
      },
      { name: "XID", type: "string", optional: false, array: false },
      { name: "Name", type: "string", optional: false, array: false },
      {
        name: "Category",
        type: "leapobj.ZoneCategory",
        optional: true,
        array: false,
      },
    ]);
  });

  test("parses slices, slices of pointers, and double pointers", () => {
    const src = [
      "type leapobj.X struct {",
      "    AvailableControlTypes []leapobj.ZoneType",
      "    Parameter  []*leapobj.Parameter",
      "    CurveDimming **leapobj.CurveDimming",
      "}",
    ].join("\n");
    const s = parseGoStruct("X", src);
    assert.deepEqual(s.fields, [
      {
        name: "AvailableControlTypes",
        type: "leapobj.ZoneType",
        optional: false,
        array: true,
      },
      {
        name: "Parameter",
        type: "leapobj.Parameter",
        optional: false,
        array: true,
      },
      {
        name: "CurveDimming",
        type: "leapobj.CurveDimming",
        optional: true,
        array: false,
      },
    ]);
  });

  test("parses qualified non-leapobj types", () => {
    const src = [
      "type leapobj.Y struct {",
      "    FadeTime   *lutcommon.Timespan",
      "    Raw        json.RawMessage",
      "    Month      time.Month",
      "}",
    ].join("\n");
    const s = parseGoStruct("Y", src);
    assert.deepEqual(
      s.fields.map((f) => f.type),
      ["lutcommon.Timespan", "json.RawMessage", "time.Month"],
    );
    assert.equal(s.fields[0].optional, true);
  });

  test("handles an empty struct", () => {
    const s = parseGoStruct("Empty", "type leapobj.Empty struct {\n}");
    assert.deepEqual(s.fields, []);
  });

  test("parses every type in the vendored corpus without loss", () => {
    const types: Record<string, string> = JSON.parse(
      readFileSync("vendor/leap-types.json", "utf8"),
    );
    let fieldCount = 0;
    for (const [name, src] of Object.entries(types)) {
      const s = parseGoStruct(name, src);
      fieldCount += s.fields.length;
      // Every non-empty body line must have produced a field.
      const bodyLines = src
        .split("\n")
        .slice(1)
        .map((l) => l.trim())
        .filter((l) => l !== "" && l !== "}");
      assert.equal(s.fields.length, bodyLines.length, `field loss in ${name}`);
    }
    assert.ok(fieldCount > 2000, `suspiciously few fields: ${fieldCount}`);
  });
});
