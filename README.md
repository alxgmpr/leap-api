# leap-openapi

An OpenAPI 3.1 reference specification for the Lutron LEAP (Lutron
Extensible Application Protocol) API — the protocol RA3/HWQS processors,
Caseta bridges, Vive systems, and their companion apps use over TLS port
8081.

## What this is

A single, browsable, hand-refined OpenAPI document (`spec/`, bundling to
`dist/openapi.yaml`) covering 210 paths and 320 component schemas, built from
two independent sources cross-checked against each other:

- A **firmware extraction** — 410 route identifiers and 636 response struct
  definitions recovered from the RA3 processor's compiled server binary — as
  the source of truth for schema shapes and optionality.
- **Live probing** of real RA3 and Caseta hardware, as the source of truth for
  which routes actually respond, with what status, and with what body —
  including catching and correcting two systematic defects in the firmware
  extraction itself (see `docs/mapping.md`). Four campaigns, 4,098 requests
  in all:
  - 2,087 requests against an RA3 processor running firmware v03.247 and a
    Caseta bridge (1,124 and 963 — `fixtures/ra3.json`,
    `fixtures/caseta.json`).
  - 277 requests in a later, single-processor RA3 sweep: 206 read-phase, 30
    write-phase, 41 subscribe attempts (see `docs/platforms.md`).
  - 886 requests in a still later RA3 pass, on firmware v03.249 — an
    864-URL, coverage-blind probe of the specification's *own* path list
    (`fixtures/spec-read.json`), plus a 22-request subscription-push probe
    against the same processor (`fixtures/push-probe.json`, whose `host` is
    the same redaction placeholder as that corpus's own interface address —
    see `docs/subscriptions.md`).
  - 848 requests replaying that same coverage-blind path list against a
    *second Caseta bridge* (`fixtures/spec-read-caseta.json`) — the first
    Caseta data since the original campaign, and what lets
    `docs/platforms.md` test the route-refusal finding across two product
    lines rather than one. That bridge is nearly unconfigured, so read
    its absences with the caveat that document spells out.

Alongside the specification, five narrative documents cover everything an
OpenAPI document cannot express on its own:

| Document | Covers |
|---|---|
| `docs/protocol.md` | The real wire protocol: envelope, NDJSON framing, `ClientTag` correlation, all 14 `CommuniqueType`s, status codes, every transport (not just LEAP TLS 8081), and mutual TLS. |
| `docs/mapping.md` | The full LEAP-to-OpenAPI mapping: the verb table, the `leaps://` scheme, the five `x-leap-*` vendor extensions, and the flat 57-field `Command` model with its full `CommandType`-to-field pairing table. |
| `docs/subscriptions.md` | The subscription lifecycle; the `ClientTag` question on pushed frames, answered by live push probes (`fixtures/push-probe.json`, `fixtures/push-experiments.json`) — the tag is copied from the originating `SubscribeRequest`, proved by a pair of runs whose subscribes land on different tags, and pushes arrive as `ReadResponse` a couple hundred milliseconds after the write carrying field-level deltas rather than snapshots, all kept explicitly distinct from the separate asynchronous-*response* tag reuse in `docs/protocol.md`; that a change this client did not command pushes too, so a subscription observes the system rather than echoing your own writes; and the 20 routes this specification marks `x-leap-subscribable`, with each route's live probe result — of which only 6 are confirmed to accept a subscription on hardware, 7 are refused by the same processor, and 7 are untested, inconclusive, or (in one case) never requested yet confirmed pushing — and the correction that per-zone status is not subscribable, the collection `/zone/status` is. |
| `docs/platforms.md` | Where RA3, Caseta, Vive, and the cloud proxy diverge — a generated table of every path where RA3 and Caseta disagree, RA3's area-walk navigation vs. Caseta's flat lists, why every schema in this specification is RA3-derived, a second RA3 corpus's probe sweep showing that firmware route-table presence does not imply a live implementation, and the two-platform test of that finding — over the 187 paths the coverage-blind prober reached on both an RA3 processor and a Caseta bridge, RA3 refuses 59 and Caseta refuses 56 of the same 59; a bare-bridge baseline separating "nothing configured" from "not implemented", from the same Caseta bridge probed again with zero devices provisioned; and the connect-time auto-subscribe that turns out to be Caseta-only. |
| `docs/discovery.md` | mDNS discovery (`_lutron._tcp`, its TXT record fields), and how a client obtains a certificate to pair with each platform. |

