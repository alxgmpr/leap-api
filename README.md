# leap-openapi

An OpenAPI 3.1 reference specification for the Lutron LEAP (Lutron
Extensible Application Protocol) API — the protocol RA3/HWQS processors,
Caseta bridges, Vive systems, and their companion apps use over TLS port
8081.

## What this is

A single, browsable, hand-refined OpenAPI document (`spec/`, bundling to
`dist/openapi.yaml`) covering 204 paths and 285 component schemas, built from
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
4. **Hand-refine** every generated path and schema family into `spec/paths/`
   and `spec/components/schemas/` — correcting the firmware extraction's two
   systematic defects (mangled collection paths, and singular/plural
   `MessageBodyType` mislabeling — see `docs/mapping.md`), hand-authoring the
   entire command-processor write surface (which the firmware extraction does
   not cover at all — zero `commandprocessor` routes in 410), and recovering
   enum members from probe data and app reverse engineering wherever the
   firmware left a type open-ended.
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

```bash
npm test         # node --import tsx --test, node:test + node:assert/strict
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
