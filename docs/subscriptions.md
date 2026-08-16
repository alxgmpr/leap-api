# Subscriptions

LEAP's subscription mechanism is the one place this specification's HTTP-shaped
mapping is a genuine convention rather than a description of the wire
protocol — an HTTP-shaped description has no concept of a server pushing
further messages after the initial response. This document is the full lifecycle account,
including the `ClientTag` question this project carried as open from its design
stage until a live push probe answered it.

See `docs/protocol.md` for the underlying `ClientTag` correlation mechanism
this all depends on, and `docs/mapping.md` for what `x-leap-subscribable`
and `x-leap-event-schema` claim.

## The push probe and its scope

Everything in this document about *pushed* frames comes from two fixtures:
`fixtures/push-probe.json` (redacted; 27 frames), the original run described
in this section, and `fixtures/push-experiments.json`, six later
single-connection runs keyed by name. Each finding below says which run it
rests on. The findings are specific and the original run's scope is narrow,
so the scope comes first.

The six later runs:

| Run | Platform | Shape |
|---|---|---|
| `ra3-push-pad-0` | RA3 | Subscribe, drive a zone, restore. Subscribes on `lt-18`/`lt-19`. |
| `ra3-push-pad-7` | RA3 | The same experiment with seven filler reads first, so the subscribes land on `lt-25`/`lt-26`. |
| `caseta-push-pad-0` | Caseta | The same experiment on the other platform. The first Caseta push evidence in this project. |
| `ra3-keypad-press` | RA3 | Passive: no write of any kind issued, and zones moved anyway. (Named for the operator's account of the run — that a person was working a keypad — which the frames themselves do not record.) |
| `caseta-device-join` | Caseta | Passive, zero requests sent, 900 s. A device joined the RF link. |
| `caseta-connect-observe` | Caseta | Passive, zero requests sent, 30 s. What arrives on connect and nothing else. |

Platform, in that table, is established by the `host` placeholder and not by
anything a frame log states about itself. The RA3 runs carry
`"host": "<ipv4-2>"`, which is the RA3 processor's own
`/networkinterface/1` `IPv4Properties.IP` in `fixtures/spec-read.json`; the
Caseta runs carry `"host": "<ipv4-6>"`, the Caseta bridge's own in both
`fixtures/spec-read-caseta.json` and `fixtures/spec-read-caseta-bare.json`.
**No firmware version is attached to any of the six**, deliberately: a frame
log records no `ProtocolVersion`, and in the Caseta case the two corpora that
share its host report two different ones (`01.123` and `01.124`), so the host
that identifies the platform cannot date the firmware.

A single LEAP connection to **one RA3 processor** — the same target as
`fixtures/spec-read.json`, and so, through that corpus, the same project as
the sweep corpora. The evidence is the redactor's placeholder pool, which is
stable and injective within a run (`lib/redact.ts:142-143` keeps its
`counters` and `memo` at module scope): this capture's `host` is
`<ipv4-2>`, and only two other files in `fixtures/` contain `<ipv4-2>` at
all —

```
$ grep -rl 'ipv4-2' fixtures/
fixtures/push-probe.json
fixtures/spec-read.json
fixtures/push-experiments.json
```

— `fixtures/spec-read.json`, where it is that processor's own
`/networkinterface/1` `IPv4Properties.IP`, and
`fixtures/push-experiments.json`, whose three RA3 runs are that same
processor. The identification is by exhaustion, so the list has to stay
exhaustive; the second file joining it strengthens the chain rather than
breaking it. `fixtures/spec-read.json`'s `/server` reports
`ProtocolVersion: "03.249"`, which dates that corpus — **not** these frame
logs, which record no `ProtocolVersion` of their own.
It is **one installation**, **one run**, kept open for 26 seconds. The capture's own
`note` describes the shape: `"single connection: subscribe, level change,
hold, restore"`. Two subscriptions were opened, one dimmer zone
(`"zone": 4664`, `"originalLevel": 0`, `"targetLevel": 50`) was driven
0% → 50% → 0% by LEAP command, and every frame the socket delivered in
between was logged in order.

It is an answer to a question that had none — and it is one
processor, one installation, one run. **Vive is not tested at all**, here or
anywhere in this project's push evidence; nothing below should be read as a
statement about it. Caseta was in that sentence too until
`fixtures/push-experiments.json` landed — it now has three connections' worth
of push evidence of its own, and a section below.

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
     "The 14 CommuniqueTypes." This holds for the status-snapshot pushes
     (`ZoneStatus`, `AreaStatus`, `DeviceStatus`) this section is built on,
     but is **not** universal across resource types: a `/button/{id}/status/event`
     subscription pushes as `CommuniqueType: "UpdateResponse"` instead — see
     "Button events" below. What is invariant is the negative: a push is never
     a `SubscribeResponse` and never a bespoke push communique type.
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

**One control rules out a simpler explanation.** With two subscriptions
live on the same socket simultaneously, each push carried *its own*
subscription's tag rather than a single connection-wide constant — so the tag
is per-subscription, not merely per-connection.

What that control does *not* separate, on its own, is the tag from the
subscribe request's *position* in the sequence. The committed run does pad the
tag counter: `sentRequests` shows 17 `ReadRequest`s issued before the first
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
`lt-4`…`lt-17` read the associated zones of 14 of them. Several of them
touch resources the
subscriptions then cover — zone 4664 is one of the 46 entries in
`lt-18`'s snapshot, and `lt-17` reads the associated zones of the very area
`lt-19` subscribes to. That is irrelevant to the argument here, which turns
only on their being **prior**: what advances the tag counter is how many
requests were issued before the subscribe, not what they were about.

So the subscribe lands on `lt-18` because the harness's prelude is a
**fixed length** — 17 requests before the first subscribe — not because
`lt-18` is special. That run already pads the counter; what it cannot do is
vary the padding. Distinguishing "the tag is copied from the
subscribe request" from "the tag is a function of sequence position" needs a
run whose prelude is a *different* length, so the subscribe lands on a tag
other than `lt-18`.

### That run has now been done

`fixtures/push-experiments.json` carries the pair. `ra3-push-pad-0` repeats
the original prelude; `ra3-push-pad-7` inserts seven extra reads of
`/project` first (its `padTags` field lists the seven tags they consumed:
`lt-18` … `lt-24`), so the same two subscriptions, in the same order, on the
same two URLs, land seven tags later. **Every push moved with the
subscription, not with the position.**

| Run | `padTags` | `/zone/status` | `/area/1340/status` | Push tags, in order |
|---|---|---|---|---|
| `ra3-push-pad-0` | *(none)* | `lt-18` | `lt-19` | `lt-19`, `lt-18`, `lt-19`, `lt-18` |
| `ra3-push-pad-7` | `lt-18`…`lt-24` | `lt-25` | `lt-26` | `lt-26`, `lt-25`, `lt-26`, `lt-25` |

```
node -e '
const d = JSON.parse(require("fs").readFileSync("fixtures/push-experiments.json","utf8"));
for (const run of ["ra3-push-pad-0", "ra3-push-pad-7"]) {
  const r = d[run];
  console.log(run,
    "subs:", r.subscriptions.map(s => s.url + "=" + s.tag).join(" "),
    "| pushes:", r.frames.filter(f => f.deliveredToOnEvent)
                         .map(f => f.header.ClientTag).join(","));
}'

ra3-push-pad-0 subs: /zone/status=lt-18 /area/1340/status=lt-19 | pushes: lt-19,lt-18,lt-19,lt-18
ra3-push-pad-7 subs: /zone/status=lt-25 /area/1340/status=lt-26 | pushes: lt-26,lt-25,lt-26,lt-25
```

The decisive part is the negative half: in `ra3-push-pad-7`, `lt-18` and
`lt-19` were issued — they are the first two filler reads of `/project` — and
they pushed **nothing**. If the tag were a function of position, the pushes
would have stayed on `lt-18`/`lt-19` in both runs. They did not.

**The tag is a property of the subscription, carried over from the
`SubscribeRequest` that opened it.**

The same behaviour reproduces on the other platform, on a different tag
value again: `caseta-push-pad-0` subscribed `/zone/status` at `lt-5` and both
of its tagged pushes carry `lt-5`.

**Scope limit, unchanged by this pair.** Both RA3 runs are one connection
each, with the same two URLs. Nothing here speaks to a client that
reconnects and happens to subscribe at the same tag value, or to whether a
tag survives a processor-side subscription rebuild. A subscription's tag is
per-subscription within a connection; that is the whole claim.

### Why this does not change what a client must do

The routing rule in `$SRC/lib/leap-client.ts`'s `handleData` (excerpted in
`docs/protocol.md`) is unchanged and still correct: look the frame's
`ClientTag` up in the pending-request map; if nothing is pending under it,
route to `onEvent`. That works *because* the `SubscribeResponse` has already
resolved and removed the subscription's tag from the pending map long before
any push arrives on it. The push probe confirms that ordering directly —
the `SubscribeResponse` for `lt-18` landed at 610 ms into the run, the first
push on `lt-18` at 3,845 ms.

