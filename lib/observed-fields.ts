import { existsSync, readFileSync } from "node:fs";
import { parse } from "yaml";
import { templatePath } from "./platform-matrix.ts";

export type SchemaNode = Record<string, unknown>;

/** A field seen in a captured body that its schema does not declare. */
export type FieldGap = {
  schema: string;
  field: string;
  /** Corpus labels the field was seen in, so the evidence is at hand. */
  corpora: string[];
  /** How many instances of the schema carried it. */
  instances: number;
};

function refName(node: unknown): string | null {
  const ref = (node as SchemaNode | null)?.$ref;
  return typeof ref === "string" ? (ref.split("/").pop() as string) : null;
}

/**
 * Every property a schema accepts, including those it composes in.
 *
 * The composition step is the whole difficulty. `Device` declares 25
 * properties and inherits eight more -- `href`, `Name`, `SerialNumber`,
 * `DeviceType` among them -- through an `allOf` against `DeviceBase` and
 * `DeviceMiniDefinitionForMasterDeviceList`, a deliberate flattening of two
 * anonymous Go embeds. A check that reads `properties` alone reports all
 * eight as undeclared and is wrong about every one.
 */
export function declaredProperties(
  schemas: Record<string, SchemaNode>,
  name: string | null,
  depth = 0,
): Record<string, unknown> {
  if (!name || depth > 6) return {};
  const schema = schemas[name];
  if (!schema) return {};

  let declared: Record<string, unknown> = {
    ...((schema.properties as Record<string, unknown>) ?? {}),
  };
  for (const branch of ["allOf", "anyOf", "oneOf"] as const)
    for (const sub of (schema[branch] as SchemaNode[] | undefined) ?? [])
      declared = {
        ...declaredProperties(schemas, refName(sub), depth + 1),
        ...((sub.properties as Record<string, unknown>) ?? {}),
        ...declared,
      };
  return declared;
}

/**
 * Fields the hardware sent that this reference does not describe.
 *
 * The conformance suite validates captured bodies *against* the schemas, and
 * JSON Schema permits undeclared properties, so a schema missing a field
 * passes every test while being incomplete. This is the check in the other
 * direction.
 */
export function findFieldGaps(options?: {
  bundle?: string;
  manifest?: string;
}): FieldGap[] {
  const doc = parse(
    readFileSync(options?.bundle ?? "dist/openapi.yaml", "utf8"),
  ) as {
    paths: Record<string, SchemaNode>;
    components: { schemas: Record<string, SchemaNode> };
  };
  const schemas = doc.components.schemas;

  const gaps = new Map<string, { corpora: Set<string>; instances: number }>();

  const walk = (
    name: string | null,
    value: unknown,
    corpus: string,
    depth = 0,
  ): void => {
    if (!name || depth > 3 || !value || typeof value !== "object") return;
    const schema = schemas[name];

    if (schema?.type === "array") {
      const element = refName(schema.items);
      for (const item of Array.isArray(value) ? value : [])
        walk(element, item, corpus, depth + 1);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(name, item, corpus, depth + 1);
      return;
    }

    const declared = declaredProperties(schemas, name);
    if (Object.keys(declared).length === 0) return;

    for (const [field, child] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (!(field in declared)) {
        const key = `${name}.${field}`;
        const entry = gaps.get(key) ?? { corpora: new Set(), instances: 0 };
        entry.corpora.add(corpus);
        entry.instances += 1;
        gaps.set(key, entry);
        continue;
      }
      const childName = refName(declared[field]);
      if (childName && child && typeof child === "object")
        walk(childName, child, corpus, depth + 1);
    }
  };

  const manifest: { label: string; to: string }[] = existsSync(
    options?.manifest ?? "captures.json",
  )
    ? JSON.parse(readFileSync(options?.manifest ?? "captures.json", "utf8"))
    : [];

  for (const { label, to } of manifest) {
    if (!existsSync(to)) continue;
    const probes: Record<string, { status: string; body?: unknown }> =
      JSON.parse(readFileSync(to, "utf8"));
    for (const [concrete, result] of Object.entries(probes)) {
      if (!result.status?.startsWith("200") || !result.body) continue;
      const item = doc.paths[templatePath(concrete)];
      if (!item) continue;
      const get = item.get as SchemaNode | undefined;
      const responses = get?.responses as
        | Record<string, SchemaNode>
        | undefined;
      const content = responses?.["200"]?.content as
        | Record<string, SchemaNode>
        | undefined;
      const name = refName(content?.["application/json"]?.schema);
      if (!name) continue;

      const wrapper = Object.keys(result.body as object)[0];
      if (!wrapper) continue;
      walk(name, (result.body as Record<string, unknown>)[wrapper], label);
    }
  }

  return [...gaps.entries()]
    .map(([key, entry]) => {
      const dot = key.lastIndexOf(".");
      return {
        schema: key.slice(0, dot),
        field: key.slice(dot + 1),
        corpora: [...entry.corpora].sort(),
        instances: entry.instances,
      };
    })
    .sort((a, b) => a.schema.localeCompare(b.schema));
}
