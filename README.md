# leap-openapi

An OpenAPI 3.1 reference specification for the Lutron LEAP (Lutron
Extensible Application Protocol) API — the protocol RA3/HWQS processors,
Caseta bridges, Vive systems, and their companion apps use over TLS port
8081.

## What this is

A single, browsable, hand-refined OpenAPI document (`spec/`, bundling to
`dist/openapi.yaml`) covering 205 paths and 300 component schemas, built from
two independent sources cross-checked against each other:

- A **firmware extraction** — 410 route identifiers and 636 response struct
  definitions recovered from the RA3 processor's compiled server binary — as
  the source of truth for schema shapes and optionality.
- **Live probing** of real RA3 and Caseta hardware (2,087 requests across both
  platforms) as the source of truth for which routes actually respond, with
  what status, and with what body — including catching and correcting two
  systematic defects in the firmware extraction itself (see
  `docs/mapping.md`).

Alongside the specification, five narrative documents cover everything an
OpenAPI document cannot express on its own:

| Document | Covers |
|---|---|
| `docs/protocol.md` | The real wire protocol: envelope, NDJSON framing, `ClientTag` correlation, all 14 `CommuniqueType`s, status codes, every transport (not just LEAP TLS 8081), and mutual TLS. |
| `docs/mapping.md` | The full LEAP-to-OpenAPI mapping: the verb table, the `leaps://` scheme, the three `x-leap-*` vendor extensions, and the flat 57-field `Command` model with its full `CommandType`-to-field pairing table. |
| `docs/subscriptions.md` | The subscription lifecycle, an open question about `ClientTag` reuse on pushed frames (resolved here as genuinely unresolved by the available sources — stated explicitly, not guessed), and the 19 subscribable routes. |
| `docs/platforms.md` | Where RA3, Caseta, Vive, and the cloud proxy diverge — a generated table of every path where RA3 and Caseta disagree, RA3's area-walk navigation vs. Caseta's flat lists, and why every schema in this specification is RA3-derived. |
| `docs/discovery.md` | mDNS discovery (`_lutron._tcp`, its TXT record fields), and how a client obtains a certificate to pair with each platform. |

## What this is not

**This is not an official Lutron document, and it is not affiliated with,
endorsed by, or reviewed by Lutron Electronics.** It is an independent,
unofficial reverse-engineering effort. Lutron's LEAP protocol is
undocumented publicly; everything here was recovered from firmware binaries,
captured network traffic, and decompiled client applications the authors
already had lawful access to. Nothing here should be taken as a promise about
what any given Lutron device will do — behavior was observed on specific
firmware versions (RA3 v03.247, Caseta v01.123) and may differ on others.
This document says explicitly, throughout, wherever something is inferred
rather than confirmed — look for "not established" and similar language in
schema and path descriptions.

## What is and is not covered

This is a partial specification, not a hand-refined copy of everything the
firmware extraction and probe sweeps recovered. So a reader who looks up a
route and finds nothing here cannot tell "this route does not exist" from
"this route exists but has not been written up" without the numbers below.

- **Paths.** The firmware route extraction recovered 410 distinct route
  templates. 233 of those 410 (57%) are **absent from the bundled
  specification** — present only in `spec/paths/_generated/` (staging,
  never bundled — see `tools/bundle.ts`), not in `spec/paths/`. The
  remaining 177 firmware routes are covered by the 205 bundled paths (some
  bundled paths merge two firmware routes — id/xid pairs, see
  `docs/mapping.md` — and a few bundled paths, like the ten
  `commandprocessor` routes, have no firmware route at all).
- **Path families.** `spec/paths/_generated/` holds 170 generated path
  family files, one per top-level resource the extraction recovered.
  `spec/paths/` (the hand-refined tree the bundle actually reads) holds 21
  files: 20 refined from a generated family, plus one
  (`commandprocessor.yaml`) hand-authored from scratch with no generated
  counterpart at all (the extraction recovered zero `commandprocessor`
  routes — see `docs/mapping.md`). The other 150 generated families were
  never touched.
- **Schemas.** The firmware extraction recovered 636 struct definitions.
  300 of those 636 (47%) ship in `spec/components/schemas/`; the rest sit
  untouched in `spec/components/schemas/_generated/`.

None of this is a defect to be silently patched over — hand-refining a
schema or path family is real, evidence-checked work (cross-referencing
`fixtures/`, correcting mislabels, trimming `required` to what is actually
observed), and this project has done it for the paths and schemas that
were reachable, probe-confirmed, or otherwise worth the verification cost.
It has not attempted a straight, unverified copy of the other 233
routes/336 schemas, because an unverified copy would carry exactly the
false confidence this document works to avoid elsewhere. Run
`npm run coverage` for the live, generated version of these numbers
(`probedNotInSpec`/`specWithoutFixture`), which additionally tracks
coverage against the captured fixtures rather than just the firmware
extraction.

