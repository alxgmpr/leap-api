import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { censusToObject, deriveObserved } from "../lib/observed-census.ts";

/**
 * `x-observed-values` is the one claim in this specification that is both
 * prose-shaped and machine-checkable. It says "hardware produced exactly
 * these values for this field", it sits in the schema next to the field it
 * describes, and the fixtures are the hardware record it refers to.
 *
 * `x-observed-census` is its counterpart for the numbers: an optional
 * sibling giving, per value, per corpus, how many occurrences the fixtures
 * carry. Before it, every count in this repository -- observation counts,
 * per-corpus splits, "the only corpus that…" -- was prose that only a reader
 * could check, and most of this project's recorded defects have lived there.
 *
 * This suite cross-references annotation and fixtures, in both directions:
 *
 *   - a value the fixtures carry at an annotated site and the annotation
 *     does not list. That is the shape that shipped `FanSpeed: "Off"` in a
 *     frame log while `ZoneStatus.yaml` said hardware had produced exactly
 *     one value, and survived a full review wave.
 *   - a value the annotation lists that the fixtures do not carry. That is
 *     an observation claim with no evidence behind it, which is the same
 *     defect pointed the other way.
 *   - a declared census that does not deep-equal the derived one: a count
 *     that moved, in either direction, for any value in any corpus.
 *
 * THE CENSUS RULES, stated here because they are what a reader has to know
 * to write one:
 *
 *   - `x-observed-census` is OPTIONAL. A site carrying `x-observed-values`
 *     and no census is legal and checked exactly as before.
 *   - Every value key in a declared census must also appear in that site's
 *     `x-observed-values`. A census naming a value the set does not is the
 *     same defect class as the two above, pointed a third way.
 *   - Counts are OBJECT OCCURRENCES: one per string encountered at that site
 *     while walking the fixture bodies. Concretely, the same bridge object
 *     reachable at two URLs is counted twice, and an object two probe
 *     corpora both captured is counted once under each corpus label. The
 *     entity-vs-object-occurrence distinction is a named defect in this
 *     project's record; it is not left implicit here.
 *   - Corpus labels are the `label` field from `captures.json` for probe-set
 *     bodies, and the fixture path for frame-log bodies.
 *   - Blocks are authored by `npx tsx tools/derive-census.ts`, never typed by
 *     hand.
 *
 * THE CIRCULARITY, stated rather than hidden: that generator and this
 * checker share one derivation (`lib/observed-census.ts`), so neither can
 * catch a bug in it -- a miscount would be printed and then agreed with.
 * What the pair catches is DRIFT: a fixture import, a redaction change, a
 * widened route, or an edited description that no longer matches the corpus.
 * That is the defect class this project actually suffers.
 *
 * WHAT IT DOES NOT CHECK, stated rather than left to be discovered:
 *
 *   - PROSE COUNTS. The census is machine-checked; a sentence in a
 *     `description` restating the same number is not, and drifts on its own.
 *     Descriptions should point at `x-observed-census` rather than repeat it.
 *   - CLOSED `enum`s. A fixture value outside a closed enum is caught by
 *     `test/conformance.test.ts` for probe-set bodies, and by nothing at all
 *     for frame-log bodies, which this suite reaches but deliberately does
 *     not police -- widening it to enums would need a decision about
 *     request-parameter schemas that no fixture exercises.
 *   - Any body this suite cannot anchor to a schema. Those are counted and
 *     asserted below rather than skipped quietly.
 */

const {
  sites,
  probeAnchored,
  probeNoSchema,
  frameAnchored,
  unanchoredBodyKeys,
} = deriveObserved();

describe("x-observed-values agrees with the fixtures", () => {
  // Non-vacuity, part 1: the annotation collector found something to check.
  test("the bundle carries annotated sites", () => {
    assert.ok(
      sites.length >= 25,
      `only ${sites.length} x-observed-values sites found in dist/openapi.yaml; ` +
        "if this dropped, the collector broke or annotations were deleted",
    );
  });

  // Non-vacuity, part 1b: the same for the census. Every per-site census
  // assertion is skipped on a site that declares none, so deleting every
  // `x-observed-census` block would otherwise leave a fully green suite that
  // checks no count at all.
  test("the bundle carries declared censuses", () => {
    const declared = sites.filter((s) => s.declared !== undefined);
    assert.ok(
      declared.length >= 25,
      `only ${declared.length} x-observed-census blocks found in ` +
        "dist/openapi.yaml; the census assertions are vacuous on sites that " +
        "declare none, so if this dropped, blocks were deleted or the " +
        "collector stopped reading them",
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

  for (const site of sites) {
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

    test(`${site.id} census matches the fixtures`, () => {
      const declared = site.declared;
      if (declared === undefined) return; // the census is optional.
      const derived = censusToObject(site.census);

      // A census value key that x-observed-values does not list. Checked
      // first, and separately, because deep-equal would report it as an
      // unexplained extra key rather than as the set/census disagreement it
      // is.
      const claimed = new Set(site.claimed);
      const uncl = Object.keys(declared).filter((v) => !claimed.has(v));
      assert.equal(
        uncl.length,
        0,
        `${site.id}: x-observed-census counts a value x-observed-values does ` +
          `not list: ${JSON.stringify(uncl)}` +
          `\n  annotation claims: ${JSON.stringify(site.claimed)}` +
          `\n  census names: ${JSON.stringify(Object.keys(declared).sort())}` +
          "\n  Either the value belongs in x-observed-values or the census " +
          "row is stale.",
      );

      assert.deepEqual(
        declared,
        derived,
        `${site.id}: x-observed-census disagrees with the fixtures.` +
          `\n  declared census: ${JSON.stringify(declared)}` +
          `\n  derived census:  ${JSON.stringify(derived)}` +
          "\n  Counts are object occurrences per corpus. Re-derive with" +
          " `npx tsx tools/derive-census.ts` rather than editing by hand," +
          " and update any description that restates the number.",
      );
    });
  }
});
