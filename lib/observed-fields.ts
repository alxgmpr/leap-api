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

/** How a schema's `required` list compares with what the wire actually sent. */
export type RequiredIssue = {
  schema: string;
  field: string;
  /** Instances of this schema observed across every corpus. */
  observed: number;
  /** Of those, how many carried the field. */
  present: number;
  corpora: string[];
  kind: /** Declared required, and absent from at least one observed instance. */
    | "false-claim"
    /** Declared required, and no instance of the schema was ever observed. */
    | "untested"
    /** Present in every observed instance but not declared required. */
    | "candidate";
};

type Options = { bundle?: string; manifest?: string };

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
 * Every field a schema requires, including through composition. Six schemas
 * inherit their `required` list this way, so the same trap applies here.
 *
 * `anyOf`/`oneOf` are deliberately excluded: a branch of an alternation
 * requires its fields only when that branch is the one that matched, so
 * folding them in would manufacture requirements the document never states.
 */
export function declaredRequired(
  schemas: Record<string, SchemaNode>,
  name: string | null,
  depth = 0,
): Set<string> {
  if (!name || depth > 6) return new Set();
  const schema = schemas[name];
  if (!schema) return new Set();

  const required = new Set<string>(
    Array.isArray(schema.required) ? (schema.required as string[]) : [],
  );
  for (const sub of (schema.allOf as SchemaNode[] | undefined) ?? []) {
    for (const field of declaredRequired(schemas, refName(sub), depth + 1))
      required.add(field);
    if (Array.isArray(sub.required))
      for (const field of sub.required as string[]) required.add(field);
  }
  return required;
}

type Instance = { corpus: string; value: Record<string, unknown> };

/**
 * Every captured object, keyed by the schema it was validated as.
 *
 * Shared by both checks below so they agree about what was observed; a
 * disagreement between them would be worse than either being absent.
 */
export function collectInstances(options?: Options): {
  schemas: Record<string, SchemaNode>;
  instances: Map<string, Instance[]>;
} {
  const doc = parse(
    readFileSync(options?.bundle ?? "dist/openapi.yaml", "utf8"),
  ) as {
    paths: Record<string, SchemaNode>;
    components: { schemas: Record<string, SchemaNode> };
  };
  const schemas = doc.components.schemas;
  const instances = new Map<string, Instance[]>();

  const walk = (
    name: string | null,
    value: unknown,
    corpus: string,
    depth = 0,
  ): void => {
    if (!name || depth > 3 || !value || typeof value !== "object") return;
    const schema = schemas[name];

    // A collection may be expressed as an alternation rather than a bare
    // array: `Buttons` is `oneOf` an array of Button or an empty object,
    // because RA3's read of /button returns a bare {}. Matching only
    // `type: array` walked each of Caseta's 40 buttons *as* a `Buttons`,
    // found no properties on it, and skipped all 40 silently -- so both
    // checks under-reported on every body shaped this way.
    const arrayBranch = Array.isArray(value)
      ? ((schema?.oneOf ?? schema?.anyOf) as SchemaNode[] | undefined)?.find(
          (branch) => branch.type === "array",
        )
      : undefined;
    const asArray = schema?.type === "array" ? schema : arrayBranch;

    if (asArray) {
      const element = refName(asArray.items);
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

    const record = value as Record<string, unknown>;
    instances.set(name, [
      ...(instances.get(name) ?? []),
      { corpus, value: record },
    ]);

    for (const [field, child] of Object.entries(record)) {
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

  return { schemas, instances };
}

/**
 * Fields the hardware sent that this reference does not describe.
 *
 * The conformance suite validates captured bodies *against* the schemas, and
 * JSON Schema permits undeclared properties, so a schema missing a field
 * passes every test while being incomplete. This is the check in the other
 * direction.
 */
export function findFieldGaps(options?: Options): FieldGap[] {
  const { schemas, instances } = collectInstances(options);
  const gaps = new Map<string, { corpora: Set<string>; instances: number }>();

  for (const [name, seen] of instances) {
    const declared = declaredProperties(schemas, name);
    for (const { corpus, value } of seen)
      for (const field of Object.keys(value)) {
        if (field in declared) continue;
        const key = `${name}.${field}`;
        const entry = gaps.get(key) ?? { corpora: new Set(), instances: 0 };
        entry.corpora.add(corpus);
        entry.instances += 1;
        gaps.set(key, entry);
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

/**
 * How every `required` claim stands up to the captures.
 *
 * Ajv already fails a body missing a required field, so `false-claim` should
 * stay empty and is an error if it is not. The two findings this adds are the
 * ones validation cannot make: a requirement no capture ever exercised, and a
 * field present in every observation that the document does not require.
 *
 * A `candidate` is not a defect. This project relaxes `required` on evidence
 * and does not tighten it on the mere absence of counter-evidence -- 56 of 56
 * is not proof of universality. They are listed for judgement, never applied.
 */
export function findRequiredIssues(
  options?: Options & { candidateThreshold?: number },
): RequiredIssue[] {
  const { schemas, instances } = collectInstances(options);
  const threshold = options?.candidateThreshold ?? 20;
  const issues: RequiredIssue[] = [];

  for (const name of Object.keys(schemas)) {
    const required = declaredRequired(schemas, name);
    const declared = declaredProperties(schemas, name);
    const seen = instances.get(name) ?? [];

    if (seen.length === 0) {
      for (const field of required)
        issues.push({
          schema: name,
          field,
          observed: 0,
          present: 0,
          corpora: [],
          kind: "untested",
        });
      continue;
    }

    const corpora = [...new Set(seen.map((i) => i.corpus))].sort();
    const count = (field: string) =>
      seen.filter((i) => i.value[field] !== undefined).length;

    for (const field of required) {
      const present = count(field);
      if (present < seen.length)
        issues.push({
          schema: name,
          field,
          observed: seen.length,
          present,
          corpora,
          kind: "false-claim",
        });
    }

    for (const field of Object.keys(declared)) {
      if (required.has(field)) continue;
      if (seen.length < threshold) continue;
      if (count(field) === seen.length)
        issues.push({
          schema: name,
          field,
          observed: seen.length,
          present: seen.length,
          corpora,
          kind: "candidate",
        });
    }
  }

  return issues.sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.schema.localeCompare(b.schema),
  );
}
