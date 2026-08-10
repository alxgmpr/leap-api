import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { describe } from "node:test";
import { Ajv } from "ajv";
import addFormats from "ajv-formats";
import { parse } from "yaml";
import { templatePath } from "../lib/platform-matrix.ts";

type Probe = Record<string, { status: string; body?: Record<string, unknown> }>;

const doc = parse(readFileSync("dist/openapi.yaml", "utf8")) as {
  paths: Record<
    string,
    Record<string, { responses?: Record<string, unknown> }>
  >;
  components: { schemas: Record<string, unknown> };
};

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);

// The real floor on this suite's usefulness: how many fixture bodies were
// actually validated against a schema, not how many fixtures exist.
// `cases.length > 100` (the prior floor) counts fixtures with a 200 status
// and a body -- it does not require that a schema was found for the path,
// so stripping `content` from every 200 response in the bundle silently
// drops this suite from 449 tests to 93, all passing, exit 0. Track the
// number of cases that actually reached `ajv.compile`/`validate` below and
// assert against it directly instead.
//
// 470 as of this writing (verified against dist/openapi.yaml + the
// committed fixtures). When intentionally adding response schema coverage
// (a new path, a resolved TODO(response), a new hand-authored collection
// schema), this number goes up -- update the constant below to match and
// note why in the commit. If it goes down, that is a coverage regression;
// investigate before updating the constant.
//
// Task 8's sweep-read/sweep-write import (406 -> 429, +23) is a case worth
// noting explicitly: it raised this number WITHOUT any path or schema
// authoring at all. `/area/{areaId}` (8 concrete instances),
// `/zone/{zoneId}` (8), and `/controlstation/{controlstationId}` (7) were
// already-refined operations with an existing response schema and simply
// had no fixture coverage before -- importing a new probe corpus against a
// previously-unprobed processor gave those existing schemas new bodies to
// validate against, independent of any family refinement work. The `led`
// family commit raised it further, 429 -> 453 (+24: 8 `GET /led/{ledId}` +
// 8 `GET /led/{ledId}/status` from sweep-read, 8 `PUT .../status` from
// sweep-write). Resolving `/zone/{zoneId}/associatedloadcontroller`'s
// TODO(response) (a `zone`-family update, not a new family) raised it
// again, 453 -> 461 (+8). `firmwareimage` (a straight copy, no deviations)
// raised it 461 -> 468 (+7). `curve` (a hand-authored Curves collection
// wrapper, fixing the same singular/plural MessageBodyType defect Task 10
// documented for `/zone`) raised it 468 -> 469 (+1 -- only one curve was
// observed on the single processor this sweep reached). `clientsetting`
// raised it 469 -> 470 (+1), the last path Task 8's sweep newly reached --
// probedNotInSpec is 0 again as of this commit.
//
// The coverage-blind spec probe (`spec-read-ra3`, 864 URLs / 226 200-OK bodies
// against the same processor) raised it again, 470 -> 658 (+188), and like
// the sweep import it did so WITHOUT any path or schema authoring: it is a
// far wider read of paths whose response schemas already existed and simply
// had no fixture bodies to validate against. 14 cases FAILED on import --
// 13 in spec-read-ra3 plus one in sweep-write (`/button/498`, which the wider
// spec probe reached first) -- across six schemas that disagreed with
// hardware. Those failures were the probe's actual signal, and every one
// has since been triaged, one commit per family:
//
//   - AreaStatus.CurrentScene    explicit JSON null, `**HyperReference`
//                                in firmware; now a `oneOf` with `null`
//   - Button.ProgrammingModelType  6th enum member observed
//   - NetworkInterface           anonymous embed flattened on wire evidence
//   - Services.Type              closed enum falsified; now an open string
//   - TimeclockEvent.AstronomicTimeOffset  clock format, not ISO 8601
//   - TimeclockEvent.AstronomicEventType   required only when
//                                `TimeclockEventType == Astronomic`
//
// None of that changed which cases are REACHED, which is what this
// constant tracks -- it stayed at 672 across all five commits, because
// every one of them edited a schema an existing case already pointed at.
// The constant moves when coverage moves, not when conformance does.
//
// 658 -> 672: `fixtures/sweep-write.json` had drifted from its raw capture,
// committed at 9 paths while the capture on disk holds 30 (the write phase
// was re-run after the fixture was written). Re-redacting picked up the
// other 21 paths and with them 14 more conformance cases. The 30-path
// figure is the one the campaign ledger records for that run.
//
// 672 -> 751: the same coverage-blind prober run against a Caseta bridge
// (`spec-read-caseta`, 848 URLs / 104 200-OK bodies -- the first Caseta data
// in this project since the original campaign). 79 of those 104 reached a
// schema; the other 25 are paths whose 200 response has no schema ref yet
// (18 templates, mostly `TODO(response)` -- `/service/{integration}`,
// `/area/{areaId}/occupancysettings` and neighbours,
// `/device/{deviceId}/ledsettings`, `/zone/tuningsettings`). No path or
// schema was authored for this import: like both earlier corpus imports it
// gave existing schemas new bodies to validate against.
//
// 3 of the 79 FAILED on import, all falsifying a firmware-derived
// assertion the RA3 corpora had never contradicted, and each triaged in its
// own commit:
//
//   - Organization.AccountNumber  non-pointer in firmware, absent from
//                                 Caseta's installer record; now optional
//   - Server.Type                 3rd enum member observed (`LIP`, Caseta's
//                                 telnet-23 integration server); appended,
//                                 NOT reopened -- see ServerType.yaml for
//                                 why this splits from the ServiceType
//                                 precedent
//   - LoadController.XID          non-pointer in firmware; Caseta emits no
//                                 XID on any object, on any route
//
// None of those changed which cases are REACHED -- this constant tracks
// coverage, not conformance, and every one of them edited a schema an
// existing case already pointed at.
const EXPECTED_MATCHED_CASES = 751;
let matchedCases = 0;

