# Subscriptions

LEAP's subscription mechanism is the one place this specification's HTTP-shaped
mapping is a genuine convention rather than a description of the wire
protocol — OpenAPI has no native concept of a server pushing further messages
after the initial response. This document is the full lifecycle account,
including an open question the available source material does not settle.

See `docs/protocol.md` for the underlying `ClientTag` correlation mechanism
this all depends on, and `docs/mapping.md` for how `x-leap-subscribable` and
`x-leap-event-schema` fit into the OpenAPI mapping generally.

## Lifecycle

1. **`SubscribeRequest`** — the client sends a tagged request to a
   subscribable URL, structurally identical to a `ReadRequest` (`Header.Url`,
   a `ClientTag`, no `Body`).
2. **`SubscribeResponse`** — the server replies, using the *same* `ClientTag`
   as the request (this part is not in question — it is ordinary
   request/response correlation, per `docs/protocol.md`). The response body
   carries the resource's **initial state**, in the same shape a `ReadResponse`
   for that resource would carry. A client that only wants "notify me of
   future changes" still receives — and in this project's client
   implementation, must consume — a full current snapshot as part of
   subscribing.
3. **Unsolicited frames** — some time later, with no further request from the
   client, the processor sends additional frames when the subscribed
   resource's state changes. Each carries the same body shape as the initial
   `SubscribeResponse`. These are the frames this specification's
   `x-leap-event-schema` extension points at.
4. **`UnsubscribeRequest`** — the client sends a tagged request to end the
   subscription. (No `UnsubscribeResponse` behavior is captured in this
   project's corpus beyond its listing among the 14 CommuniqueTypes in
   `docs/protocol.md`.)

## The open `ClientTag` question

**Question:** do the unsolicited push frames in step 3 reuse the `ClientTag`
from the original `SubscribeRequest`, carry a different tag, or omit
`ClientTag` entirely?

This question was flagged as open at the design stage of this project and
investigated directly for this document, rather than assumed. Two source
categories were checked:

**`$SRC/lib/leap-client.ts`, a working client implementation.** Its frame
router (`handleData`, see `docs/protocol.md` for the full excerpt) does settle
how a *client* should behave: it looks up `resp.Header?.ClientTag` against a
map of pending requests, and if the tag is absent or does not match anything
pending, the frame is routed to `onEvent` as an unsolicited push. This is
necessary and sufficient client-side logic *regardless* of what the server
actually does with the tag — a client that keeps no record of a tag after its
matching response has resolved will treat a reused tag on a later, unrelated
frame identically to an absent one. The client's own test suite
(`$SRC/test/leap-client.test.ts`) confirms this: its "routes unsolicited
messages to onEvent" test feeds a frame with a `ClientTag` value (`"lt-7"`)
that simply is not in the pending map, and asserts it goes to `onEvent` — it
does not distinguish "no tag" from "a tag nothing is waiting for." **The
client implementation does not need to know the answer, and its code does not
reveal it.**

**The LEAP protocol documentation.** A search across every `.md` file in
`$SRC/docs/protocols/leap/` (`index.md`, `api-discovery.md`,
`server-internals.md`) for every occurrence of `ClientTag` turns up: the
envelope definition itself (`Header` has a `ClientTag` field); several
Objective-C-style request-creator method signatures from an older iOS RE
pass, all of which are for *requests* the app constructs (e.g.
`createAndExecuteDeviceCreateRequestForStartIdentifyDeviceWithSerialNumber:andClientTag:andFormat:`)
rather than for received subscription push frames; and one JSON snippet
showing `ClientTag` on an *outbound* command envelope's `Header`. **No
example anywhere in this project's source material shows the `Header` of an
actual captured, unsolicited subscription push frame** — none of the
subscription-related JSON examples in `index.md` or `api-discovery.md`
(including the "Subscriptions the App Uses" table, which lists 11 subscribed
resource types by URL) include a full envelope with a `Header` block for a
pushed frame, only response body shapes.

**Conclusion (as of the design stage): the available sources do not
establish whether pushed subscription frames reuse the originating
`ClientTag`.** This was stated here explicitly, per this project's own
accuracy requirements, rather than being silently omitted or guessed at. A
client should not rely on push frames carrying any particular `ClientTag`
value — including the original subscription's tag — for correlation; the
only thing this project's client implementation relies on (and the only
thing needed for correct behavior) is that push frames do *not* match a
currently-pending request's tag, which the implementation cannot fail to
satisfy, since a subscription's `SubscribeRequest` tag is normally already
resolved and removed from the pending set by the time any push frame
arrives.

### Update from Task 8's probe campaign — adjacent evidence, not a resolution