## What this is not

**This is not an official Lutron document, and it is not affiliated with,
endorsed by, or reviewed by Lutron Electronics.** It is an independent,
unofficial reverse-engineering effort. Lutron's LEAP protocol is
undocumented publicly; everything here was recovered from firmware binaries,
captured network traffic, and decompiled client applications the authors
already had lawful access to. Nothing here should be taken as a promise about
what any given Lutron device will do — behavior was observed on specific
firmware versions (RA3 v03.247 and v03.249, Caseta v01.123) and may differ on
others.
This document says explicitly, throughout, wherever something is inferred
rather than confirmed — look for "not established" and similar language in
schema and path descriptions.

## What is and is not covered

This is a partial specification, not a hand-refined copy of everything the
firmware extraction and probe sweeps recovered. So a reader who looks up a
route and finds nothing here cannot tell "this route does not exist" from
"this route exists but has not been written up" without the numbers below.

- **Paths.** The firmware route extraction recovered 410 distinct route
  templates. 228 of those 410 (56%) are **absent from the bundled
  specification** — present only in `spec/paths/_generated/` (staging,
  never bundled — see `tools/bundle.ts`), not in `spec/paths/`. The
  remaining 182 each have their own bundled path. Of the 228 absent, 4 are
  `{xid}` routes whose `{id}` twin *is* bundled — OpenAPI forbids two paths
  differing only in parameter name, so those 4 are represented rather than
  missing (see `docs/mapping.md`); the other 224 are genuinely not covered.
  The bundle ships 210 paths, so 28 of them have no firmware route behind
  them at all: the ten `commandprocessor` routes (the extraction recovered
  zero — see `docs/mapping.md`) and 18 others — collection, `/status` and
  `/expanded` paths, several of them the correctly-slashed replacements for
  forms the extraction mangled (`/devicestatus` and similar), the rest
  absent from the extraction in any form.
- **Path families.** `spec/paths/_generated/` holds 170 generated path
  family files, one per top-level resource the extraction recovered.
  `spec/paths/` (the hand-refined tree the bundle actually reads) holds 25
  files: 24 refined from a generated family, plus one
  (`commandprocessor.yaml`) hand-authored from scratch with no generated
  counterpart at all (the extraction recovered zero `commandprocessor`
  routes — see `docs/mapping.md`). The other 146 generated families were
  never touched.
- **Schemas.** The firmware extraction recovered 636 struct definitions.
  `spec/components/schemas/` ships 344 schemas total, but those two numbers
  don't reconcile 1:1 — 274 of the 344 (43% of the 636 generated) were
  hand-refined from a generated counterpart of the same name; the other 70
  have no generated counterpart at all (hand-authored collection wrappers
  like `Zones`/`Devices`/`Areas`/`Curves`/`LoadControllers`, and
  hand-authored enums like `CommandType`/`EnabledState`/`LEDState`/
  `ProgrammingModelType`). None of these were ever definitions the firmware
  extraction could produce: all 636 recovered types are Go `struct`
  definitions and nothing else, so the extraction can emit no named enum
  type at all, and per `docs/mapping.md` the firmware defines no plural
  collection-wrapper types either. Six of the 70 are documented-open
  `string`s rather than enums, for two different reasons. `ServiceType` went
  first — live traffic on RA3 firmware v03.249 falsified it as a closed set
  (it returned a `Type` this specification did not list), and the firmware
  types `Service.Type` as a bare Go `string` with no named type behind it,
  so there was nothing to close against. `Role`, `SessionRole`,
  `ButtonGroupCategoryType`, `StopIfMovingEnabledState` and
  `SystemLoadSheddingState` followed on a different ground: hardware has
  falsified none of them, but each closed a set on exactly one observed
  value, where the `enum` and its `x-observed-values` carry identical
  content and the `enum` adds only an exhaustiveness claim.
  `OccupancyStatus.yaml` records that criterion — set cardinality, not
  firmware typing — and the ruling it reverses. `ServerType`, falsified the
  same way by the Caseta bridge, was *appended* to instead: it has three
  independently observed members, so it stays closed as an acknowledged
  lower bound like the other 23 closed enums. Five of the 70 are new:
  `Availability`, `BatteryLevelState`, `LinkType`, `SwitchedLevel` and
  `NetworkConfigurationType`, shared enums whose firmware types the
  extraction referenced but never defined, recovered from probe data in the
  Task 13 enum pass. The remaining 362 of the 636
  generated schemas (57%) sit untouched in
  `spec/components/schemas/_generated/`.

