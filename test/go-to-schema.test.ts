import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { parseGoStruct } from "../lib/go-struct-parser.ts";
import { mapFieldType, structToSchema, wireKey } from "../lib/go-to-schema.ts";

const defined = new Set(["Zone", "ZoneCategory", "HyperReference", "Parameter"]);

describe("wireKey", () => {
  test("Href is the only lowercased key", () => {
    assert.equal(wireKey("Href"), "href");
    assert.equal(wireKey("Name"), "Name");
    assert.equal(wireKey("XID"), "XID");
  });
});

describe("mapFieldType", () => {
  const f = (type: string, optional = false, array = false) => ({
    name: "F",
    type,
    optional,
    array,
  });

  test("maps primitives with bounds", () => {
    assert.deepEqual(mapFieldType(f("bool"), defined), { type: "boolean" });
    assert.deepEqual(mapFieldType(f("float64"), defined), { type: "number" });
    assert.deepEqual(mapFieldType(f("uint8"), defined), {
      type: "integer",
      minimum: 0,
      maximum: 255,
    });
  });

  test("maps Timespan to an ISO 8601 duration string", () => {
    const s = mapFieldType(f("lutcommon.Timespan"), defined);
    assert.equal(s.type, "string");
    assert.equal(s.example, "PT2S");
    assert.ok(typeof s.pattern === "string");
  });

  test("maps json.RawMessage to an unconstrained schema", () => {
    assert.deepEqual(mapFieldType(f("json.RawMessage"), defined), {});
  });

  test("maps time.Month to a bounded integer", () => {
    assert.deepEqual(mapFieldType(f("time.Month"), defined), {
      type: "integer",
      minimum: 1,
      maximum: 12,
    });
  });

  test("maps a defined leapobj type to a $ref", () => {
    assert.deepEqual(mapFieldType(f("leapobj.ZoneCategory"), defined), {
      $ref: "#/components/schemas/ZoneCategory",
    });
  });

  test("maps an undefined leapobj type to an open string with a TODO marker", () => {
    const s = mapFieldType(f("leapobj.ZoneType"), defined);
    assert.equal(s.type, "string");
    assert.match(String(s.description), /TODO\(enum\)/);
  });

  test("wraps arrays", () => {
    assert.deepEqual(mapFieldType(f("leapobj.Parameter", false, true), defined), {
      type: "array",
      items: { $ref: "#/components/schemas/Parameter" },
    });
  });
});

describe("structToSchema", () => {
  test("flattens an embedded HyperReference to an href string", () => {
    const s = structToSchema(
      parseGoStruct(
        "Zone",
        [
          "type leapobj.Zone struct {",
          "    HyperReference leapobj.HyperReference",
          "    Name       string",
          "}",
        ].join("\n"),
      ),
      defined,
    );
    const props = s.properties as Record<string, JsonSchemaLike>;
    assert.deepEqual(props.href, { type: "string" });
    assert.ok(!("HyperReference" in props));
  });

  test("keeps a pointer HyperReference as a nested ref", () => {
    const s = structToSchema(
      parseGoStruct(
        "Zone",
        [
          "type leapobj.Zone struct {",
          "    AssociatedArea *leapobj.HyperReference",
          "}",
        ].join("\n"),
      ),
      defined,
    );
    const props = s.properties as Record<string, JsonSchemaLike>;
    assert.deepEqual(props.AssociatedArea, {
      $ref: "#/components/schemas/HyperReference",
    });
  });

  test("required contains only non-pointer, non-array, non-href fields", () => {
    const s = structToSchema(
      parseGoStruct(
        "Zone",
        [
          "type leapobj.Zone struct {",
          "    HyperReference leapobj.HyperReference",
          "    XID        string",
          "    Name       string",
          "    Category   *leapobj.ZoneCategory",
          "    Tags       []string",
          "}",
        ].join("\n"),
      ),
      defined,
    );
    assert.deepEqual(s.required, ["XID", "Name"]);
  });

  test("omits required entirely when nothing is required", () => {
    const s = structToSchema(
      parseGoStruct("E", "type leapobj.E struct {\n    A *string\n}"),
      defined,
    );
    assert.ok(!("required" in s));
  });
});

type JsonSchemaLike = Record<string, unknown>;
