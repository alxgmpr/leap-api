import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { templatePath } from "./platform-matrix.ts";

/**
 * The derivation behind `x-observed-values` and `x-observed-census`, in one
 * place so that the checker (`test/observed-values.test.ts`) and the
 * generator (`tools/derive-census.ts`) cannot disagree about what a count
 * means.
 *
 * STATE THE CIRCULARITY PLAINLY. A generator and a checker sharing one
 * derivation cannot catch a bug in that derivation: if this file counts the
 * wrong thing, the tool prints the wrong number and the test agrees with it.
 * What the pair does catch is DRIFT -- a fixture import, a redaction change,
 * a widened route, or an edited description that no longer matches the
 * corpus. That is the defect class this project actually suffers, and every
 * count in this repository that has ever been wrong was wrong that way.
 * Sharing the derivation is what makes the census re-derivable at all; the
 * alternative is two implementations that disagree and no way to tell which
 * is right.
 *
 * WHAT A COUNT COUNTS: object occurrences, not entities. One per string
 * encountered at that site while walking the fixture bodies. Concretely, the
 * same bridge object reachable at two URLs -- `/zone/5` and the copy of it
 * embedded in `/area/3/associatedzone` -- is counted twice, and the same
 * object captured by two probe corpora is counted once per corpus. Entity
 * counts and object-occurrence counts have been conflated in this
 * repository's descriptions before; they are different numbers and this is
 * the second one.
 */

export type SchemaNode = Record<string, unknown>;

/** value -> corpus label -> occurrence count. */
export type Census = Record<string, Record<string, number>>;

export type Site = {
  id: string;
  claimed: string[];
  /** `x-observed-census` exactly as the bundle declares it, if it does. */
  declared: Census | undefined;
  /** value -> the `where` of its FIRST occurrence. First-wins, deliberately. */
  found: Map<string, string>;
  /** value -> corpus -> count. Every occurrence, not just the first. */
  census: Map<string, Map<string, number>>;
};

export type Derivation = {
  sites: Site[];
  probeAnchored: number;
  probeNoSchema: number;
  frameAnchored: number;
  unanchoredBodyKeys: Map<string, number>;
};

/**
 * Frame-log fixtures. These are deliberately absent from `captures.json`
 * (see tools/redact.ts) and so have to be listed here; their corpus label is
 * the fixture path itself.
 */
export const FRAME_FIXTURES = [
  "fixtures/push-probe.json",
  "fixtures/push-experiments.json",
  "fixtures/subscriptions.json",
  "fixtures/late-frames.json",
];

/** Follow `get.responses.200.content.application/json.schema.$ref`, if present. */
function okSchemaRef(pathItem: SchemaNode | undefined): string | undefined {
  const get = pathItem?.get as SchemaNode | undefined;
  const ok = (get?.responses as SchemaNode | undefined)?.["200"] as
    | SchemaNode
    | undefined;
  const json = (ok?.content as SchemaNode | undefined)?.["application/json"] as
    | SchemaNode
    | undefined;
  const schema = json?.schema as SchemaNode | undefined;
  return typeof schema?.$ref === "string" ? schema.$ref : undefined;
}

