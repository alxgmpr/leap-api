/** One field of a Go struct, normalised for schema generation. */
export type GoField = {
  name: string;
  /** Base type with all pointer and slice markers stripped. */
  type: string;
  /** True if the field had an outer pointer — a nil-able, omittable field. */
  optional: boolean;
  /** True if the field was a slice. */
  array: boolean;
};

export type GoStruct = { name: string; fields: GoField[] };

const FIELD_RE = /^(\w+)\s+(.+)$/;

/**
 * Parse a Go struct definition as recovered from the firmware extraction.
 *
 * Type expressions observed in the corpus take the form
 * `*`* `[]`? `*`? qualifiedName — for example `*float64`, `[]*leapobj.Parameter`,
 * `**leapobj.CurveDimming`. Pointers at any depth mean the same thing for the
 * wire format: the field may be absent.
 */
export function parseGoStruct(name: string, src: string): GoStruct {
  const fields: GoField[] = [];

  for (const raw of src.split("\n").slice(1)) {
    const line = raw.trim();
    if (line === "" || line === "}") continue;

    const m = FIELD_RE.exec(line);
    if (!m) continue;

    const [, fieldName, typeExpr] = m;
    let t = typeExpr.trim();
    let optional = false;
    let array = false;

    while (t.startsWith("*")) {
      optional = true;
      t = t.slice(1);
    }
    if (t.startsWith("[]")) {
      array = true;
      t = t.slice(2);
    }
    // A slice of pointers is still just an array on the wire.
    while (t.startsWith("*")) t = t.slice(1);

    fields.push({ name: fieldName, type: t, optional, array });
  }

  return { name, fields };
}