What the finding does change is that this is now an assumption clients
depend on rather than a free one. Two client-side consequences follow:

- A client must not reuse `ClientTag` values within a session. This
  project's client uses a monotonic counter (`lt-1`, `lt-2`, ...), so it
  cannot collide; a client that recycled tags could send a fresh request
  under a tag some live subscription is still pushing on, and would then
  resolve that request with a subscription push.
- A client must not "remember" a subscription's tag in its pending map in
  order to route pushes by it, unless it also stops treating that map as
  "requests awaiting a reply."

This is distinct from the `102 Processing` behaviour documented in
`docs/protocol.md`. A
`102` interim ack and its real `200 OK` roughly a second later are **two
frames answering one request**, on a tag that is still pending. A
subscription push arrives on a tag whose request already received its
terminal response, and only when the underlying state moves. Both reuse a
tag; they are not the same mechanism, and a client handles them in
different branches.

## Push bodies are deltas, not snapshots

The initial `SubscribeResponse` is a full snapshot. The pushes that follow
are not.

The `/zone/status` subscribe response carried all 46 zones. The push that
followed the level change carried exactly one entry, for the zone that
moved:

```json
{
  "ZoneStatuses": [
    {
      "href": "/zone/4664/status",
      "Level": 50,
      "Zone": {
        "href": "/zone/4664"
      },
      "StatusAccuracy": "Good"
    }
  ]
}
```