export function deriveObserved(): Derivation {
  const doc = parse(readFileSync("dist/openapi.yaml", "utf8")) as {
    paths: Record<string, SchemaNode>;
    components: { schemas: Record<string, SchemaNode> };
  };
  const schemas = doc.components.schemas;

  /**
   * Annotated sites, keyed by the schema node object itself. Node identity is
   * what the walker below matches on, so a `$ref` to a shared schema
   * (`ServiceType`) and an inline annotation on a property
   * (`ZoneStatus.FanSpeed`) are found by the same mechanism.
   */
  const sites = new Map<object, Site>();
  for (const [name, schema] of Object.entries(schemas)) {
    (function walk(node: unknown, pointer: string) {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) {
        node.forEach((v, i) => {
          walk(v, `${pointer}/${i}`);
        });
        return;
      }
      const n = node as Record<string, unknown>;
      if (Array.isArray(n["x-observed-values"])) {
        const declared = n["x-observed-census"];
        sites.set(n, {
          id: `${name}${pointer}`,
          claimed: n["x-observed-values"] as string[],
          declared:
            declared && typeof declared === "object" && !Array.isArray(declared)
              ? (declared as Census)
              : undefined,
          found: new Map(),
          census: new Map(),
        });
      }
      for (const [k, v] of Object.entries(n)) walk(v, `${pointer}/${k}`);
    })(schema, "");
  }

  function deref(node: unknown): Record<string, unknown> | undefined {
    let n = node as Record<string, unknown> | undefined;
    for (let hop = 0; hop < 50; hop++) {
      if (!n || typeof n !== "object") return undefined;
      if (typeof n.$ref !== "string") return n;
      n = schemas[n.$ref.replace("#/components/schemas/", "")];
    }
    throw new Error("deref: $ref chain longer than 50 hops");
  }

  /**
   * Walk a fixture value and a schema in lockstep, recording every string that
   * lands on an annotated site. `seen` guards the non-descending steps
   * (`$ref`, `allOf`, `oneOf`, `if`/`then`) against a schema cycle; descending
   * into a property or an array element resets it, because the value tree is
   * finite and strictly shrinks.
   *
   * `corpus` is passed in rather than parsed back out of `where`: the two
   * anchors build `where` differently (`` `${label} ${url}` `` vs
   * `` `${file}${path}.body` ``) and only the caller knows which corpus a
   * body came from.
   */
  function collect(
    value: unknown,
    node: unknown,
    where: string,
    corpus: string,
    seen: Set<object>,
  ) {
    if (value === undefined || value === null) return;
    const s = deref(node);
    if (!s || seen.has(s)) return;

    const site = sites.get(s);
    if (site && typeof value === "string") {
      if (!site.found.has(value)) site.found.set(value, where);
      let perCorpus = site.census.get(value);
      if (!perCorpus) {
        perCorpus = new Map();
        site.census.set(value, perCorpus);
      }
      perCorpus.set(corpus, (perCorpus.get(corpus) ?? 0) + 1);
    }

    const next = new Set(seen).add(s);
    for (const key of ["allOf", "oneOf", "anyOf"] as const)
      if (Array.isArray(s[key]))
        for (const sub of s[key] as unknown[])
          collect(value, sub, where, corpus, next);
    if (s.then) collect(value, s.then, where, corpus, next);

    if (Array.isArray(value)) {
      if (s.items)
        value.forEach((el, i) => {
          collect(el, s.items, `${where}[${i}]`, corpus, new Set());
        });
      return;
    }
    if (typeof value !== "object") return;

    const v = value as Record<string, unknown>;
    const props = (s.properties ?? {}) as Record<string, unknown>;
    for (const [k, sub] of Object.entries(props))
      if (k in v) collect(v[k], sub, `${where}.${k}`, corpus, new Set());
    if (s.additionalProperties && typeof s.additionalProperties === "object")
      for (const [k, val] of Object.entries(v))
        if (!(k in props))
          collect(
            val,
            s.additionalProperties,
            `${where}.${k}`,
            corpus,
            new Set(),
          );
  }

  // --- anchor 1: probe-set corpora, bound through the path they were read
  // from. The same rule test/conformance.test.ts validates with: template the
  // URL, take the path's declared 200 schema, unwrap the body by its single
  // key. Corpus label: the manifest `label`.
  const manifest: { label: string; to: string }[] = JSON.parse(
    readFileSync("captures.json", "utf8"),
  );
  let probeAnchored = 0;
  let probeNoSchema = 0;
  for (const { label, to } of manifest) {
    const probe: Record<
      string,
      { status: string; body?: Record<string, unknown> }
    > = JSON.parse(readFileSync(to, "utf8"));
    for (const [url, result] of Object.entries(probe)) {
      if (!result.status.startsWith("200") || !result.body) continue;
      const ref = okSchemaRef(doc.paths[templatePath(url)]);
      if (!ref) {
        probeNoSchema++;
        continue;
      }
      const bodyKey = Object.keys(result.body)[0];
      const payload =
        bodyKey === undefined ? result.body : result.body[bodyKey];
      collect(payload, { $ref: ref }, `${label} ${url}`, label, new Set());
      probeAnchored++;
    }
  }

  // --- anchor 2: frame logs, bound through the body's own MessageBodyType
  // key. These are not in captures.json and have no path to resolve, but the
  // wire wraps every body in a key that names a component schema
  // (`ZoneStatuses`, `DeviceStatus`, `Project`), which is the same unwrap the
  // conformance rule performs -- so `body[key]` validates against
  // `schemas[key]`. Corpus label: the fixture path.
  let frameAnchored = 0;
  const unanchoredBodyKeys = new Map<string, number>();
  for (const file of FRAME_FIXTURES) {
    (function walk(node: unknown, where: string) {
      if (Array.isArray(node)) {
        node.forEach((v, i) => {
          walk(v, `${where}[${i}]`);
        });
        return;
      }
      if (!node || typeof node !== "object") return;
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (k === "body" && v && typeof v === "object" && !Array.isArray(v)) {
          const bodyKey = Object.keys(v as object)[0];
          if (bodyKey && schemas[bodyKey]) {
            collect(
              (v as Record<string, unknown>)[bodyKey],
              schemas[bodyKey],
              `${file}${where}.body`,
              file,
              new Set(),
            );
            frameAnchored++;
          } else {
            const name = bodyKey ?? "(empty body)";
            unanchoredBodyKeys.set(
              name,
              (unanchoredBodyKeys.get(name) ?? 0) + 1,
            );
          }
        }
        walk(v, `${where}.${k}`);
      }
    })(JSON.parse(readFileSync(file, "utf8")), "");
  }

  return {
    sites: [...sites.values()],
    probeAnchored,
    probeNoSchema,
    frameAnchored,
    unanchoredBodyKeys,
  };
}

/**
 * The derived census as a plain object, with value keys and corpus keys both
 * sorted, so the generator's output and a test failure message are stable and
 * diffable. Ordering is cosmetic: the assertion is a deep-equal, which does
 * not care about key order.
 */
export function censusToObject(census: Site["census"]): Census {
  const out: Census = {};
  for (const value of [...census.keys()].sort()) {
    const perCorpus = census.get(value) as Map<string, number>;
    const inner: Record<string, number> = {};
    for (const corpus of [...perCorpus.keys()].sort())
      inner[corpus] = perCorpus.get(corpus) as number;
    out[value] = inner;
  }
  return out;
}
