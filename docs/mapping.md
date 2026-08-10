# Mapping LEAP onto OpenAPI

LEAP is not REST, but it deliberately mimics HTTP semantics closely enough
(literal HTTP-style status strings, a URL per resource, verb-shaped
operations) that an OpenAPI 3.1 description is a close fit rather than a
forced one. This document is the full account of that mapping: what maps
cleanly, what needed a vendor extension, and where the mapping is
acknowledged to be a convention rather than a protocol fact.

See `docs/protocol.md` for the actual wire protocol these concepts are being
mapped from.

## The verb table

| LEAP | OpenAPI |
|---|---|
| `Header.Url` | path |
| `ReadRequest` | `get` |
| `CreateRequest` | `post` |
| `UpdateRequest` | `put` |
| `DeleteRequest` | `delete` |
| `SubscribeRequest` | `get` with `x-leap-subscribable: true` |
| `Header.StatusCode` | response keys, verbatim (`"200"`, `"400"`, ...) |
| `Body` | `requestBody` (request) / response `content` |
| `Header.MessageBodyType` | schema name, recorded in `x-leap-body-type` |

`SubscribeRequest` does not get its own OpenAPI verb — there is no HTTP verb
that means "start a long-lived subscription." Instead, an operation that
supports subscribing carries `x-leap-subscribable: true` as a sibling of its
`get` operation (or, for the handful of routes with no `GET` at all, on the
path item directly). See `docs/subscriptions.md` for the full lifecycle this
represents.

## The `Body` wrapper

The `Body` row above ("`Body` → `requestBody` / response `content`") elides
one critical detail: **`Body` is a wrapper, not the payload.** On the wire,
`Body` always contains exactly one key — the `Header.MessageBodyType` string
— whose value is the actual payload:

```json
"Body": { "ZoneStatus": { "href": "/zone/518/status", "Level": 100 } }
```

**Every schema in `spec/components/schemas/` describes the unwrapped
payload** (`{"href": "/zone/518/status", "Level": 100}` above), never the
`{"<MessageBodyType>": <payload>}` envelope around it. This is confirmed for
438 of the 439 `200 OK` bodies captured in this project's probe corpus — the
one exception, RA3's `GET /button`, returns a bare `{}`, which has no key to
unwrap. `test/conformance.test.ts` implements this rule directly: it reads
the one key off each captured `Body`, validates that key's value against the
operation's response schema, and validates the bare `{}` case as-is (no key
to unwrap). See `docs/protocol.md` for the full envelope account.

This is the single most important fact for implementing a client from this
document: a reader who parses `Body` itself as the payload will get a
validation or type error on every single response.

## Why `leaps://` is the server scheme

`spec/openapi.yaml`'s `servers` entry is:

```yaml
servers:
  - url: leaps://{host}:8081
    description: >-
      Processor or bridge. The scheme is deliberately not http — see
      docs/protocol.md for the real transport.
```

`leaps://` is not a registered scheme and no client library will resolve it.
That is the point: LEAP is newline-delimited JSON over a persistent mutual-TLS
socket, not request/response HTTP (`docs/protocol.md`), and a `https://` or
`http://` server URL would actively mislead a reader into thinking they could
point a REST client or `curl` at it. The unusual scheme is a signal to stop
and read `docs/protocol.md` before writing a client.

## The three `x-leap-*` extensions

Three vendor extensions carry information OpenAPI has no native slot for:

- **`x-leap-communique-type`** — the literal `CommuniqueType` string
  (`ReadRequest`, `CreateRequest`, ...) for this operation. The verb mapping
  above (`ReadRequest` → `get`, etc.) is a convention this document imposes;
  `x-leap-communique-type` states the actual wire value so a reader never has
  to reverse the convention.
- **`x-leap-body-type`** — the `Header.MessageBodyType` value the processor
  actually sends, e.g. `ZoneExpandedStatus`, `ButtonGroupsExpanded`. This is
  usually, but not always, the same name as the response schema — the two are
  kept as separate facts because they come from different sources (the
  firmware struct name vs. the wire field), and 12 of 16 probe-confirmed
  single-segment collection GETs are cases where they diverge: the firmware
  labels the body type with the singular struct name (e.g. `Zone`) while the
  wire body key is plural (`Zones`). See "Collection GETs and the
  singular/plural defect" below.