Compare that entry with the same zone's entry in the subscribe-time
snapshot:

```json
{
  "href": "/zone/4664/status",
  "Level": 0,
  "Zone": {
    "href": "/zone/4664"
  },
  "StatusAccuracy": "Good",
  "ZoneLockState": "Unlocked"
}
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

### The delta rule holds for changes nobody commanded

Everything above came from pushes that followed this project's own LEAP
write, which leaves open the reading that the processor was echoing a delta
it had just been handed. `ra3-keypad-press` closes that: it issued **no
write of any kind** (`"requestsIssued": []`, `"reads": []`; the only requests
on the connection are its three `SubscribeRequest`s), zones moved anyway, and
the 10 pushes that resulted are deltas in exactly the same way.

The `/zone/status` subscribe snapshot in that run carries 46 `ZoneStatuses`
entries, over the key union
`href, Level, Zone, StatusAccuracy, ZoneLockState, CCOLevel, FanSpeed,
SwitchedLevel`. Across all 10 pushes, **every entry has exactly four keys** —
`href`, `Level`, `Zone`, `StatusAccuracy` — and nothing else:

```
node -e '
const d = JSON.parse(require("fs").readFileSync("fixtures/push-experiments.json","utf8"));
const r = d["ra3-keypad-press"];
const pushes = r.frames.filter(f => f.deliveredToOnEvent);
const shapes = new Set();
for (const f of pushes) for (const z of f.body.ZoneStatuses)
  shapes.add(Object.keys(z).sort().join(","));
console.log("push entry key sets:", [...shapes]);
const snap = r.subscriptions[0].body.ZoneStatuses;
console.log("snapshot entries:", snap.length,
  "carrying ZoneLockState:", snap.filter(z => "ZoneLockState" in z).length);'

push entry key sets: [ 'Level,StatusAccuracy,Zone,href' ]
snapshot entries: 46 carrying ZoneLockState: 44
```

`ZoneLockState` is on 44 of the 46 snapshot entries, not all of them — the
two without it are a fan zone and a CCO zone, which report `FanSpeed` and
`CCOLevel` instead. That does not soften the finding, because **all five
zones that moved during the run do carry `ZoneLockState` in the
snapshot**, and no push carries it for any of them. Merge per field; do not
replace.

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

## Pushes with no command behind them

Not every push follows a client action. During the hold window between the
two level changes, with nothing being commanded, the `/area/1340/status`
subscription delivered an unprompted metering frame (`seq` 23, 9.6 s after
the level change):

```json
{
  "AreaStatus": {
    "href": "/area/1340/status",
    "InstantaneousPower": 6,
    "InstantaneousMaxPower": 10
  }
}
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

## Uncommanded changes push too

Until `ra3-keypad-press` every push in this project followed a write this
project had itself issued over LEAP, which left the most important question
about the mechanism open: is a subscription a channel for observing the
system, or only an echo of your own commands?

It is a channel for observing the system. The run held one connection open
for 603 s and sent **no request other than its three `SubscribeRequest`s**
(`"requestsIssued": []`, `"reads": []`). **Ten pushes arrived, all on
`/zone/status`, all carrying `lt-1`** — the tag that subscription's own
`SubscribeRequest` went out with, exactly as the section above predicts.
Zones moved that this client did not move, and the processor reported them.

**Where the evidence stops and testimony begins.** The heading above says
"uncommanded changes" rather than "a keypad press" on
purpose, and the rest of this section holds to that. What the fixture
establishes is that this client issued no write and that ten zone-status
pushes arrived anyway. What the fixture does **not** record is who or what
moved those zones, or by what gesture — a frame carries a zone href and a
level and no origin of any kind, and there is no field anywhere in it that
would name one.

The operator's account of the run is that a person was at an office keypad
pressing every button, with holds and double taps among them. That account
is not in the fixture and cannot be checked against it. It is why this
section is written the way it is: the headline survives without it, and the
two sub-findings that need it say so where they stand.

```
node -e '
const d = JSON.parse(require("fs").readFileSync("fixtures/push-experiments.json","utf8"));
const r = d["ra3-keypad-press"];
console.log("requests issued:", JSON.stringify(r.requestsIssued),
            "reads:", JSON.stringify(r.reads));
const p = r.frames.filter(f => f.deliveredToOnEvent);
console.log("pushes:", p.length,
  "urls:", [...new Set(p.map(f => f.header.Url))],
  "tags:", [...new Set(p.map(f => f.header.ClientTag))]);'

requests issued: [] reads: []
pushes: 10 urls: [ '/zone/status' ] tags: [ 'lt-1' ]
```