/** The 200-response schema ref for a path, if the spec declares one. */
function schemaRefFor(path: string): string | undefined {
  const get = doc.paths[path]?.get;
  const ok = get?.responses?.["200"] as
    | { content?: { "application/json"?: { schema?: { $ref?: string } } } }
    | undefined;
  return ok?.content?.["application/json"]?.schema?.$ref;
}

function resolve(ref: string): object | undefined {
  const name = ref.replace("#/components/schemas/", "");
  return doc.components.schemas[name] as object | undefined;
}

// Platforms come from captures.json (the manifest Task 7 introduced), not a
// hardcoded list -- every manifest entry is a `{path: {status, body}}` probe
// set, so a new probe corpus (e.g. Task 8's sweep-read/sweep-write) is
// validated automatically without editing this file. The subscribe log and
// late-frames evidence are deliberately never added to that manifest (see
// tools/redact.ts), so they never reach this loop.
const manifest: { label: string; to: string }[] = JSON.parse(
  readFileSync("captures.json", "utf8"),
);

// Per-platform floor for the "corpus is non-empty" sanity check below.
// ra3/caseta are the long-running, thousand-request-scale corpora from the
// original campaign; the Task 8 sweep corpora are a single processor's
// single-pass sweep, an order of magnitude smaller by design. Unlisted
// labels fall back to `> 0` -- still a real assertion, just scaled to
// whatever that corpus turns out to be.
const MIN_CASES: Record<string, number> = {
  ra3: 100,
  caseta: 100,
  "sweep-read": 40,
  "sweep-write": 5,
};

for (const { label: platform, to: fixturePath } of manifest) {
  describe(`conformance: ${platform}`, () => {
    const probe: Probe = JSON.parse(readFileSync(fixturePath, "utf8"));

    const cases = Object.entries(probe).filter(
      ([, v]) => v.status.startsWith("200") && v.body,
    );

    test("fixture corpus is non-empty", () => {
      const min = MIN_CASES[platform] ?? 0;
      assert.ok(
        cases.length > min,
        `only ${cases.length} usable fixtures (expected > ${min})`,
      );
    });

    for (const [concrete, result] of cases) {
      const path = templatePath(concrete);
      const ref = schemaRefFor(path);
      // Paths not yet written are a coverage gap, reported by check-coverage.
      if (!ref) continue;

      const schema = resolve(ref);
      if (!schema) continue;

      matchedCases++;
      test(`${platform} ${concrete} matches ${ref}`, () => {
        // The probe body wraps the payload in its MessageBodyType key.
        // A body with zero keys (a literal `{}`, e.g. RA3's /button when it
        // has nothing to report) has no key to unwrap -- validate the raw
        // `{}` itself rather than `body[undefined]`, which would silently
        // become `undefined` and never reach the schema as the empty
        // object it actually is.
        const bodyKey = Object.keys(result.body ?? {})[0];
        const payload =
          bodyKey === undefined ? result.body : result.body?.[bodyKey];
        const validate = ajv.compile({
          ...schema,
          components: doc.components,
        } as object);
        const valid = validate(payload);
        assert.ok(
          valid,
          `${concrete}: ${ajv.errorsText(validate.errors, { separator: "\n  " })}`,
        );
      });
    }
  });
}

// Registered after every platform describe block above has finished
// building its test list (node:test collects synchronously), so
// matchedCases is final by the time this runs.
test("matched conformance cases have not silently dropped", () => {
  assert.equal(
    matchedCases,
    EXPECTED_MATCHED_CASES,
    `expected ${EXPECTED_MATCHED_CASES} matched conformance cases, got ${matchedCases} -- ` +
      "if this dropped, a schema or response ref went missing; if it rose " +
      "on purpose, update EXPECTED_MATCHED_CASES above",
  );
});
