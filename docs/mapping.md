# Conventions and extensions

Two things this reference does that the wire protocol (`docs/protocol.md`)
does not: vendor extensions carrying facts there is no standard slot for, and
corrections to the firmware extraction the schemas are generated from.

## Extensions

- **`x-leap-communique-type`** — the literal `CommuniqueType` for the
  operation (`ReadRequest`, `CreateRequest`, ...), so the verb it is filed
  under never has to be reversed.
- **`x-leap-body-type`** — the `Header.MessageBodyType` the processor sends.
  Usually the response schema's name, but not always — see "Singular
  collection body types" below.
- **`x-leap-platforms`** — observed `Header.StatusCode` per platform. From
  `ReadRequest` probes only, so it is injected onto `get` alone; a platform
  nobody probed reads `"not probed"` rather than being omitted
  (`docs/platforms.md`).
- **`x-leap-subscribable`** — `true` where the firmware route table records a
  `SUBSCRIBE` verb. There is no verb for "start a long-lived subscription",
  so this marker is how a subscribable operation is identified. 20 routes
  carry it; the probed RA3 refused 7 of them (`docs/subscriptions.md`).
- **`x-leap-event-schema`** — the resource pushed once that subscription is
  active. On a collection route it is the *element* type, not the pushed
  payload (`/zone/status` carries `ZoneStatus`; the push observed in
  `fixtures/push-probe.json` is a `ZoneStatuses` array). Every push is a
  partial — only changed fields — so the referenced schema's `required` list
  does not hold for one. 17 of the 20 subscribable routes carry it.

## Extraction defects

The route and type extraction (`vendor/`) is wrong in three systematic ways.
Captured traffic wins over the extraction in all three, and each corrected
file cites the capture that confirms it.

### Singular collection body types

Every single-segment collection endpoint is labelled with the singular struct
name — `Zone`, `Device`, `Button` — while the wire body is
`{"Zones": [...]}`. Confirmed against traffic for 12 of the 16
probe-confirmed collection GETs.

Not fixable in the generator: the firmware's 636 struct definitions contain
no bare-array wrapper type at all — the four plural-*named* types it does
have (`UnconfiguredSensors`, `TimeclockEventRules`,
`OccupancyAggregationRules`, `RepeatableDeviceRules`) each wrap a named array
field inside an object, which is not the shape a `Zones` needs. Every plural
collection schema here is therefore hand-authored.

### Mangled paths

The tokenizer, working from compiled Go identifiers, drops segment boundaries
— `/devicestatus` for `/device/status`, `/systemaway` for `/system/away` —
and in one case reorders them: `/zone/{id}/expanded/status` for the real
`/zone/{id}/status/expanded`. 18 probe-confirmed path templates were
affected. The mangled forms are excluded from the bundle and the correct
paths hand-authored.

### Split id/xid routes

Resources addressable either by a numeric integration id or by an XID string
are extracted as two routes (`/area/{id}`, `/area/{xid}`). Two paths
differing only in a parameter name are not legal in one document, and
dropping either would lose a real access path, so each pair is merged into
one path (`/area/{areaId}`) whose parameter documents both forms, keeping the
union of whichever operations, subscribability, and event schema either half
carried.

## Commands

Every `*/commandprocessor` endpoint takes the same body: `Command`. It is not
a discriminated union — the firmware struct is one flat object of 57 fields,
a required `CommandType` plus 56 optional ones, 54 of them `*Parameters`
shapes. A client sets `CommandType` and populates the one matching field;
everything else is absent.

The entire command surface is hand-authored. The extraction recovered 410
routes and **zero** `commandprocessor` routes, in any verb, for any resource
— not a read-path-only route table, since 51 `CREATE`, 90 `UPDATE` and 44
`DELETE` verbs are recovered elsewhere in it. So the 10 paths, the `Command`
field list, and the 39 `CommandType` members all come from Android and iOS
app RE rather than from traffic or the binary: 23 members have confirmed
behavior, 16 are marked "not established", and 29 firmware-confirmed
`*Parameters` fields have no known trigger string at all.
`Command.yaml` carries the per-member table with the evidence for each and
`CommandType.yaml` records what was deliberately excluded — both are
authoritative over any summary of them.

The only captured command traffic is two zone commands whose request bodies
were never logged (`docs/protocol.md`, `CommandResponse` row). That is why
`/zone/{zoneId}/commandprocessor` has a `201` response schema and the other
nine paths deliberately have none.
