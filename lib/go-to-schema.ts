import type { GoField, GoStruct } from "./go-struct-parser.ts";

export type JsonSchema = Record<string, unknown>;

/**
 * Go field name to wire key. LEAP keeps Go PascalCase on the wire for every
 * field except the hyperreference, which serialises as lowercase `href`.
 */
export function wireKey(goFieldName: string): string {
  return goFieldName === "Href" ? "href" : goFieldName;
}

/** ISO 8601 duration, the form LEAP uses for FadeTime and DelayTime. */
const TIMESPAN_PATTERN =
  "^P(?:\\d+D)?(?:T(?:\\d+H)?(?:\\d+M)?(?:\\d+(?:\\.\\d+)?S)?)?$";

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
 * An embedded non-pointer `HyperReference` flattens to a single `href` string,
 * matching the wire format. A `*HyperReference` field stays a nested object.
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
    !field.optional &&
    !field.array
  );
}