None of this is a defect to be silently patched over — hand-refining a
schema or path family is real, evidence-checked work (cross-referencing
`fixtures/`, correcting mislabels, trimming `required` to what is actually
observed), and this project has done it for the paths and schemas that
were reachable, probe-confirmed, or otherwise worth the verification cost.
It has not attempted a straight, unverified copy of the other 228
routes/377 schemas, because an unverified copy would carry exactly the
false confidence this document works to avoid elsewhere. Run
`npm run coverage` for the live, generated version of these numbers
(`probedNotInSpec`/`specWithoutFixture`), which additionally tracks
coverage against the captured fixtures rather than just the firmware
extraction. At the time of writing it reports `probedNotInSpec: 0`,
`specWithoutFixture: 116`, `todoEnums: 73`, `todoResponses: 167`.

**What `specWithoutFixture` does and does not mean.** It counts bundled
paths with no `200` response in `fixtures/`, and until recently that was
mostly a statement about this project's probe *planning*, not about the
hardware. The Task 8 sweep planner deliberately skips routes the
specification already documents, so the specification's own paths were
systematically never asked about: of the 155 paths then reported, 152 had
never been sent to any processor at all — not sent and refused, never
sent. The coverage-blind probe in `fixtures/spec-read.json` was run to fix
exactly that, replaying all 864 of the specification's own URLs against an
RA3 processor on firmware v03.249; it closed 25, leaving 130. Replaying the
same list against
a Caseta bridge (`fixtures/spec-read-caseta.json`) closed 14 more, leaving
**116** — and those 14 are a fair illustration of what a second platform
buys: `/zone/tuningsettings`, `/area/{areaId}/occupancysettings` and its
daylighting/occupancy-sensor neighbours, `/preset/{presetId}`,
`/virtualbutton/{virtualbuttonId}` — paths RA3 refuses or leaves empty and
Caseta answers with real data. Of the 116 that remain, 93 *have* now been
sent and answered with something other than `200`: 54 drew a
`400 BadRequest` refusal, 34 a `404` for an instance that does not exist on
the unit asked, 26 a `204`, and 6 a `405` (these overlap — a path probed on
more than one platform can appear under more than one status; see
`docs/platforms.md`). Only 23 have still never been sent. So the
number now means largely "asked and not answered `200`", but it is still a
"not yet evidenced" count rather than a "hardware refused it" count, and
the two should not be conflated.

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
3. **Redact and commit real probe fixtures** (`npm run redact`, driven by the
   `captures.json` manifest) — real captured traffic, scrubbed of IPs, MAC
   addresses, serial numbers, and other identifying data, into
   `fixtures/ra3.json`, `fixtures/caseta.json`, and, from a later,
   single-processor RA3 probe sweep,
   `fixtures/sweep-read.json` and `fixtures/sweep-write.json`, and, from the
   coverage-blind replay of the specification's own path list, against RA3
   firmware v03.249 and against a Caseta bridge twice — once provisioned and
   once after a factory reset with no devices at all —
   `fixtures/spec-read.json`, `fixtures/spec-read-caseta.json` and
   `fixtures/spec-read-caseta-bare.json` — seven manifest entries in all, plus
   four non-`{path: {status, body}}` artifacts outside that manifest:
   `fixtures/subscriptions.json` (a subscribe-attempt log),
   `fixtures/late-frames.json` (asynchronous-response evidence — see
   `docs/protocol.md`), `fixtures/push-probe.json` (a subscription-push
   frame log — see `docs/subscriptions.md`) and
   `fixtures/push-experiments.json` (six more single-connection frame logs,
   keyed by run: the tag-padding pair that settles how a push's `ClientTag`
   is derived, the first Caseta push evidence, a run in which zones moved
   with no write issued by the client, a device join, and a silent connect —
   see `docs/subscriptions.md` and
   `docs/platforms.md`). These are the corpus every generated schema is
   checked against.
4. **Hand-refine** a subset of the generated paths and schemas — 24 of 170
   generated path families, 259 of 636 generated schemas as of this writing
   (see "What is and is not covered" above; `spec/paths/` ships one more
   family and `spec/components/schemas/` 61 more schemas, hand-authored with
   no generated counterpart to refine from) — into `spec/paths/` and
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

