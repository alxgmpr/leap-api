import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { describe } from "node:test";
import { parse } from "yaml";
import { templatePath } from "../lib/platform-matrix.ts";

/**
 * `x-observed-values` is the one claim in this specification that is both
 * prose-shaped and machine-checkable. It says "hardware produced exactly
 * these values for this field", it sits in the schema next to the field it
 * describes, and the fixtures are the hardware record it refers to. Every
 * other census in this repository -- observation counts, per-corpus splits,
 * "the only corpus that…" -- is prose that only a reader can check.
 *
 * This suite cross-references the two, in both directions:
 *
 *   - a value the fixtures carry at an annotated site and the annotation
 *     does not list. That is the shape that shipped `FanSpeed: "Off"` in a
 *     frame log while `ZoneStatus.yaml` said hardware had produced exactly
 *     one value, and survived a full review wave.
 *   - a value the annotation lists that the fixtures do not carry. That is
 *     an observation claim with no evidence behind it, which is the same
 *     defect pointed the other way.
 *
 * WHAT IT DOES NOT CHECK, stated rather than left to be discovered:
 *
 *   - COUNTS. `x-observed-values` records a set, not a census, so a note
 *     saying "3 observations across the two RA3 corpora" is invisible here
 *     even when the set is right. Several such counts have been wrong.
 *   - CLOSED `enum`s. A fixture value outside a closed enum is caught by
 *     `test/conformance.test.ts` for probe-set bodies, and by nothing at all
 *     for frame-log bodies, which this suite reaches but deliberately does
 *     not police -- widening it to enums would need a decision about
 *     request-parameter schemas that no fixture exercises.
 *   - Any body this suite cannot anchor to a schema. Those are counted and
 *     asserted below rather than skipped quietly.
 */

type SchemaNode = Record<string, unknown>;

const doc = parse(readFileSync("dist/openapi.yaml", "utf8")) as {
  paths: Record<string, SchemaNode>;
  components: { schemas: Record<string, SchemaNode> };
};
const schemas = doc.components.schemas;

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

type Site = { id: string; claimed: string[]; found: Map<string, string> };

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
    if (Array.isArray(n["x-observed-values"]))
      sites.set(n, {
        id: `${name}${pointer}`,
        claimed: n["x-observed-values"] as string[],
        found: new Map(),
      });
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
 */
function collect(
  value: unknown,
  node: unknown,
  where: string,
  seen: Set<object>,
) {
  if (value === undefined || value === null) return;
  const s = deref(node);
  if (!s || seen.has(s)) return;

  const site = sites.get(s);
  if (site && typeof value === "string" && !site.found.has(value))
    site.found.set(value, where);

  const next = new Set(seen).add(s);
  for (const key of ["allOf", "oneOf", "anyOf"] as const)
    if (Array.isArray(s[key]))
      for (const sub of s[key] as unknown[]) collect(value, sub, where, next);
  if (s.then) collect(value, s.then, where, next);

  if (Array.isArray(value)) {
    if (s.items)
      value.forEach((el, i) => {
        collect(el, s.items, `${where}[${i}]`, new Set());
      });
    return;
  }
  if (typeof value !== "object") return;

  const v = value as Record<string, unknown>;
  const props = (s.properties ?? {}) as Record<string, unknown>;
  for (const [k, sub] of Object.entries(props))
    if (k in v) collect(v[k], sub, `${where}.${k}`, new Set());
  if (s.additionalProperties && typeof s.additionalProperties === "object")
    for (const [k, val] of Object.entries(v))
      if (!(k in props))
        collect(val, s.additionalProperties, `${where}.${k}`, new Set());
}

// --- anchor 1: probe-set corpora, bound through the path they were read from.
// The same rule test/conformance.test.ts validates with: template the URL,
// take the path's declared 200 schema, unwrap the body by its single key.
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
    const payload = bodyKey === undefined ? result.body : result.body[bodyKey];
    collect(payload, { $ref: ref }, `${label} ${url}`, new Set());
    probeAnchored++;
  }
}

