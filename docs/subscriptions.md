# Subscriptions

LEAP's subscription mechanism is the one place this specification's HTTP-shaped
mapping is a genuine convention rather than a description of the wire
protocol — OpenAPI has no native concept of a server pushing further messages
after the initial response. This document is the full lifecycle account,
including the `ClientTag` question this project carried as open from its design
stage until a live push probe answered it.

See `docs/protocol.md` for the underlying `ClientTag` correlation mechanism
this all depends on, and `docs/mapping.md` for how `x-leap-subscribable` and
`x-leap-event-schema` fit into the OpenAPI mapping generally.

## The push probe, and what it is evidence for

Everything in this document about *pushed* frames comes from one capture:
`fixtures/push-probe.json` (redacted; 27 frames). Its scope is worth stating
before its findings, because the findings are specific and the scope is
narrow.

A single LEAP connection to **one RA3 processor** — the same target as the
sweep corpora `fixtures/sweep-read.json`, `fixtures/sweep-write.json` and
`fixtures/subscriptions.json` (see `docs/platforms.md`, and
`tools/redact.ts`'s `PUSH_PROBE_DIR` comment) — in
**one installation**, on **one run** kept open for 26 seconds. The capture's own
`note` describes the shape: `"single connection: subscribe, level change,
hold, restore"`. Two subscriptions were opened, one dimmer zone
(`"zone": 4664`, `"originalLevel": 0`, `"targetLevel": 50`) was driven
0% → 50% → 0% by LEAP command, and every frame the socket delivered in
between was logged in order.

That is a real answer to a question that had none, and it is also one
processor, one installation, one run. **Caseta and Vive were not
tested at all**, here or anywhere in this project's push evidence; nothing
below should be read as a statement about them.

## Lifecycle

1. **`SubscribeRequest`** — the client sends a tagged request to a
   subscribable URL, structurally identical to a `ReadRequest` (`Header.Url`,
   a `ClientTag`, no `Body`).
2. **`SubscribeResponse`** — the server replies, using the *same* `ClientTag`
   as the request (ordinary request/response correlation, per
   `docs/protocol.md`). The response body carries the resource's **initial
   state**, in the same shape a `ReadResponse` for that resource would carry.
   A client that only wants "notify me of future changes" still receives —
   and in this project's client implementation, must consume — a full current
   snapshot as part of subscribing. Observed directly: the probe's
   `SubscribeRequest` to `/zone/status` (`"tag": "lt-18"`) came back
   `"communiqueType": "SubscribeResponse"`, `"StatusCode": "200 OK"`,
   `"MessageBodyType": "MultipleZoneStatus"`, carrying **46** `ZoneStatuses`
   entries — every zone on the system, not just the one about to change.
3. **Unsolicited pushes** — some time later, with no further request from the
   client, the processor sends additional frames when the subscribed
   resource's state changes. These are the frames `x-leap-event-schema`
   points at. On the wire they arrive as:
   - `CommuniqueType: "ReadResponse"` — **not** `SubscribeResponse`, and not
     a distinct push communique type. See `docs/protocol.md`'s
     "The 14 CommuniqueTypes."
   - `Header.StatusCode: "200 OK"` and `Header.Url` echoing the subscribed
     URL exactly (`/zone/status`, `/area/1340/status`).
   - `Header.ClientTag` **equal to the originating `SubscribeRequest`'s
     tag** — see the next section.
   - a body that is a **delta, not a snapshot** — see "Push bodies are
     deltas."
4. **`UnsubscribeRequest`** — the client sends a tagged request to end the
   subscription. (No `UnsubscribeResponse` behavior is captured in this
   project's corpus beyond its listing among the 14 CommuniqueTypes in
   `docs/protocol.md`.)

## The `ClientTag` question, answered: pushes reuse the subscription's tag

**Question:** do the unsolicited push frames in step 3 reuse the `ClientTag`
from the original `SubscribeRequest`, carry a different tag, or omit
`ClientTag` entirely?

**Answer, on the processor tested: they reuse the originating
`SubscribeRequest`'s tag.**

The probe opened two subscriptions on one connection:

| Subscribed URL | `SubscribeRequest` tag | `SubscribeResponse` |
|---|---|---|
| `/zone/status` | `lt-18` | `200 OK`, `MultipleZoneStatus` |
| `/area/1340/status` | `lt-19` | `200 OK`, `OneAreaStatus` |

The zone command went out separately on its own tag: `"commandTag": "lt-20"`,
a `CreateRequest` to `/zone/4664/commandprocessor`, answered
`"commandStatus": "201 Created"`.

224 ms after that write, an unsolicited frame arrived (`seq` 21):

```json
{
  "communiqueType": "ReadResponse",
  "header": {
    "MessageBodyType": "MultipleZoneStatus",
    "StatusCode": "200 OK",
    "Url": "/zone/status",
    "ClientTag": "lt-18"
  }
}
```

`lt-18` is the `/zone/status` subscription's own tag. All 5 pushes in the
capture behave this way: the two `/zone/status` pushes (`seq` 21, 25) carry
`lt-18`; the three `/area/1340/status` pushes (`seq` 22, 23, 26) carry
`lt-19`. Every one is recorded with
`"classification": "push-on-request-tag"` and
`"deliveredToOnEvent": true` — the harness routed every frame through the
client router described in `docs/protocol.md`, and that field records that
each push did in fact reach `onEvent` rather than resolving a pending
request.

**One control rules out the boring explanation.** With two subscriptions
live on the same socket simultaneously, each push carried *its own*
subscription's tag rather than a single connection-wide constant — so the tag
is per-subscription, not merely per-connection.

What this control does *not* separate is the tag from the subscribe
request's *position* in the sequence. The committed run does pad the tag
counter: `sentRequests` shows 17 `ReadRequest`s issued before the first
`SubscribeRequest`, so the subscribe is the eighteenth request on the
connection.

```
$ node -e '
const d = JSON.parse(require("fs").readFileSync("fixtures/push-probe.json","utf8"));
console.log(JSON.stringify(d.sentRequests.map(r => [r.tag, r.communiqueType, r.url])));'

[["lt-1","ReadRequest","/zone/4664"],["lt-2","ReadRequest","/zone/4664/status"],
 ["lt-3","ReadRequest","/area"],["lt-4","ReadRequest","/area/32/associatedzone"],
 ... ["lt-17","ReadRequest","/area/1340/associatedzone"],
 ["lt-18","SubscribeRequest","/zone/status"],
 ["lt-19","SubscribeRequest","/area/1340/status"], ...]
```

Those 17 are a discovery prelude rather than filler: `lt-1` and `lt-2`
read the zone the run is about to drive, `lt-3` lists the areas, and
`lt-4`…`lt-17` walk each area's zones. Several of them touch resources the
subscriptions then cover — zone 4664 is one of the 46 entries in
`lt-18`'s snapshot, and `lt-17` reads the associated zones of the very area
`lt-19` subscribes to. That is irrelevant to the argument here, which turns
only on their being **prior**: what advances the tag counter is how many
requests were issued before the subscribe, not what they were about.

So the subscribe lands on `lt-18` because the harness's prelude is a
**fixed length** — 17 requests before the first subscribe — not because
`lt-18` is special and not by coincidence. Padding is already what this run
does; what it cannot do is vary. Distinguishing "the tag is copied from the
subscribe
request" from "the tag is a function of sequence position" needs a run whose
prelude is a *different* length, so the subscribe lands on a tag other than
`lt-18`. That run has not been done, so the claim made here is the narrower
one the evidence supports — each subscription's pushes carry that
subscription's own tag — and not a claim about how the processor derives
the value.

### Why this does not change what a client must do

The routing rule in `$SRC/lib/leap-client.ts`'s `handleData` (excerpted in
`docs/protocol.md`) is unchanged and still correct: look the frame's
`ClientTag` up in the pending-request map; if nothing is pending under it,
route to `onEvent`. That works *because* the `SubscribeResponse` has already
resolved and removed the subscription's tag from the pending map long before
any push arrives on it. The push probe confirms that ordering directly —
the `SubscribeResponse` for `lt-18` landed at 610 ms into the run, the first
push on `lt-18` at 3,845 ms.