## Before publishing: the manual leak sweep

`npm run redact` (`lib/redact.ts`) covers `fixtures/` and nothing else. It
cannot see a real value typed by hand anywhere else in the tree — as a test
input, as an illustrative example inside a code comment, or quoted in prose.
That is the class of leak this project has actually had, more than once, and
every instance was a real value used *because it looked realistic*.

**This cannot be automated in CI, and nothing below should be added to
`.github/workflows/ci.yml`.** CI has no access to the raw captures — that is
the design, and it is the same reason CI cannot run `npm run redact` (the
captures live in a separate, private research repository; see "How to
regenerate" above). Without them there is nothing to compare a hand-typed
literal against, so no test, lint rule or hook in this repository can tell a
real household value from an invented one. The only control is a manual
sweep, run before publishing by someone who has the captures.

Pattern matching is not that control. `PATTERNS` in `lib/redact.ts` matches
value *shapes* — IPv4, MAC, IPv6, GUID, email — and the values most likely
to be hand-typed as realistic-looking examples have no shape at all: room
and area names, keypad engravings, contact names, timezones. Shapes are also
brittle in ways that only surface afterwards: the bare-hex GUID rule
(`/^[0-9A-F]{32,}$/`) is upper-case only, so a lower-case hex identifier of
the same length passes straight through it.

The method that has caught every leak so far is a cross-reference — harvest
the literal values out of the raw captures, then search the tracked tree for
each one. Three refinements are load-bearing, and each was learned from a
leak that survived an earlier sweep which had declared the tree clean.

1. **Harvest from every key, not just the sensitive ones.** One leak sat
   under a `GUID` key. `GUID` is not in `SENSITIVE_STRING_KEYS`
   (`TransferGUID` is), so a harvest driven by the redactor's own key list
   could never have produced that value to search for. Harvest the capture
   *filenames* too, and the literals embedded in any earlier sweep's or
   tool's own patterns and comments — a real address once lived inside this
   repository's documented capture-filename pattern in `tools/redact.ts`,
   put there as a helpful example of what a capture file is called.
2. **Match as substrings against raw file text, not as whole values against
   parsed JSON.** Two leaks were real values embedded in composite strings
   of the form `"<real name> Bedroom"`, which whole-value comparison cannot
   see — and they sat in test inputs and code comments, so there was no JSON
   to parse in the first place.
3. **Sweep the commit messages, as a separate pass.** Messages and code
   comments are published content too. The fifth leak was in a commit message
   whose stated purpose was removing real values from a test file: the file it
   changed came out clean, and the message explaining what it had removed
   quoted them — two room/device names and a personal email address. Three
   properties kept it invisible to every sweep before it, and each is its own
   trap. First, the sweep read file contents only: `git grep` searches tracked
   blobs and does not read commit messages, so no variation of it can find
   this. Sweeping messages is a separate command — `git log --all --format=%B`
   — not a flag on the same one. Second, the harvested literal set had been
   built from `Text` keys while the values sat under `Name` and
   `FullyQualifiedName`, the same narrowing refinement 1 describes, so they
   were never candidates to search for. Third, the blob-purge rules could not
   have matched them even if they had been in the set: those rules were
   deliberately anchored to JSON syntax (`"Key": "value"`) so they could not
   corrupt a YAML enum member that happens to share a word with a room name,
   and anchoring to JSON syntax means, by construction, that they cannot match
   prose.

Purging a message is a different operation from purging a file, too.
`git filter-repo --replace-text <rules>` rewrites blob contents;
`--replace-message <rules>` rewrites commit and tag messages. They take the
same expression-file syntax, but neither implies the other — a history
rewrite that purges files leaves every message exactly as it was, so both
passes have to be run.

Write those message rules against composite values, not fragments of them.
Getting this wrong damages history rather than merely missing a leak. The
naive rule set derived from the leak above included two six-character
fragments. One was a word inside a longer real value and was already covered
by the longer rule. The other was a vendor product-family token that also
occurs as ordinary prose in an unrelated commit message; replacing it would
have corrupted a legitimate message to remove nothing.

One rule follows from the same reasoning as the three above: **check
replacements the same way before using them.** A synthetic stand-in that
happens to occur in the captures is not a fix.

When a value has to be explained, describe the category and never quote an
instance. `lib/redact.ts`'s comment on the `Text` key is the model: it says
exactly what keypad engravings are and why they are sensitive without
reproducing one.

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
