import type { GoField, GoStruct } from "./go-struct-parser.ts";

export type JsonSchema = Record<string, unknown>;

/**
 * Go field name to wire key. LEAP keeps Go PascalCase on the wire for every
 * field except the hyperreference, which serialises as lowercase `href`.
 */
export function wireKey(goFieldName: string): string {
  return goFieldName === "Href" ? "href" : goFieldName;
}

/**
 * ISO 8601 duration -- the mapping this generator uses for every
 * `lutcommon.Timespan` field, but NOT the form every such field actually
 * uses on the wire. Evidence, laid out plainly because it points two
 * directions at once:
 *
 * - The only evidence FOR the ISO 8601 form is app RE, not captured
 *   traffic: api-discovery.md (decompiled Android APK) states
 *   "FadeTime/DelayTime: ISO 8601 extended duration" with literal examples
 *   "PT2S", "PT0S". FadeTime/DelayTime are request-body-only fields
 *   (`DimmedLevelParameters` and siblings), and no CreateRequest/
 *   UpdateRequest body was ever captured during probing (see
 *   docs/mapping.md's "Commands" section),
 *   so this claim has never been checked against real traffic for the
 *   fields it's actually about.
 * - Every `lutcommon.Timespan` field this project HAS captured traffic for
 *   contradicts it. `Timestamp.Utc` ("0", "-7:00:00") and
 *   `TimeclockEventBase.AstronomicTimeOffset` ("0") are corrected locally
 *   in their own refined schema files (Timestamp.yaml,
 *   TimeclockEventBase.yaml). `CountdownTimer.Timeout` is also
 *   `lutcommon.Timespan` and has 11 captured Caseta values across
 *   `/zone/{id}/countdowntimer` (200 OK): "1:00:00", "4:00:00" x3,
 *   "2:00:00" x3, "3:00:00", "15:00" x2, "30:00" -- clock-format durations,
 *   not one of them ISO 8601 shaped. `CountdownTimer` is not yet refined
 *   (still only in `_generated/`), so this is not a shipped defect today,
 *   but whoever refines it next should not assume this pattern is right
 *   for `Timeout` -- fix it the same way `Timestamp.Utc` was fixed, not by
 *   trusting this default.
 *
 * In short: zero captured `lutcommon.Timespan` value anywhere in this
 * project's corpus is ISO 8601 shaped. This pattern is kept as the
 * generator default only because it is the sole evidence available for
 * FadeTime/DelayTime specifically (never contradicted because never
 * captured) -- not because it is confirmed correct, and not because it is
 * even the majority shape among fields this project can actually check.
 *
 * The `(?=.*\d)` lookahead requires at least one digit somewhere after `P`,
 * so the degenerate forms `P` and `PT` (all components absent) are
 * rejected -- neither is a valid ISO 8601 duration, but the un-anchored
 * version of this pattern accepted both.
 */
const TIMESPAN_PATTERN =
  "^P(?=.*\\d)(?:\\d+D)?(?:T(?:\\d+H)?(?:\\d+M)?(?:\\d+(?:\\.\\d+)?S)?)?$";

const PRIMITIVES: Record<string, JsonSchema> = {
  bool: { type: "boolean" },
  string: { type: "string" },
  float64: { type: "number" },
  int: { type: "integer" },
  int8: { type: "integer", minimum: -128, maximum: 127 },
  uint8: { type: "integer", minimum: 0, maximum: 255 },
  uint16: { type: "integer", minimum: 0, maximum: 65535 },
  uint32: { type: "integer", minimum: 0, maximum: 4294967295 },
  "json.Number": { type: "number" },
  "json.RawMessage": {},
  "time.Month": { type: "integer", minimum: 1, maximum: 12 },
  "lutcommon.Timespan": {
    type: "string",
    pattern: TIMESPAN_PATTERN,
    example: "PT2S",
  },
};

const LEAPOBJ = "leapobj.";

/** Map one parsed Go field to its JSON Schema, ignoring optionality. */
export function mapFieldType(
  field: GoField,
  definedTypes: Set<string>,
): JsonSchema {
  const base = baseSchema(field.type, definedTypes);
  return field.array ? { type: "array", items: base } : base;
}

function baseSchema(goType: string, definedTypes: Set<string>): JsonSchema {
  const primitive = PRIMITIVES[goType];
  if (primitive) return structuredClone(primitive);

  if (goType.startsWith(LEAPOBJ)) {
    const name = goType.slice(LEAPOBJ.length);
    if (definedTypes.has(name)) {
      return { $ref: `#/components/schemas/${name}` };
    }
    // Referenced but never defined in the extraction: an enum whose members
    // were not recovered. Ships as an open string until filled from probe
    // values and app RE.
    return {
      type: "string",
      description: `TODO(enum): members of ${name} were not recovered from the firmware extraction`,
    };
  }

  // Unknown qualified type — permissive rather than wrong.
  return { description: `TODO(type): unmapped Go type ${goType}` };
}

/**
 * Map a parsed struct to a JSON Schema object.
 *
 * Any embedded field named `HyperReference` flattens to a single `href` string,
 * matching the wire format (Go's encoding/json promotes embeds whether value or pointer).
 * Other fields stay nested per their type.
 */
export function structToSchema(
  s: GoStruct,
  definedTypes: Set<string>,
): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];

  for (const field of s.fields) {
    if (isEmbeddedHyperReference(field)) {
      properties.href = { type: "string" };
      continue;
    }

    properties[wireKey(field.name)] = mapFieldType(field, definedTypes);

    // A nil pointer is omitted; a nil slice is omitted. Neither is required.
    if (!field.optional && !field.array) required.push(wireKey(field.name));
  }

  const schema: JsonSchema = { type: "object", properties };
  if (required.length > 0) schema.required = required;
  return schema;
}

function isEmbeddedHyperReference(field: GoField): boolean {
  return (
    field.name === "HyperReference" &&
    field.type === `${LEAPOBJ}HyperReference` &&
    !field.array
  );
}