What the finding does change is that this is now a **load-bearing
assumption rather than a free one**. Two client-side consequences follow:

- A client must not reuse `ClientTag` values within a session. This
  project's client uses a monotonic counter (`lt-1`, `lt-2`, ...), so it
  cannot collide; a client that recycled tags could send a fresh request
  under a tag some live subscription is still pushing on, and would then
  resolve that request with a subscription push.
- A client must not "remember" a subscription's tag in its pending map in
  order to route pushes by it, unless it also stops treating that map as
  "requests awaiting a reply."

This is distinct from the `102 Processing` behaviour documented in
`docs/protocol.md`, and the distinction is exact rather than a hedge. A
`102` interim ack and its real `200 OK` roughly a second later are **two
frames answering one request**, on a tag that is still pending. A
subscription push arrives on a tag whose request already received its
terminal response, and only when the underlying state moves. Both reuse a
tag; they are not the same mechanism, and a client handles them in
different branches.

## Push bodies are deltas, not snapshots

The initial `SubscribeResponse` is a full snapshot. The pushes that follow
are not — this is the single most consequential detail here for anyone
writing a client.

The `/zone/status` subscribe response carried all 46 zones. The push that
followed the level change carried exactly one entry, for the zone that
moved:

```json
{ "ZoneStatuses": [ { "href": "/zone/4664/status", "Level": 50,
  "Zone": { "href": "/zone/4664" }, "StatusAccuracy": "Good" } ] }
```