A later probe campaign (Task 8, against a single, previously-unseen
processor masked throughout this project's public fixtures) captured the
first pushed-frame headers this project has ever observed on the wire:
`fixtures/late-frames.json`, 5 frames, every one carrying the exact
`ClientTag` (`lt-1`) of the request it answered.

**This is evidence for asynchronous *responses*, not for subscription
*pushes* — and the distinction is exact, not a hedge.** All 5 of those
frames were the terminal half of a `102 Processing` / `200 OK` two-frame
answer to an ordinary `ReadRequest GET /firmwareimage/{firmwareimageId}`
(see `docs/protocol.md`'s "`102 Processing`" section for the full
mechanism) — not a server-initiated push following a `SubscribeRequest`.
The same campaign separately probed all 19 subscribable routes this
specification's bundled document lists (`fixtures/subscriptions.json`, 41
subscribe attempts total across both id- and status-shaped variants of
several routes): 10 were accepted with `200 OK`, confirming the
subscription mechanism itself works, but **zero frames arrived in any of
the 41 twenty-second hold windows that followed, including on the 10
accepted subscriptions.** That reflects a quiet system during the probe run
— no light changed, no sensor tripped, no device state moved — not a
broken or unsupported feature.

So: the question this section opened with — does a *pushed subscription*
frame reuse the originating tag — **remains genuinely unresolved.** No
pushed frame was captured in this campaign at all, on any subscription, to
answer it either way. What Task 8 actually establishes is narrower and
adjacent: LEAP's asynchronous-response mechanism, for the one route where it
was observed, reuses the request's tag. Whether that generalizes to pushed
frames is still untested. This document continues to say so explicitly
rather than inferring an answer from a mechanism that, on inspection, turned
out to be a different one.

## The subscribable routes

This specification's bundled OpenAPI document is generated from the firmware
route extraction, which recorded **40** raw `SUBSCRIBE`-verb markers before
hand-refinement. That number should not be quoted as the size of the final,
correct subscribable surface: it double-counts routes that are reachable by
either a numeric integration id or an XID string (merged into one path per
this specification's own OpenAPI-validity rule — see `docs/mapping.md`), and
it includes several of the mangled/concatenated path forms described in
`docs/mapping.md` (`/devicestatus`, `/systemloadsheddingstatus`, and similar)
that were excluded from the bundle in favor of their probe-confirmed,
correctly-slashed equivalents.

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

**19 subscribable routes** in the finished specification:

| Path | Subscribed via | Notes |
|---|---|---|
| `/area` | `GET` | Area creation notifications. `GET /area` is a hand-authored, probe-derived operation (see `docs/mapping.md`) — the firmware route table records no `GET` verb for `/area` at all, only `CREATE`+`SUBSCRIBE`. |
| `/area/{areaId}` | `GET` | |
| `/area/{areaId}/occupancysensorsettings` | `GET` | |
| `/area/{areaId}/status` | `GET` | |
| `/device` | `GET` | |
| `/device/{deviceId}` | `GET` | |
| `/device/status` | `GET` | Hand-authored path — see the mangled-path defect in `docs/mapping.md`. |
| `/link/{linkId}/memberdiscoverysession/{memberdiscoverysessionId}/status` | `GET` | |
| `/link/{linkId}/status` | `GET` | |
| `/project` | `GET` | |
| `/service/bacnetnetworksettings/{bacnetnetworksettingsId}` | `GET` | |
| `/service/bacnetsettings` | `GET` | |
| `/system/loadshedding/status` | `GET` | Hand-authored path. |
| `/system/naturallightoptimization/status` | `GET` | |
| `/virtualbutton` | `GET` | |
| `/zone` | `GET` | |
| `/zone/{zoneId}` | `GET` | |
| `/zone/{zoneId}/status` | `GET` | A firmware-recovered route (`vendor/leap-routes.json`: `/zone/{id}/status`, verbs `GET`/`SUBSCRIBE`/`UPDATE`), not hand-authored. |
| `/zone/status` | `GET` | Hand-authored path — the bare collection-status route is absent from the firmware extraction in any form (mangled or otherwise); see the mangled-path defect in `docs/mapping.md`. |

App reverse engineering (`$SRC/docs/protocols/leap/api-discovery.md`,
"Subscriptions the App Uses") separately lists 11 resource types the Lutron
app itself subscribes to for live UI updates: `/zone/status`,
`/device/status`, `/device/status/deviceheard`, `/link/status`,
`/occupancygroup/status`, `/system`, `/database`, `/timeclock/status`,
`/tuningsettings`, `/loadcontroller/status`, and
`/naturallightoptimization/status`. That list is app behavior, not a
statement of the full subscribable surface — several of those paths are
either not present in the finished specification at their listed form, or
present via a different, corrected path (e.g. the wire path is
`/zone/status`, matching this specification's hand-authored entry above).
It is included here for cross-reference, not as a second source of truth for
the table above.