// --- anchor 2: frame logs, bound through the body's own MessageBodyType key.
// These are not in captures.json and have no path to resolve, but the wire
// wraps every body in a key that names a component schema (`ZoneStatuses`,
// `DeviceStatus`, `Project`), which is the same unwrap the conformance rule
// performs -- so `body[key]` validates against `schemas[key]`.
const FRAME_FIXTURES = [
  "fixtures/push-probe.json",
  "fixtures/push-experiments.json",
  "fixtures/subscriptions.json",
  "fixtures/late-frames.json",
];
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
            new Set(),
          );
          frameAnchored++;
        } else {
          const name = bodyKey ?? "(empty body)";
          unanchoredBodyKeys.set(name, (unanchoredBodyKeys.get(name) ?? 0) + 1);
        }
      }
      walk(v, `${where}.${k}`);
    }
  })(JSON.parse(readFileSync(file, "utf8")), "");
}

describe("x-observed-values agrees with the fixtures", () => {
  // Non-vacuity, part 1: the annotation collector found something to check.
  test("the bundle carries annotated sites", () => {
    assert.ok(
      sites.size >= 20,
      `only ${sites.size} x-observed-values sites found in dist/openapi.yaml; ` +
        "if this dropped, the collector broke or annotations were deleted",
    );
  });

  // Non-vacuity, part 2: both anchors resolved bodies. If either of these
  // went to zero every per-site assertion below would still "pass" its
  // fixtures-subset-of-claimed half, so they are asserted directly.
  test("both anchors resolved fixture bodies", () => {
    assert.ok(probeAnchored > 900, `probe anchor resolved ${probeAnchored}`);
    assert.ok(frameAnchored > 100, `frame anchor resolved ${frameAnchored}`);
  });

  // Coverage cannot drop silently. `Message` is the ExceptionDetail body of
  // a refusal frame; this specification models no schema for it, which is a
  // known and deliberate gap. Any OTHER unanchored body key means a frame
  // shape this suite stopped being able to check.
  test("the only unanchored frame bodies are ExceptionDetail refusals", () => {
    assert.deepEqual(
      [...unanchoredBodyKeys.keys()].sort(),
      ["Message"],
      `unanchored frame body keys: ${JSON.stringify([...unanchoredBodyKeys])}` +
        " -- a new body shape is not being checked against any schema",
    );
  });

  // Probe-set bodies whose path declares no 200 schema are a coverage gap
  // `npm run coverage` already reports; they are counted here so the number
  // is visible rather than implicit.
  test("every probe-set body reached a declared schema", () => {
    assert.equal(
      probeNoSchema,
      0,
      `${probeNoSchema} probe-set 200 bodies have no declared 200 schema on ` +
        "their path, so their values were not checked against any annotation",
    );
  });

  for (const site of sites.values()) {
    test(`${site.id} matches the fixtures`, () => {
      const claimed = new Set(site.claimed);
      const unclaimed = [...site.found.keys()].filter((v) => !claimed.has(v));
      const unevidenced = site.claimed.filter((v) => !site.found.has(v));
      const detail =
        `\n  fixtures carry: ${JSON.stringify([...site.found.keys()].sort())}` +
        `\n  annotation claims: ${JSON.stringify(site.claimed)}` +
        (unclaimed.length
          ? `\n  in the fixtures, NOT in x-observed-values: ${JSON.stringify(
              unclaimed,
            )}\n  first seen at: ${unclaimed
              .map((v) => `${v} -> ${site.found.get(v)}`)
              .join("; ")}`
          : "") +
        (unevidenced.length
          ? `\n  in x-observed-values, NOT in any fixture: ${JSON.stringify(
              unevidenced,
            )}`
          : "");

      assert.equal(
        unclaimed.length,
        0,
        `${site.id}: the fixtures carry a value this schema does not record.${detail}` +
          "\n  Add it to x-observed-values and update the surrounding note; do" +
          " not close the enum on it.",
      );
      assert.equal(
        unevidenced.length,
        0,
        `${site.id}: x-observed-values claims a value no fixture carries.${detail}` +
          "\n  Either the evidence was never committed or the value is wrong.",
      );
    });
  }
});