Compare that entry with the same zone's entry in the subscribe-time
snapshot:

```json
{ "href": "/zone/4664/status", "Level": 0, "Zone": { "href": "/zone/4664" },
  "StatusAccuracy": "Good", "ZoneLockState": "Unlocked" }
```

The push **omits `ZoneLockState`**, which the snapshot includes. It is not
that the lock state changed to something absent — the read at the end of the
run (`seq` 27, `ReadRequest /zone/4664/status`) still reports
`"ZoneLockState": "Unlocked"`. Unchanged fields are simply not sent. A
client that replaces its cached `ZoneStatus` wholesale with a push body will
lose `ZoneLockState`; it must merge per-field instead.

Area pushes behave the same way, and more starkly. The `/area/1340/status`
subscribe response (`seq` 19) carried
`{"AreaStatus": {"href": "/area/1340/status", "Level": 0,
"OccupancyStatus": "Unoccupied",
"CurrentScene": {"href": "/areascene/1344"}}}`. Its pushes carried only the
fields that moved:

| `seq` | Push body |
|---|---|
| 22 | `{"AreaStatus": {"href": "/area/1340/status", "CurrentScene": null}}` — the area reported no active scene once one of its zones was driven directly |
| 23 | `{"AreaStatus": {"href": "/area/1340/status", "InstantaneousPower": 6, "InstantaneousMaxPower": 10}}` |
| 26 | `{"AreaStatus": {"href": "/area/1340/status", "CurrentScene": {"href": "/areascene/1344"}}}` — and reported `/areascene/1344` again once the zone was restored |

Two consequences for this specification, both stated here rather than
silently patched:

- **`required` in the status schemas does not hold for push bodies.**
  `AreaStatus` declares `required: ["OccupancyStatus"]`, and none of the
  three area pushes above carries `OccupancyStatus`. Validating a push frame
  against the schema as written will fail. The schemas describe full reads
  and subscribe responses, which is what the fixture corpus behind them
  contains; they are not delta schemas. (`ZoneStatus` happens to survive —
  its only required field, `StatusAccuracy`, is present in the observed
  pushes — but that is luck, not a rule.)