The run shows four further things, each with its own scope limit.

**A hold does not stream the ramp.** Intermediate settled levels do appear —
nine of the ten pushes carry zone 546, reporting it at 0, 75, 26, 48, 100, 0,
25, 0 and 100 in turn (the sixth push is the one that covers a different
zone) — but each level arrives as a single frame. The minimum gap between
consecutive pushes
across the whole run is **1601 ms** (the nine gaps are 3392, 5012, 2202,
1989, 2198, 1601, 2831, 3588 and 4237 ms). A fade reported live would push at
a far higher rate than that. The processor appears to push the endpoint of a
fade rather than its progression, which matters to anyone building live
dimming feedback on LEAP. **Stated as an inference, not an observation**, and
doubly so: the fixture does not record which presses were holds — that they
happened at all is the operator's account — so this rests on the *absence* of
high-rate frames rather than on a labelled hold. A run that marks its holds
would settle it.

**Nothing in the frame identifies the control.** This one is pure fixture,
with no testimony in it. The number of zones per push varies from 1 to 4
(`4,3,3,3,2,1,2,3,4,4`), and the groupings are stable — zones 518, 546 and
574 move together, 3663 appears only in the three four-zone pushes and always
alongside those, and 4005 appeared alone once — so whatever acted was acting
on different sets. But a
`ZoneStatus` entry names a zone and a level, and there is no control, button,
buttongroup or keypad reference anywhere in any of the ten bodies. **A push
cannot be attributed to the control that caused it from `/zone/status`
alone**, and by the same token these frames cannot confirm that a keypad
caused them.

**No distinct frame type for a double tap.** All 10 pushes are
`CommuniqueType: ReadResponse` with `MessageBodyType: MultipleZoneStatus`;
none carries a tap count, gesture, or any other press-shaped field. This
rests on the operator's account that double taps were among the presses — the
fixture cannot show that they were. Taking that account, it is evidence that
nothing of the kind appears *on this route*, and it is not evidence that LEAP
has no such notion elsewhere.

**`/project` accepted a subscription and pushed nothing.** The run's third
subscribe went to `/project` and was accepted — `200 OK`, tag `lt-3`,
`SubscribeResponse` with a full `Project` body — and then delivered not one
frame for the remaining 600 s, while `/zone/status` pushed ten times on the
same socket. A subscribable route that accepts and stays silent is worth
recording as a clean negative: acceptance of a `SubscribeRequest` says
nothing about whether that resource ever pushes.

## Caseta push behaviour

`caseta-push-pad-0` is the first Caseta push evidence in this project. The
bridge has one zone — `fixtures/spec-read-caseta.json`'s `/zone` returns a
one-element `Zones` array — and that zone, `/zone/2`, is
`ControlType: Dimmed`, so the run drove it 0% → 50% → 0% with no adaptation
and restored it (`"restore": {"ok": true, "verifiedLevel": 0}`).
`SubscribeRequest /zone/status` came back `200 OK` on `lt-5`, and both
tagged pushes carry `lt-5`. **The tag rule is the same on both platforms.**

Two behaviours have no RA3 counterpart anywhere in this project's corpus.

**1. The bridge auto-subscribes the client at connect.** Within 18 ms of the
connection opening, before the client has sent anything, two untagged
`SubscribeResponse` `204 NoContent` frames arrive, for
`/device/status/deviceheard` and `/zone/status/deprecated/level`. Neither URL
appears in the run's own `sentRequests` — the client asked for neither. All
three committed Caseta connections do it, and all four committed RA3
connections do not:

```
node -e '
const d = JSON.parse(require("fs").readFileSync("fixtures/push-experiments.json","utf8"));
d["push-probe"] = JSON.parse(require("fs").readFileSync("fixtures/push-probe.json","utf8"));
for (const [k, r] of Object.entries(d))
  console.log(k.padEnd(24), "host=" + r.host,
    "untagged frames:", r.frames.filter(f => f.header.ClientTag === undefined).length);'

ra3-push-pad-0           host=<ipv4-2> untagged frames: 0
ra3-push-pad-7           host=<ipv4-2> untagged frames: 0
caseta-push-pad-0        host=<ipv4-6> untagged frames: 4
ra3-keypad-press         host=<ipv4-2> untagged frames: 0
caseta-device-join       host=<ipv4-6> untagged frames: 3
caseta-connect-observe   host=<ipv4-6> untagged frames: 2
push-probe               host=<ipv4-2> untagged frames: 0
```

`caseta-connect-observe` is the cleanest form of it: 30 s, zero requests
sent, and the only two frames on the whole connection are that pair, at 8 ms
and 11 ms. See `docs/platforms.md` — this is a platform divergence, not a
firmware-wide behaviour.

**2. Every state change produces a second, untagged push.** In
`caseta-push-pad-0` each of the two level changes produced *two* pushes: an
untagged one on `/zone/2/status/level`, then 46 ms and 19 ms later the tagged
one on `/zone/status` carrying `lt-5`. **A client keyed purely on `ClientTag`
drops the untagged frames; a client keyed on `Header.Url` sees each change
twice.**