- **`x-leap-platforms`** — observed `Header.StatusCode` per platform for a
  `ReadRequest` on this operation's URL, e.g. `{ra3: "405 MethodNotAllowed",
  caseta: "200 OK"}`. **It reflects `ReadRequest` probes only.** The probe
  sweeps that produced `fixtures/ra3.json` and `fixtures/caseta.json` never
  sent a `CreateRequest`, `UpdateRequest`, or `DeleteRequest` — every probed
  status is what a `GET` got back. Accordingly, `tools/bundle.ts` injects
  this extension (and the rendered table below it) only onto each path's
  `get` operation, never onto `post`/`put`/`delete`. A platform that was
  never probed for a given path reads `"not probed"` rather than being
  omitted, so a reader can tell "confirmed to reject this" apart from
  "nobody tried it." See `docs/platforms.md` for the full cross-platform
  account this feeds.

### Why they are mirrored into descriptions

Redoc and Scalar — the renderers this document targets — hide `x-*` keys by
default. Left alone, all three extensions above would be present in the spec
but invisible on the rendered site. `tools/bundle.ts` addresses this for
`x-leap-platforms` specifically: at build time, it renders each operation's
platform-status map into a markdown table and appends it to that operation's
`description`, so it survives extension-hiding and shows up in the rendered
prose. `x-leap-communique-type` and `x-leap-body-type` are not similarly
duplicated into description text — each is a single short value rather than a
table, discoverable in the raw spec or via a renderer's "show extensions"
toggle without materially losing readability by staying out of the prose.

## Subscription markers: `x-leap-subscribable` and `x-leap-event-schema`

Two more vendor extensions, scoped narrowly to the subscription lifecycle
rather than to every operation like the three above — see
`docs/subscriptions.md` for the full lifecycle account these support:

- **`x-leap-subscribable`** — `true` on any operation that also accepts a
  `SubscribeRequest`. It sits on the `get` operation (the convention this
  document also uses for `/area`, even though the firmware route table
  records no `GET` verb for it at all — see `spec/paths/area.yaml`'s
  hand-authored `GET /area`); the fallback of placing it on the path item
  itself is for a route with no `GET` operation in the finished
  specification at all, which does not currently occur. 19 routes carry this
  marker in the finished specification. The marker records the firmware route
  table's `SUBSCRIBE` verb, which is not the same claim as "a live processor
  will accept a `SubscribeRequest` here" — 7 of the 19 were refused (`405`,
  one `400`) by the probed RA3 unit. `docs/subscriptions.md` has the
  route-by-route probe result.
- **`x-leap-event-schema`** — a `$ref` to the schema of the *resource* the
  processor pushes on that subscription once it is active (an unsolicited
  push, in `docs/subscriptions.md`'s terms). On a singular route it is also
  the pushed frame's payload schema; on a **collection** route it is the
  element type, not the payload — `/zone/status` carries
  `x-leap-event-schema: ZoneStatus`, while the push observed in
  `fixtures/push-probe.json` carries `MessageBodyType: MultipleZoneStatus`
  and a `ZoneStatuses` array containing the changed entries. In either case
  the pushed object is a **partial**: only the fields that changed, so the
  referenced schema's `required` list does not hold for a push frame. See
  `docs/subscriptions.md`. It sits in the same place as
  `x-leap-subscribable` — the `get` operation, or the path item when there is
  none. It is present only where a subscribable route also has a known
  response type recovered from the firmware extraction: 16 of the 19
  subscribable routes carry one. The 3 that don't
  (`/area/{areaId}/occupancysensorsettings`,
  `/service/bacnetnetworksettings/{bacnetnetworksettingsId}`,
  `/service/bacnetsettings`) still carry `x-leap-subscribable: true`, but the
  shape of what gets pushed on them is not established in this specification —
  and for `/service/bacnetsettings` the probed processor refused the subscribe
  outright (`400 BadRequest`), so there may be nothing to push.

Neither is mirrored into rendered `description` text the way
`x-leap-platforms` is (see "Why they are mirrored into descriptions" above)
— both stay as raw extension keys, visible in the spec source and via a
renderer's "show extensions" toggle.

## Collection GETs and the singular/plural defect

The firmware route extraction that this specification's schemas are generated
from mislabels every single-segment collection endpoint it defines: the
`Header.MessageBodyType` (and therefore the `responseType` the extraction
recorded) is the **singular** struct name — `Zone`, `Device`, `Button` — while
the wire body is actually `{"<Plural>": [...]}` — `Zones`, `Devices`,
`Buttons`. This is confirmed against captured traffic for 12 of the 16
probe-confirmed collection GETs (`/button`, `/buttongroup`, `/device`,
`/facade`, `/link`, `/programmingmodel`, `/service`, `/virtualbutton`,
`/zone`, and others).

It cannot be fixed by adjusting the code generator, because the underlying
cause is structural: the firmware's own type definitions (`leap-types.json`,
636 Go struct definitions recovered from the binary) contain **no plural
collection-wrapper types** — no type whose definition is a bare array of a
singular type (`type: array, items: { $ref: <Singular> }`), the shape a
`Zones` or `Devices` schema needs. This is narrower than "no plural types at
all": the extraction does have a handful of plural-*named* types
(`UnconfiguredSensors`, `TimeclockEventRules`, `OccupancyAggregationRules`,
`RepeatableDeviceRules`), but every one of them is an object wrapping a
named `Rules`/`Occupancy` array field inside it, not a bare array alias --
none of them are the collection-wrapper shape a `Zones`/`Devices`-style
schema needs, and none of them help recover the missing wrapper types this
section is about. The plural collection wrapper is a wire-only convention
the firmware itself never models with that shape. Every collection response
schema in this specification (`Zones`, `Devices`, and so on) is therefore
hand-authored — `type: array, items: { $ref: <Singular> }` — rather than
generated, with a description on each recording the mislabel and which
platform's captured traffic confirmed the correction.

## Mangled collection and reordered paths

Separately from the body-type defect above, the firmware route extraction
also gets some **path strings** wrong. Two distinct failure modes, both
confirmed against captured traffic:

1. **Concatenated segments.** The extraction's tokenizer, working from
   compiled Go identifiers, sometimes fails to find a segment boundary and
   emits a path with a slash silently dropped — `/devicestatus` instead of
   the real `/device/status`, `/systemaway` instead of `/system/away`.
2. **Reordered segments.** In one case the extraction gets the segment order
   itself wrong: it records `/zone/{id}/expanded/status`, while captured
   traffic on both RA3 and Caseta shows the real path is
   `/zone/{id}/status/expanded`.

18 probe-confirmed path templates were affected across the whole
specification. Per this project's own ruling, probe data wins over the
firmware extraction for path *form* in every one of these cases — the
mangled generated forms are excluded from the bundled specification, and the
correct, traffic-confirmed paths are hand-authored in their place. Each
hand-authored path's YAML file states this explicitly and cites the
confirming capture.

## Merged id/xid paths

A third, unrelated path-level adjustment: in LEAP, several resources are
addressable either by a numeric integration id or by an XID string, and the
firmware route extraction records both as separate routes (e.g.
`/area/{id}` and `/area/{xid}`). OpenAPI forbids two paths in the same
document that differ only in a path parameter's name — Redoc's
`no-identical-paths` rule rejects it, and rightly so, since both would
normalize to the same template. Dropping one silently would lose a real
access path, so instead each such pair is merged into a single path (e.g.
`/area/{areaId}`) whose parameter description documents both accepted forms,
keeping the union of whichever operations, subscribability, and event schema
either half of the pair carried. `spec/paths/area.yaml` and
`spec/paths/zone.yaml` both record a concrete example of this merge and the
reasoning for which half's metadata was kept.

## The flat `Command` model

Every `*/commandprocessor` endpoint (`POST`, mapping to `CreateRequest`)
accepts the same request body schema: `Command`. It is **not** a
discriminated `oneOf` union keyed on `CommandType`, even though that is how
the source material's own tables read at a glance (roughly a dozen zone
commands listed per family). The firmware struct settles the actual shape:
one flat object of **57 fields** — a required `CommandType` discriminator
plus **56 optional fields**, of which **54** are `*Parameters` shapes (one per
command family — `DimmedLevelParameters`, `AddressDeviceParameters`, and so
on), plus a generic `Parameter` array and one `GenerateLogPackageSession`
field. A client sets `CommandType` and populates the one matching field; every
other field is simply absent from the request.

An earlier design draft modeled `Command` as a `oneOf` with a `discriminator`
on `CommandType`, inferred from app-RE tables that list only about 13 zone
commands. The firmware struct disproves that model — it would have
misrepresented the wire format and omitted three quarters of the real command
surface (54 parameter fields against the ~13 the app-RE tables enumerate by
themselves).

### Why the command surface is hand-authored, not generated

The firmware route extraction — 410 routes recovered from the processor
binary — contains **zero** `commandprocessor` routes. (`grep` for "command"
across the full extraction returns nothing.) This is not because the route
table only records read-path handlers in general — it doesn't: 51 `CREATE`,
90 `UPDATE`, and 44 `DELETE` verbs with named handlers are recovered
elsewhere in `vendor/leap-routes.json`, and `lib/route-to-path.ts` maps all
of them to `post`/`put`/`delete` operations throughout this specification.
The gap is narrower and specific to command processors: the extraction never
recovered a single `commandprocessor` route, in any verb, for any resource.
That means the entire command surface documented here — the 10 `commandprocessor` paths
(`zone`, `area`, `device`, `link`, `loadcontroller`, `naturalshow`,
`database`, `daynightmode`, `system`, `virtualbutton`), the `Command`
schema's field list, and the `CommandType` enum's 39 members — is
hand-authored from Android and iOS
app reverse engineering (`api-discovery.md`, decompiled from
`com.lutron.lsb` v26.1.0.4; and `index.md`'s "Route Reference (from iOS App
Binary RE)" section, decompiled from the iOS app v26.0.0, itself packaged
under the same `com.lutron.lsb` identifier), not from captured traffic or the
firmware binary. No command-processor `CreateRequest` was ever sent during
probing (probing only exercised read-only routes), so there is no captured
wire example of a full command envelope succeeding, and no captured example
of what a command processor's success response body looks like — each
`commandprocessor` path's `200` response in this specification is
deliberately left without an asserted schema rather than inventing one.

### `CommandType` → parameter field

The table below is generated from this specification's own `Command.yaml`
schema description, which is the authoritative, per-source-cited version.
Where a `CommandType` string is confirmed by a source but which `Parameters`
field it populates is not stated by that source, the table says "not
established" rather than guessing from name similarity — see
`spec/components/schemas/CommandType.yaml` for the specific, deliberate
exclusions (command names mentioned only as class-name fragments or informal
paraphrases in the source prose, not as literal wire strings).

| CommandType | Parameter field | Established by |
|---|---|---|
| `GoToDimmedLevel` | `DimmedLevelParameters` | api-discovery.md Zone Commands table |
| `GoToSwitchedLevel` | `SwitchedLevelParameters` | api-discovery.md Zone Commands table |
| `GoToShadeLevel` | `ShadeLevelParameters` | api-discovery.md Zone Commands table |
| `GoToShadeLevelWithTilt` | `ShadeWithTiltLevelParameters` | api-discovery.md Zone Commands table |
| `GoToShadeLevelWithTiltWhenClosed` | `ShadeWithTiltWhenClosedLevelParameters` | api-discovery.md Zone Commands table |
| `GoToTilt` | `TiltParameters` | api-discovery.md Zone Commands table |
| `GoToSpectrumTuningLevel` | `SpectrumTuningLevelParameters` | api-discovery.md Zone Commands table |
| `GoToWhiteTuningLevel` | `WhiteTuningLevelParameters` | api-discovery.md Zone Commands table |
| `GoToWarmDim` | `WarmDimParameters` | api-discovery.md Zone Commands table |
| `GoToMixedLevel` | `MixedLevelParameters` | api-discovery.md Zone Commands table |
| `Raise` | (none) | api-discovery.md Zone Commands table — explicitly no parameters |
| `Lower` | (none) | api-discovery.md Zone Commands table — explicitly no parameters |
| `Stop` | (none) | api-discovery.md Zone Commands table — explicitly no parameters |
| `AddressDevice` | `AddressDeviceParameters` | api-discovery.md Device Commands table + full envelope example |
| `UnaddressDevice` | `UnaddressDeviceParameters` | api-discovery.md Device Commands table |
| `StartIdentify` | `IdentifyParameters` | api-discovery.md Device Commands table (marked optional there) |
| `StopIdentify` | `IdentifyParameters` | api-discovery.md Device Commands table (marked optional there) |
| `CloudProvision` | (none) | api-discovery.md Device Commands table + explicit "bare command type" example |
| `CacheDeviceHeard` | `CacheDeviceHeardParameters` | api-discovery.md Link Commands table |
| `RequestBeginUnassociatedDeviceDiscovery` | `RequestBeginUnassociatedDeviceDiscoveryParameters` | api-discovery.md Link Commands table |
| `ApplyNow` | `ApplyNowParameters` | api-discovery.md "ApplyDatabaseCommand" section, explicit |
| `BeginTransferSession` | `BeginTransferSessionParameters` (schema `DatabaseTransferSessionCreate`) | api-discovery.md "BeginTransferSessionCommand" section, explicit |
| `PressAndRelease` | (none) | index.md System Actions — a captured Caseta v01.123 response body has no parameters key (also validated by this repository's own `/system/action` fixture) |
| `SystemStatusUpdate` | not established | api-discovery.md names the CommandType; no Parameters column or matching field name given |
| `GoToGroupLightingLevel` | not established | index.md Non-Zone Command Classes table; candidate field `GroupLightingLevelParameters` exists but no source ties them together |
| `EditDayNightMode` | not established | index.md Non-Zone Command Classes table; candidate field `EditDayNightModeParameters` exists but no source ties them together |
| `EditNaturalShowRamp` | not established | index.md Non-Zone Command Classes table; candidate field `EditNaturalShowRampParameters` exists but no source ties them together |
| `GenerateLogPackage` | not established | index.md Non-Zone Command Classes table; two candidate fields exist (`GenerateLogPackageParameters`, `GenerateLogPackageSession`) and which one this populates is unclear |
| `Filter` | not established | index.md Non-Zone Command Classes table; candidate field `FilterParameters` exists but no source ties them together, and this CommandType's owning endpoint is itself unclear |
| `DeviceDiscovery` | not established | index.md Non-Zone Command Classes table; no candidate field name matches |
| `TestHighEndTrim` | not established | index.md Non-Zone Command Classes table (TuningSettingsCommand row); candidate field `TuningSettingsParameters` is generic/shared, not confirmed |
| `TestLowEndTrim` | not established | index.md Non-Zone Command Classes table (TuningSettingsCommand row); candidate field `TuningSettingsParameters` is generic/shared, not confirmed |
| `GoToFanSpeed` | not established | index.md Zone Commands (Fan) section; candidate field `FanSpeedParameters` exists but no source ties them together |
| `GoToBrightnessLevel` | not established | index.md Zone Commands (Spectrum/Ketra) section; no candidate field name matches |
| `GoToVibrancyLevel` | not established | index.md Zone Commands (Spectrum/Ketra) section; no candidate field name matches |
| `EnableAutoVibrancy` | not established | index.md Zone Commands (Spectrum/Ketra) section; no candidate field name matches |
| `GoToCurveDimming` | not established | index.md Zone Commands (Spectrum/Ketra) section; no candidate field name matches |
| `GoToNaturalShow` | not established | index.md Zone Commands (Spectrum/Ketra) section; distinct from `EditNaturalShowRamp`, no candidate field name matches |
| `StopIfMoving` | not established | index.md Zone Commands (Shade) section; no candidate field name matches |

That is 39 `CommandType` members: 23 with confirmed behavior (18 with a
source-confirmed parameter field, 5 explicitly parameterless) and 16 marked
"not established." Deliberately excluded from the enum entirely (not shown above)
are several more names that appear in the source material only as class-name
fragments, informal paraphrases, or unconfirmed inferences — see
`spec/components/schemas/CommandType.yaml` for the specific list and the
reasoning for each exclusion. 29 firmware-confirmed `*Parameters` fields (plus
the generic `Parameter` array and `GenerateLogPackageSession`) have no
source-confirmed `CommandType` at all — real fields in the wire struct with
no known trigger string; see `spec/components/schemas/Command.yaml` for that
list.

This table is the *only* fidelity check available for the command surface,
since no captured traffic exists to validate against — which is also why gaps
are marked "not established" throughout rather than filled in by inference
from naming patterns.