## How it was built

1. **Vendor firmware extraction data** (`vendor/`) — Go route and type
   identifiers recovered from the RA3 server binary via `GoReSym`, checked in
   as `vendor/leap-routes.json` and `vendor/leap-types.json`, plus a legacy
   firmware-derived OpenAPI 3.0.3 route index (`vendor/legacy-spec.yaml`)
   used only for operation summaries.
2. **Generate schemas and paths** from that vendor data
   (`npm run gen:schemas`, `npm run gen:paths`) into
   `spec/components/schemas/_generated/` and `spec/paths/_generated/` —
   staging output, never hand-edited.
3. **Redact and commit real probe fixtures** (`npm run redact`) — real
   captured traffic from RA3 and Caseta, scrubbed of IPs, MAC addresses,
   serial numbers, and other identifying data, into `fixtures/ra3.json` and
   `fixtures/caseta.json`. These are the corpus every generated schema is
   checked against.
4. **Hand-refine** a subset of the generated paths and schemas — 21 of 170
   generated path families, 300 of 636 generated schemas as of this writing
   (see "What is and is not covered" above) — into `spec/paths/` and
   `spec/components/schemas/`: correcting the firmware extraction's
   systematic defects (mangled collection paths, singular/plural
   `MessageBodyType` mislabeling, anonymous-embed fields the generator
   leaves nested instead of flattened — see `docs/mapping.md`),
   hand-authoring the entire command-processor write surface (which the
   firmware extraction does not cover at all — zero `commandprocessor`
   routes in 410), and recovering enum members from probe data and app
   reverse engineering wherever the firmware left a type open-ended.
5. **Bundle** (`npm run bundle`) — merge the hand-refined tree onto
   `spec/openapi.yaml`, inject `x-leap-platforms` availability tables (built
   from `lib/platform-matrix.ts` against the committed fixtures) into every
   operation with probe coverage, and write `dist/openapi.yaml`.
6. **Write this narrative documentation** (`docs/`, this task) — everything
   above that an OpenAPI document has no field for.

## How to regenerate

```bash
npm install
npm run gen:schemas   # regenerate spec/components/schemas/_generated from vendor/
npm run gen:paths     # regenerate spec/paths/_generated from vendor/
npm run redact        # re-redact fixtures/ from source probe data (requires the
                       # separate, private source repository this project was
                       # built against; not needed if fixtures/ is already present)
npm run bundle         # merge spec/ into dist/openapi.yaml
npm run coverage       # report probe-vs-spec and TODO-marker coverage
```

`spec/paths/_generated/` and `spec/components/schemas/_generated/` are
staging output — regenerating them does not touch the hand-refined files in
`spec/paths/` and `spec/components/schemas/` that the bundle actually uses.

## How to run the tests

`dist/openapi.yaml` is gitignored and not checked in, but several test
files (`test/bundle.test.ts`, `test/conformance.test.ts`,
`test/check-coverage.test.ts`) read it directly. **Run `npm run bundle`
before `npm test`** — on a fresh clone, skipping it fails those tests with
`ENOENT: no such file or directory, open 'dist/openapi.yaml'`, not a real
test failure.

```bash
npm run bundle    # merge spec/ into dist/openapi.yaml -- required before npm test
npm test          # node --import tsx --test, node:test + node:assert/strict
npm run lint      # biome check .
npm run typecheck # tsc --noEmit
```

All three must pass clean. Tests cover the non-trivial logic in each
generator tool (Go struct parsing, route-to-path mapping, the platform
matrix), a conformance suite that validates every schema with probe coverage
against the real captured fixture bodies (`test/conformance.test.ts`), and
this documentation's own presence/completeness (`test/docs.test.ts`).

## How to read the rendered site

The bundled document (`dist/openapi.yaml`, produced by `npm run bundle`) is a
standard OpenAPI 3.1 file and renders in any OpenAPI-aware tool. Locally,
with the dev dependencies installed:

```bash
npx @redocly/cli preview-docs dist/openapi.yaml
```

Because Redoc and Scalar-style renderers hide `x-*` vendor extensions by
default, the platform-availability data they carry
(`x-leap-platforms`) is additionally rendered into a markdown table appended
to each operation's `description` at bundle time — so it is visible in the
rendered output without any renderer configuration. See `docs/mapping.md` for
the full account of what each vendor extension carries and why.