The untagged pushes arrive on `/zone/2/status/level`, which is neither of the
two URLs the bridge auto-subscribed the client to — the nearer of those is
the collection `/zone/status/deprecated/level`. That they are related is the
obvious reading; these frames do not establish it, and this document does not
claim it.

**One thing the Caseta run does not show** is a narrower push body than its
snapshot. Both carry the same four fields (`href`, `Level`, `Zone`,
`StatusAccuracy`). That does not contradict the delta rule: the bridge has
one zone, and its snapshot never carried a `ZoneLockState` for the push to
omit.

## The device-join push

`caseta-device-join` held one connection for 900 s and sent nothing at all.
Two frames arrived at connect (the auto-subscribe pair above); the third, at
98,499 ms, is a push on `/device/status/deviceheard`:

```json
{
  "DeviceStatus": {
    "DeviceHeard": {
      "DiscoveryMechanism": "UserInteraction",
      "ModelNumber": "PJ2-3BRL-GXX-X01",
      "DeviceType": "Pico3ButtonRaiseLower",
      "SerialNumber": 0,
      "DeviceClass": {
        "HexadecimalEncoding": "1070206"
      },
      "Link": {
        "href": "/link/1"
      },
      "ProductId": "17235974"
    }
  }
}
```

(`SerialNumber` reads `0` because `lib/redact.ts` zeroes it; the wire carried
a real one.)

`Header.MessageBodyType` is `OneDeviceStatus`, so the payload is a
`DeviceStatus` that happens to carry a `DeviceHeard` — which is why
`spec/paths/device.yaml`'s new `/device/status/deviceheard` points
`x-leap-event-schema` at `DeviceStatus`. It is **untagged**, like every other
frame on that connection, for the same reason: the client never subscribed,
the bridge did it for them. And it is a route no read sweep in this project
could ever have found, because the firmware route table carries only the
mangled `/devicestatus/deviceheard` and marks it `SUBSCRIBE` with no `GET`.

This is also where `DiscoveryMechanism` gets its first observed value,
`UserInteraction` — one observation, so `DeviceHeard.yaml` keeps the field an
open string.

## Button events: the push that names the control

Every push above reports a resource's *state* (a zone's level, an area's
status, a device heard). A button does not have a level to report; it has
*events* — press, release — and those ride a different subscription with a
different shape. Captured live on the Caseta bench Pico (`/device/2`, a
`Pico3ButtonRaiseLower`, buttons `/button/101`–`/button/105`),
`$SRC/data/session-2026-08-14/button-events-caseta.json`, 2026-08-14:

- **The route is subscribable but undocumented.** `SubscribeRequest
  /button/101/status/event` answers `SubscribeResponse 204 NoContent` — and,
  unlike a `/zone/status` subscribe, **no initial-state frame** (a button has
  no current event to snapshot). The firmware route extraction has no marker
  for this URL at all: `vendor/leap-routes.json`'s button routes stop at
  `/button/{id}`, with no `/status` or `/status/event` child, so like
  `/device/status/deviceheard` it is a route no read sweep could have found.

- **A programmatic press is a usable stand-in for a finger.** Rather than
  physically pressing the Pico, a `CreateRequest /button/101/commandprocessor`
  with body `{"Command": {"CommandType": "PressAndRelease"}}` was sent. It
  answered `CreateResponse 204 NoContent` — **bare, no body**, distinct from a
  *zone* command's `201 Created` / `OneZoneStatus` (see `docs/protocol.md`'s
  `CommandResponse` row) — and it produced real event pushes, so the command
  path exercises the same event surface a physical press would.

- **The push is an `UpdateResponse`, not a `ReadResponse`.** Two frames
  arrived on the subscription's own `ClientTag` (confirming the tag rule holds
  here too), ~15 ms apart, each `CommuniqueType: UpdateResponse`,
  `StatusCode: 200 OK`, `MessageBodyType: OneButtonStatusEvent`,
  `Url: /button/101/status/event`:

  ```json
  { "ButtonStatus": { "Button": { "href": "/button/101" },
                      "ButtonEvent": { "EventType": "Press" } } }
  { "ButtonStatus": { "Button": { "href": "/button/101" },
                      "ButtonEvent": { "EventType": "Release" } } }
  ```

  So one `PressAndRelease` yields a `Press` then a `Release`. This is the one
  push in the corpus whose body **names the control that acted**
  (`Button.href`) — and the reason the "which button" gap above is only
  half-closed: it names the button to a client subscribed to *that button's*
  event route, and says nothing about the `/zone/status` push a level-watcher
  sees. The body is a pure event delta — the event and nothing else, no button
  snapshot — consistent with the delta rule.

- **`EventType` gets two observed members.** `ButtonEvent.yaml` carries
  `EventType` as an un-recovered TODO enum (the firmware extraction emits no
  enum members); `Press` and `Release` are now observed on the wire. A Pico
  press-and-release is the minimal gesture, so holds and double-taps — which
  the RA3 keypad account (`ra3-keypad-press`) mentions but never subscribed to
  a button to capture — may add further members; the pair is a lower bound.