- **`x-leap-event-schema` names the element type, not the pushed frame's
  payload, on collection routes.** `/zone/status` carries
  `x-leap-event-schema: ZoneStatus`, while the observed push payload is a
  `ZoneStatuses` array (`MessageBodyType: MultipleZoneStatus`) containing one
  `ZoneStatus`. On singular routes like `/area/{areaId}/status` the marker
  and the payload do coincide. See `docs/mapping.md`.

## Timing, and ordering against the command's own response

Both level changes in the capture produced a `/zone/status` push, and in
both cases the push arrived **after** the commanding request's own terminal
response, not before or instead of it:

| Change | `CreateRequest` sent | `201 Created` | Push on `lt-18` | Push, after the write |
|---|---|---|---|---|
| 0% → 50% (`lt-20`) | 3,621 ms | 3,662 ms | 3,845 ms | **224 ms** |
| 50% → 0% (`lt-21`) | 23,664 ms | 23,707 ms | 23,852 ms | **188 ms** |

(Times are the capture's own `atMs`/`sentAtMs`, relative to the start of the
run. The 224 ms figure is also recorded directly as the push frame's
`"msAfterLevelChange": 224`; that field is measured from the *first* level
change throughout the file, so the second push's `20231` is not the second
change's latency.)

Two sub-second latencies, 224 ms and 188 ms, from the one committed run,
are the whole basis for the "a few hundred milliseconds" characterisation.
That is two observations on one processor under no load, not a latency
budget anyone should design against.

**The `201 Created` is not the push.** Both command responses carried a
`ZoneStatus` body of their own — `seq` 20 reports `"Level": 50`, `seq` 24
reports `"Level": 0`, each with `"Availability": "Available"` — on the
command's tag (`lt-20`, `lt-21`), classified `"response"` and
`"deliveredToOnEvent": false`. Conflating that command response with the
subscription push is easy and wrong: they are different frames, on different
tags, with different `Url`s (`/zone/4664/commandprocessor` versus
`/zone/status`), and a client that has issued no command at all will see the
push and no `201`.

Two samples on one processor is not a latency distribution. Take
"a couple of hundred milliseconds after the write, and after the write's own
reply" as the shape of the behaviour, not as a bound.

## Pushes with no command behind them

Not every push follows a client action. During the hold window between the
two level changes, with nothing being commanded, the `/area/1340/status`
subscription delivered an unprompted metering frame (`seq` 23, 9.6 s after
the level change):

```json
{ "AreaStatus": { "href": "/area/1340/status",
  "InstantaneousPower": 6, "InstantaneousMaxPower": 10 } }
```

Neither `InstantaneousPower` nor `InstantaneousMaxPower` appears in that
area's subscribe-time snapshot at all. So an area subscription is not only a
"something you changed moved" channel — it also emits telemetry on the
processor's own schedule, carrying fields the initial snapshot never showed.
A client must expect push bodies containing fields it has not seen before on
that resource, at times it did not cause.

This also revises, rather than contradicts, what
`fixtures/subscriptions.json` recorded: that campaign saw **zero** frames
across 41 hold windows, which was attributed to a quiet system. (The window
duration was set by the prober and is not recorded in the fixture — its
entries carry only `url`, `requestTag`, `subscribeStatus` and `frames` — so
this document does not state one.) The attribution holds — the metering push
above arrived on an *area* status subscription, and that earlier campaign
did open two of those (`/area/32/status`, `/area/912/status`, both
`200 OK`) without receiving anything. Whatever schedules these frames, those
two areas did not emit one for as long as that campaign held its
subscriptions open.

## What this still does not establish

Stated explicitly rather than left as a confident-sounding gap:

- **Non-LEAP-originated changes.** Every push observed here followed a level
  change the probe harness itself commanded over LEAP. Whether a change made by a
  physical keypad press, a wall dimmer tap, an occupancy sensor, a timeclock
  event, or the Lutron app on another connection produces the same push is
  **untested**. It is a reasonable expectation — the subscription is on the
  resource, not on the caller — but it was not observed.
- **Caseta and Vive.** Untested for push behaviour entirely. `/zone/status`
  answers `GET` on Caseta (`x-leap-platforms`: `caseta: 200 OK`), but that is
  a read result — no Caseta subscribe attempt, and no Caseta push frame,
  exists in this corpus.
- **Whether the delta rule is universal.** Observed on `ZoneStatuses` and
  `AreaStatus`. Whether every subscribable resource pushes deltas, or some
  push full snapshots, is not established.
- **`UnsubscribeResponse`.** Still never captured; no subscription in this
  corpus was ever explicitly torn down rather than dropped with the socket.
- **Push behaviour under load.** One zone changing on a quiet system. Whether
  a burst of simultaneous changes coalesces into one push, or produces one
  push each, is untested.
- **Whether the tag is stable for the life of the subscription.** All 5
  pushes here arrived within 24 seconds of subscribing. A subscription held
  for hours, or one surviving a processor-side reconnect, was not tested.

## The subscribable routes

This specification's bundled OpenAPI document is generated from the firmware
route extraction, which recorded **40** raw `SUBSCRIBE`-verb markers before
hand-refinement. That number should not be quoted as the size of the final,
correct subscribable surface. The accounting from 40 to 19 is:

- **18 excluded as mangled/concatenated path forms** — the class described
  in `docs/mapping.md`: `/areastatus`, `/devicestatus`,
  `/devicestatus/deviceheard`, `/deviceavailabilitystatus`,
  `/devicebatterystatusstatus`, `/emergencystatus`, `/loadcontrollerstatus`,
  `/natlightoptstatus`, `/occupancysensorstatus`, `/operationstatus`,
  `/rentablespacestatus`, `/systemloadsheddingstatus`, `/systemstatus`,
  `/temperaturesensorstatus`, `/timeclockeventstatus`, `/timeclockstatus`,
  `/v2operationstatus`, `/zonetypegroupstatus`. Each was excluded in favour
  of its probe-confirmed, correctly-slashed equivalent where one exists.
- **7 further firmware `SUBSCRIBE` routes not carried into the bundle**, and
  these are ordinary, correctly-slashed routes rather than mangled ones:
  `/emergency/{id}/status`, `/loadcontroller/{id}/status`,
  `/natlightopt/{id}/status`, `/profilesession/{id}/status`,
  `/zonetypegroup`, `/zonetypegroup/{id}`, `/zonetypegroup/{id}/status`.
  Their absence is a genuine open gap in this specification, not a
  refinement — see the `/loadcontroller/{id}/status` note at the end of this
  section, which is one of these 7.
- **4 hand-authored corrected paths added**: `/device/status`,
  `/system/loadshedding/status`, `/system/naturallightoptimization/status`,
  `/zone/status`.

40 − 25 + 4 = 19. Reproduce with:

```
node --import tsx -e '
import { readFileSync } from "node:fs";
import { parse } from "yaml";
const fw = JSON.parse(readFileSync("vendor/leap-routes.json", "utf8"))
  .filter((r) => (r.verbs ?? []).includes("SUBSCRIBE")).map((r) => r.path);
const doc = parse(readFileSync("dist/openapi.yaml", "utf8"));
const marked = new Set();
for (const [p, item] of Object.entries(doc.paths)) {
  if (item["x-leap-subscribable"]) marked.add(p);
  for (const op of Object.values(item))
    if (op && typeof op === "object" && op["x-leap-subscribable"]) marked.add(p);
}
const norm = (p) => p.replace(/\{[^}]+\}/g, "{id}");
const spec = new Set([...marked].map(norm)), fwN = new Set(fw.map(norm));
console.log("firmware SUBSCRIBE markers:", fw.length);
console.log("bundled x-leap-subscribable:", marked.size);
console.log("dropped:", [...fwN].filter((p) => !spec.has(p)).sort());
console.log("added:", [...spec].filter((p) => !fwN.has(p)).sort());
'
```

The `{id}`/`{xid}` merge this specification performs elsewhere (see
`docs/mapping.md`) is **not** part of this arithmetic: none of the 40
markers is on an `{xid}` path, and the only two `{xid}` siblings of
`SUBSCRIBE`-marked routes (`/area/{xid}`, `/zone/{xid}`) are `GET`-only, so
no `SUBSCRIBE` marker is ever double-counted by that split.

The list below is generated directly from the finished, bundled specification
(`dist/openapi.yaml`, produced by `npm run bundle`) rather than hand-typed, so
it reflects what the document actually ships rather than an earlier estimate:

```
node -e '
const fs = require("fs");
const yaml = require("yaml");
const doc = yaml.parse(fs.readFileSync("dist/openapi.yaml", "utf8"));
const subs = [];
for (const [p, item] of Object.entries(doc.paths)) {
  if (item["x-leap-subscribable"]) subs.push(p); // path-item-level (no GET)
  for (const [method, op] of Object.entries(item)) {
    if (op && typeof op === "object" && op["x-leap-subscribable"]) subs.push(p);
  }
}
console.log([...new Set(subs)].sort().join("\n"));
'
```

**19 routes carry `x-leap-subscribable`** in the finished specification. That
is a count of what the document marks, and it is not the same thing as the
count of routes a live processor will actually accept a `SubscribeRequest`
on. The `Probe` column below is the second number, taken from
`fixtures/subscriptions.json` (41 subscribe attempts on one RA3 processor)
and `fixtures/push-probe.json`. **Of the 19 marked routes, 6 are
probe-confirmed, 7 are contradicted by the same processor, and 6 are
neither** — 5 never probed at the specification's own path, and 1
inconclusive. The marker records the firmware route table's `SUBSCRIBE` verb,
and per `docs/platforms.md`, presence in that table does not imply a live
implementation.

| Path | Probe | Notes |
|---|---|---|
| `/area` | **`405`** | `SubscribeRequest /area` → `405 MethodNotAllowed`. The firmware route table records `CREATE`+`SUBSCRIBE` for `/area` and no `GET` at all; `GET /area` here is hand-authored and probe-derived (see `docs/mapping.md`). The subscribe half is not honored by this processor. |
| `/area/{areaId}` | `200 OK` | Confirmed twice (`/area/32`, `/area/912`). |
| `/area/{areaId}/occupancysensorsettings` | `404` | Inconclusive, not a refusal: both probed areas (`32`, `912`) have no such resource, so the verb was never reached. |
| `/area/{areaId}/status` | `200 OK` | Confirmed twice, and the source of 3 of the 5 pushes in `fixtures/push-probe.json`. |
| `/device` | **`405`** | `405 MethodNotAllowed`. |
| `/device/status` | untested | Only the firmware's mangled form `/devicestatus` was probed (`400 BadRequest`). The corrected collection path — hand-authored, see the mangled-path defect in `docs/mapping.md` — was never subscribed to. |
| `/device/{deviceId}` | `200 OK` | Confirmed on `/device/435`. (`/device/532` returned `404`: that instance does not exist.) |
| `/link/{linkId}/memberdiscoverysession/{memberdiscoverysessionId}/status` | untested | Never probed; requires a live discovery session. |
| `/link/{linkId}/status` | `200 OK` | Confirmed twice (`/link/439`, `/link/437`). |
| `/project` | `200 OK` | |
| `/service/bacnetnetworksettings/{bacnetnetworksettingsId}` | untested | Never probed. |
| `/service/bacnetsettings` | **`400`** | `400 BadRequest` — this processor refuses the subscribe. BACnet is a commercial-system feature; whether the refusal is "not supported" or "not configured here" is not established. |
| `/system/loadshedding/status` | untested | Hand-authored path; only the mangled `/systemloadsheddingstatus` was probed (`400`). |
| `/system/naturallightoptimization/status` | untested | Only the firmware's abbreviated form `/natlightoptstatus` was probed (`400`). |
| `/virtualbutton` | **`405`** | `405 MethodNotAllowed`. |
| `/zone` | **`405`** | `405 MethodNotAllowed` — consistent with RA3 having no flat zone-list endpoint at all (see `docs/platforms.md`). |
| `/zone/status` | `200 OK` | **The subscribable zone-status route.** Hand-authored path: the extraction has no `/zone/status` and no bare `/zonestatus`, only four paging variants (`/zonestatusexpandedquerystringwith{explicit,implicit}paging`, `/zonestatus/with/{explicit,implicit}/paging`), all `GET`-only and none `SUBSCRIBE`-marked; confirmed by `fixtures/push-probe.json`, which both subscribed to it and received pushes on it. |
| `/zone/{zoneId}` | **`405`** | `405 MethodNotAllowed` (`/zone/546`, `/zone/574`). |
| `/zone/{zoneId}/status` | **`405`** | `405 MethodNotAllowed` (`/zone/546/status`, `/zone/574/status`). `fixtures/subscriptions.json` records status only — its entries are `{url, requestTag, subscribeStatus, frames}`, with no body field — so the refusal body is not captured for this or any other row in this table. A firmware-recovered route (`vendor/leap-routes.json`: `/zone/{id}/status`, verbs `GET`/`SUBSCRIBE`/`UPDATE`) whose `SUBSCRIBE` verb this processor does not honor. **Per-zone status is not subscribable; the collection `/zone/status` is.** |

That last row is worth dwelling on, because it is why the `ClientTag`
question stayed open as long as it did. The obvious way to watch one light is
to subscribe to that light's own status URL. On this processor that request
is refused outright, so it produces no pushes — not because pushes don't
exist, but because there is no subscription. Watching `/zone/status`, the
collection, works: one subscription covers every zone, and each push names
the zone that moved via its entry's `href`.

One route confirmed subscribable is **absent from the specification
entirely**: `/loadcontroller/{loadcontrollerId}/status` was accepted with
`200 OK` twice (`/loadcontroller/9431/status`, `/loadcontroller/564/status`)
in `fixtures/subscriptions.json`, and the bundled document contains no
`/loadcontroller/{loadcontrollerId}/status` path at all (only
`/loadcontroller/{loadcontrollerId}/commandprocessor`). It is not a route
this project failed to know about, either: it is one of the 7 ordinary,
correctly-slashed firmware `SUBSCRIBE` routes listed above as dropped
between the extraction's 40 and the bundle's 19. Firmware marks it
subscribable, hardware accepted a subscription on it, and the specification
does not have it. The subscribable surface listed above is therefore a
floor, not a ceiling.

App reverse engineering (`$SRC/docs/protocols/leap/api-discovery.md`,
"Subscriptions the App Uses") separately lists 11 resource types the Lutron
app itself subscribes to for live UI updates: `/zone/status`,
`/device/status`, `/device/status/deviceheard`, `/link/status`,
`/occupancygroup/status`, `/system`, `/database`, `/timeclock/status`,
`/tuningsettings`, `/loadcontroller/status`, and
`/naturallightoptimization/status`. That list is app behavior, not a
statement of the full subscribable surface — several of those paths are
either not present in the finished specification at their listed form, or
present via a different, corrected path. It is included here for
cross-reference, not as a second source of truth for the table above. Two
entries in it now read differently, though: the app subscribes to
`/zone/status`, the collection — exactly the route the push probe confirms,
against the per-zone route the processor refuses — and it lists a
load-controller status subscription, a resource this specification carries no
status path for at all, whose per-instance form
(`/loadcontroller/{loadcontrollerId}/status`) the probe accepted.