The push arriving as `UpdateResponse` is the load-bearing surprise: the
Lifecycle section above documents status pushes as `ReadResponse`, and that is
still true for them, but the communique type is **not** uniform across
subscribable resources. A client dispatching pushes must key on
`Header.ClientTag` (which resource/subscription) and `MessageBodyType` (what
shape), not on the communique type, which varies `ReadResponse` vs
`UpdateResponse` by what is being reported.

## LED status: keypad feedback as an aggregate delta

A keypad button's LED is a third kind of subscribable state, and it settles the
`ReadResponse`-vs-`UpdateResponse` question the button-event section opened.
Captured on the office `SunnataHybridKeypad` (`/device/483`), whose buttons
carry LEDs `/led/490` and `/led/491` (each an `AdvancedToggleProgrammingModel`
button over the office zones) and `/led/492` (a button that tracks a scene), by
driving the office zones with LEAP commands and watching the LEDs follow
(`$SRC/data/session-2026-08-14/led-delta2-qsx.json`, 2026-08-14; office-scoped,
self-restored):

- **The subscribe carries an initial snapshot**, unlike a button-event
  subscribe. `SubscribeRequest /led/490/status` answers `SubscribeResponse
  200 OK`, `MessageBodyType: OneLEDStatus`, body `{"LEDStatus": {"href": …,
  "LED": {"href": "/led/490"}, "State": "On"}}` — the LED has a current state
  to report, where a button has no current event, so this matches the
  zone/area status subscribe (200 + snapshot), not the button-event one
  (204, none).

- **The delta pushes as `ReadResponse`.** When every office zone was driven to
  0, `/led/490` and `/led/491` each pushed on their own tag —
  `CommuniqueType: ReadResponse`, `MessageBodyType: OneLEDStatus`, body
  `{"LEDStatus": {…, "State": "Off"}}` — and pushed again as `"On"` when the
  zones were restored. So LED status uses the *same* `ReadResponse` push type
  the status snapshots use; only button *events* (previous section) diverge to
  `UpdateResponse`. The split is event-vs-state, not resource-by-resource:
  state reports (zone, area, LED) push `ReadResponse`; discrete events (button
  press/release) push `UpdateResponse`. `State` is a binary enum; `On` and
  `Off` are the observed members.

- **The LED tracks a programming-model aggregate, not one zone.** Driving a
  single office zone off (the run before this one) produced **no** LED push at
  all — `/led/490` only flipped once *all three* office zones were off, because
  its button is an `AdvancedToggleProgrammingModel` whose LED reflects whether
  the group is active, not any single member. `/led/492`, whose button tracks a
  scene rather than the zones, never moved across either run. And a burst of three zone commands produced **one** push
  per LED, carrying the final aggregate state — not one push per underlying
  zone change. A client cannot read a keypad LED as a proxy for a specific
  zone's level; it is the programming model's own boolean.

Together with button events, this is the second and third push shape beyond
`/zone/status`: the corpus now has zone level, area status, device-heard,
button press/release, and keypad LED state, and the delta rule (a push carries
only what changed, never a full snapshot) holds across all of them.

## What this still does not establish

- **Which non-LEAP origins.** A change originating outside this client is now
  confirmed to push (`ra3-keypad-press`), so the general form of this gap is
  closed. Which origin is not: the fixture records no cause for those ten
  changes, only their effect, so even the keypad attribution rests on the
  operator's account. An occupancy sensor, a timeclock event, and the Lutron
  app writing on another connection have each still never been observed
  producing a push, and no capture in this project can distinguish them from
  a keypad after the fact.
- **Vive.** Untested for push behaviour entirely. Caseta no longer belongs in
  this entry: three Caseta connections are committed in
  `fixtures/push-experiments.json`, two of them carrying pushes.
- **Which button, on any platform.** `/zone/status` push bodies name zones and
  nothing else. A different route *does* report the control that acted, now
  that one has been subscribed: `/button/{id}/status/event` pushes a body whose
  `Button.href` names the button — see "Button events" below. That does not
  change what a `/zone/status` push carries, though: a client watching zones
  still cannot attribute a level change to a button from the zone push alone;
  it would have to subscribe to the button's own event route as well.
- **Whether a hold really does not stream.** The 1601 ms floor on inter-push
  gaps is strong evidence against live ramp reporting, but it is the absence
  of frames, and the run does not label which presses were holds. A run that
  marks its holds would turn this from inference into observation.
- **Whether the delta rule is universal.** Observed on `ZoneStatuses` (both
  in runs this client drove and in the one it did not), `AreaStatus`,
  `ButtonStatus` events, and `LEDStatus` — four resource kinds now, each
  pushing only what changed. Whether *every* subscribable resource does, or
  some push full snapshots, is still not proven exhaustively, but the rule has
  held everywhere it has been tested.
- **`UnsubscribeResponse`.** Still never captured; no subscription in this
  corpus was ever explicitly torn down rather than dropped with the socket.
- **Push behaviour under load.** One zone changing on a quiet system, or five
  zones changing ten times over 27 s. Whether a burst of simultaneous changes
  coalesces into one push, or produces one push each, is untested.
- **Whether the tag is stable for the life of the subscription.** The longest
  interval between a subscribe and a push on its tag anywhere in this corpus
  is 63 s (`ra3-keypad-press`: its `SubscribeResponse` landed at 3,094 ms and
  the last push on that tag at 66,337 ms). A subscription held for hours was
  not tested, and the tag pair above does not speak to reconnects.

## Subscriptions do not survive the connection

This was an open question in this document until a live probe closed it, and
the answer is the one a client should assume: **a dropped connection drops the
subscription.**

The measurement, against RA3/HWQS firmware v03.x. A cuttable TCP proxy was
placed between a client and the processor — TLS terminates at the processor, so
the proxy is a byte pipe that sees no plaintext — a subscription to
`/zone/status` was opened through it, and a dimmer was driven to generate
pushes. Cutting the proxy is a real socket drop from the client's point of
view. The same experiment was then run twice:

| After reconnecting | Pushes for the same zone change |
|---|---|
| client re-issues its `SubscribeRequest` | arrive normally |
| client does not re-subscribe | **none** |

Two consequences for a client. Requests in flight when the socket dies must be
failed rather than left pending — the processor never answers them on the new
connection. And every subscription has to be re-issued after a reconnect;
holding the tag is not enough, because the tag belonged to a session that no
longer exists.

What this does not establish: whether a *processor-side* restart behaves the
same as a severed socket, and whether anything is buffered and replayed for a
client that reconnects quickly (nothing was, at the ~1 s reconnect delay used
here).
- **Whether a client may subscribe to the auto-subscribed routes itself.**
  Caseta pushes on `/device/status/deviceheard` unasked. No `SubscribeRequest`
  for it was ever sent, on either platform, so whether a client can open that
  subscription deliberately is unknown.

## The subscribable routes

This specification's bundled document is generated from the firmware
route extraction, which recorded **40** raw `SUBSCRIBE`-verb markers before
hand-refinement. That number should not be quoted as the size of the final,
correct subscribable surface. The accounting from 40 to 20 is:

- **18 excluded as mangled/concatenated path forms** — the class described
  in `docs/mapping.md`: `/areastatus`, `/devicestatus`,
  `/devicestatus/deviceheard`, `/deviceavailabilitystatus`,
  `/devicebatterystatusstatus`, `/emergencystatus`, `/loadcontrollerstatus`,
  `/natlightoptstatus`, `/occupancysensorstatus`, `/operationstatus`,
  `/rentablespacestatus`, `/systemloadsheddingstatus`, `/systemstatus`,
  `/temperaturesensorstatus`, `/timeclockeventstatus`, `/timeclockstatus`,
  `/v2operationstatus`, `/zonetypegroupstatus`. Each was excluded in favour
  of its correctly-slashed equivalent where one exists. Note that
  "correctly-slashed equivalent" no longer means "probe-confirmed" for all
  of them: `/device/status/deviceheard` was added from a **pushed frame**,
  not from a probe, because it has no `GET` for a probe to reach.
- **7 further firmware `SUBSCRIBE` routes not carried into the bundle**, and
  these are ordinary, correctly-slashed routes rather than mangled ones:
  `/emergency/{id}/status`, `/loadcontroller/{id}/status`,
  `/natlightopt/{id}/status`, `/profilesession/{id}/status`,
  `/zonetypegroup`, `/zonetypegroup/{id}`, `/zonetypegroup/{id}/status`.
  Their absence is an open gap in this specification, not a
  refinement — see the `/loadcontroller/{id}/status` note at the end of this
  section, which is one of these 7.
- **5 hand-authored corrected paths added**: `/device/status`,
  `/device/status/deviceheard`, `/system/loadshedding/status`,
  `/system/naturallightoptimization/status`, `/zone/status`.

40 − 25 + 5 = 20. Reproduce with:

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

**20 routes carry `x-leap-subscribable`** in the finished specification. That
is a count of what the document marks, and it is not the same thing as the
count of routes a live processor will actually accept a `SubscribeRequest`
on. The `Probe` column below is the second number, taken from
`fixtures/subscriptions.json` (41 subscribe attempts on one RA3 processor),
`fixtures/push-probe.json` and `fixtures/push-experiments.json`. **Of the 20
marked routes, 6 are probe-confirmed, 7 are contradicted by the same
processor, and 7 are neither** — 5 never probed at the specification's own
path, 1 inconclusive, and 1 (`/device/status/deviceheard`) never requested by
this project at all, yet confirmed to push, because a Caseta bridge
subscribed the client to it unasked. The marker records the firmware route
table's `SUBSCRIBE` verb, and per `docs/platforms.md`, presence in that table
does not imply a live implementation.

| Path | Probe | Notes |
|---|---|---|
| `/area` | **`405`** | `SubscribeRequest /area` → `405 MethodNotAllowed`. The firmware route table records `CREATE`+`SUBSCRIBE` for `/area` and no `GET` at all; `GET /area` here is hand-authored and probe-derived (see `spec/paths/area.yaml`). The subscribe half is not honored by this processor. |
| `/area/{areaId}` | `200 OK` | Confirmed twice (`/area/32`, `/area/912`). |
| `/area/{areaId}/occupancysensorsettings` | `404` | Inconclusive, not a refusal: both probed areas (`32`, `912`) have no such resource, so the verb was never reached. |
| `/area/{areaId}/status` | `200 OK` | Confirmed twice, and the source of 3 of the 5 pushes in `fixtures/push-probe.json`. |
| `/device` | **`405`** | `405 MethodNotAllowed`, and the one row in this table whose refusal *body* is captured: `ra3-keypad-press` (tag `lt-2`) records `CommuniqueType: ExceptionResponse`, `MessageBodyType: ExceptionDetail`, body `{"Message": "This request is not supported"}`. That is the first `ExceptionResponse` ever observed in this project — see `docs/protocol.md`. RA3 only; Caseta has never been asked. |
| `/device/status` | untested | Only the firmware's mangled form `/devicestatus` was probed (`400 BadRequest`). The corrected collection path — hand-authored, see the mangled-path defect in `docs/mapping.md` — was never subscribed to. |
| `/device/status/deviceheard` | never requested | **Confirmed pushing without ever being asked.** The Caseta bridge auto-subscribed the client to this URL 11 ms after TLS (untagged `SubscribeResponse 204`) and, 98 s later, pushed an untagged `ReadResponse` on it — `MessageBodyType: OneDeviceStatus`, body `{"DeviceStatus": {"DeviceHeard": {…}}}` — reporting a `Pico3ButtonRaiseLower` with `DiscoveryMechanism: UserInteraction` (`caseta-device-join` in `fixtures/push-experiments.json`). Subscribe-only: the route has no `GET` in the firmware table and none here, which is why no read sweep ever reached it. No `SubscribeRequest` for it was sent by this project on either platform, so nothing is established about whether a client may subscribe to it itself, and no RA3 frame on it exists at all. |
| `/device/{deviceId}` | `200 OK` | Confirmed on `/device/435`. (`/device/532` returned `404`: that instance does not exist.) |
| `/link/{linkId}/memberdiscoverysession/{memberdiscoverysessionId}/status` | untested | Never probed; requires a live discovery session. |
| `/link/{linkId}/status` | `200 OK` | Confirmed twice (`/link/439`, `/link/437`). |
| `/project` | `200 OK` | Accepted twice, and **a clean negative on pushing**: in `ra3-keypad-press` it was accepted on `lt-3` with a full `Project` snapshot and then delivered nothing at all for the remaining 600 s, while `/zone/status` pushed ten times on the same connection. Accepting a `SubscribeRequest` and ever pushing are different properties. |
| `/service/bacnetnetworksettings/{bacnetnetworksettingsId}` | untested | Never probed. |
| `/service/bacnetsettings` | **`400`** | `400 BadRequest` — this processor refuses the subscribe. BACnet is a commercial-system feature; whether the refusal is "not supported" or "not configured here" is not established. |
| `/system/loadshedding/status` | untested | Hand-authored path; only the mangled `/systemloadsheddingstatus` was probed (`400`). |
| `/system/naturallightoptimization/status` | untested | Only the firmware's abbreviated form `/natlightoptstatus` was probed (`400`). |
| `/virtualbutton` | **`405`** | `405 MethodNotAllowed`. |
| `/zone` | **`405`** | `405 MethodNotAllowed` — consistent with RA3 having no flat zone-list endpoint at all (see `docs/platforms.md`). |
| `/zone/status` | `200 OK` | **The subscribable zone-status route.** Hand-authored path: the extraction has no `/zone/status` and no bare `/zonestatus`, only four paging variants (`/zonestatusexpandedquerystringwith{explicit,implicit}paging`, `/zonestatus/with/{explicit,implicit}/paging`), all `GET`-only and none `SUBSCRIBE`-marked; confirmed by `fixtures/push-probe.json`, which both subscribed to it and received pushes on it. Now confirmed on **both platforms** and for a change this client did not command: `caseta-push-pad-0` subscribed on `lt-5` and got pushes on `lt-5`, and `ra3-keypad-press` got 10 pushes on `lt-1` with no write issued by this client at all. |
| `/zone/{zoneId}` | **`405`** | `405 MethodNotAllowed` (`/zone/546`, `/zone/574`). |
| `/zone/{zoneId}/status` | **`405`** | `405 MethodNotAllowed` (`/zone/546/status`, `/zone/574/status`). `fixtures/subscriptions.json` records status only — its entries are `{url, requestTag, subscribeStatus, frames}`, with no body field — so the refusal body is not captured for this or any other row in this table. A firmware-recovered route (`vendor/leap-routes.json`: `/zone/{id}/status`, verbs `GET`/`SUBSCRIBE`/`UPDATE`) whose `SUBSCRIBE` verb this processor does not honor. **Per-zone status is not subscribable; the collection `/zone/status` is.** |

That last row is why the `ClientTag`
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
