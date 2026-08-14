# The LEAP wire protocol

LEAP (Lutron Extensible Application Protocol) is not HTTP. This document
describes the actual transport and framing, independent of how this
specification maps it onto OpenAPI (see `docs/mapping.md` for that mapping).

Sources are cited inline. `$SRC` refers to `~/lutron-protocols`, a separate,
read-only repository holding the firmware extraction and probe captures this
specification is built from — principally `$SRC/docs/protocols/leap/index.md`,
`$SRC/docs/protocols/leap/api-discovery.md`,
`$SRC/docs/protocols/leap/server-internals.md`,
`$SRC/docs/reference/leap-api-spec.yaml` (a firmware-derived route index, `14
communique types` per its own `info.description`), and `$SRC/lib/leap-client.ts`
(a working client implementation).

## The envelope

Every message, in both directions, is a single JSON object with three
top-level keys:

```json
{
  "CommuniqueType": "ReadRequest",
  "Header": {
    "Url": "/zone/1/status",
    "ClientTag": "1",
    "StatusCode": "200 OK",
    "MessageBodyType": "ZoneStatus"
  },
  "Body": { }
}
```

- **`CommuniqueType`** — what kind of message this is. See "The 14
  CommuniqueTypes" below.
- **`Header.Url`** — the LEAP path the message concerns, e.g. `/zone/1/status`.
  On a response this echoes the request's URL.
- **`Header.ClientTag`** — a client-chosen opaque string used to correlate a
  response with the request that produced it. See "Framing and correlation"
  below.
- **`Header.StatusCode`** — present on responses. A literal HTTP-style string,
  e.g. `"200 OK"` or `"400 BadRequest"`. See "Status codes" below.
- **`Header.MessageBodyType`** — the name of the schema that `Body`'s
  **payload is wrapped under**, e.g. `"ZoneStatus"`. This is what
  `x-leap-body-type` in the OpenAPI document records for each operation
  (`docs/mapping.md`).
- **`Body`** — present on requests that carry a payload (`CreateRequest`,
  `UpdateRequest`) and on most responses. Absent on `204 NoContent` and on
  bodyless requests like `ReadRequest`.

### `Body` wraps the payload

`Body` does **not** contain the payload directly. It contains a single key,
named by `Header.MessageBodyType`, whose value is the actual payload:

```json
"Body": { "ZoneStatus": { "href": "/zone/518/status", "Level": 100 } }
```

Every schema in this specification (`spec/components/schemas/`) describes
the **unwrapped payload** — the value of that one key (`{ "href":
"/zone/518/status", "Level": 100 }` above), not the `{"ZoneStatus": {...}}`
envelope around it. A client that parses `Body` itself as the payload object
will fail on every response, because every response looks like
`{"<MessageBodyType>": <payload>}`.

This is confirmed against every response captured in this project's probe
corpus: of 439 captured `200 OK` bodies, 438 have exactly this
single-key-wrapper shape. The one exception is RA3's `GET /button`, which
returns a bare `{}` (no buttons to report at probe time — an empty object
has no key to wrap, wrapped or not). `test/conformance.test.ts` unwraps the
one key before validating any body against its schema, for exactly this
reason. See `docs/mapping.md`'s "The `Body` wrapper" section for the
OpenAPI-mapping consequences of this rule.

## Framing

LEAP frames are newline-delimited JSON (NDJSON) over a single, persistent
socket. There is no length prefix and no multiplexed-stream framing beyond
"one JSON object per line" — `$SRC/lib/leap-client.ts`'s `handleData` buffers
incoming bytes, splits on `\n`, and parses each complete line independently:

```ts
private handleData(data: string): void {
  this.buffer += data;
  const lines = this.buffer.split("\n");
  this.buffer = lines.pop()!; // last element may be a partial line

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const resp = JSON.parse(line);
      // ...
    } catch {}
  }
}
```

A client opens one TLS socket to port 8081 and reuses it for every request for
the life of the session — there is no per-request connection, and no HTTP-style
request/response pairing at the transport layer. All correlation is done at
the application layer via `ClientTag`.

### `ClientTag` correlation

A client generates a tag per outbound request (`$SRC/lib/leap-client.ts` uses
a simple incrementing counter, `lt-1`, `lt-2`, ...) and stores it against a
pending-request record. When a frame arrives:

- If its `Header.ClientTag` matches a pending request, that request's promise
  resolves with the frame — this is a normal reply.
- If its `ClientTag` does not match any pending request (including frames with
  no `ClientTag` at all), it is routed to the event handler as an **unsolicited
  push** — most commonly a subscription notification.

```ts
const tag = resp.Header?.ClientTag;

// Match by ClientTag if present
if (tag && this.pendingRequests.has(tag)) {
  const pending = this.pendingRequests.get(tag)!;
  this.pendingRequests.delete(tag);
  pending.resolve(resp);
  continue;
}

// Unsolicited message — pass to event handler
if (this.onEvent) {
  this.onEvent(resp);
}
```

This is the load-bearing mechanism for subscriptions: a client sends one
`SubscribeRequest` (tagged) and gets back one `SubscribeResponse` (same tag,
carrying the initial state), after which the processor pushes further frames
for that resource on its own schedule, with no further request from the
client.

Those later pushes **carry the originating `SubscribeRequest`'s `ClientTag`**,
observed directly in `fixtures/push-probe.json` on one RA3 processor: two
concurrent subscriptions, tags `lt-18` and `lt-19`, each pushed on its own
tag. The routing rule above is unaffected — the subscription's tag is no
longer pending by the time a push arrives, because the `SubscribeResponse`
already resolved and removed it — but the reuse means a client must not
recycle `ClientTag` values within a session, or a fresh request could be
resolved by an unrelated subscription's push. **How the processor derives
the value is now settled too**, which it was not when only
`fixtures/push-probe.json` existed: `fixtures/push-experiments.json` runs the
same experiment twice with preludes of different lengths, moving the
subscribes from `lt-18`/`lt-19` to `lt-25`/`lt-26`, and every push moves with
them while `lt-18`/`lt-19` — issued as ordinary reads in the second run —
push nothing. The tag is copied from the `SubscribeRequest`, not derived from
sequence position. See `docs/subscriptions.md` for that pair in full, the
scope limit that still applies (one connection; nothing about reconnects),
the delta-versus-snapshot shape of push bodies, and what the Caseta runs add.

## The 14 CommuniqueTypes

`$SRC/docs/reference/leap-api-spec.yaml`, a firmware-derived route index,
states in its own `info.description`: "384 endpoint handlers, 773 object
types, 14 communique types," and lists all 14 by name. `$SRC/docs/protocols/leap/index.md`'s
"Protocol Basics" section lists only 12 of them (omitting `ExceptionResponse`
and `CommandResponse`); the firmware-derived list is used here as the complete
set:

| CommuniqueType | Direction | Purpose |
|---|---|---|
| `ReadRequest` | client → server | Fetch a resource. Maps to `GET`. |
| `ReadResponse` | server → client | Reply to a `ReadRequest`. |
| `CreateRequest` | client → server | Create a resource or send a command (every `*/commandprocessor` endpoint is a `CreateRequest`). Maps to `POST`. |
| `CreateResponse` | server → client | Reply to a `CreateRequest`. **Now observed on a real resource create**, not only on command-processor writes — see "Resource create and delete" below. |
| `UpdateRequest` | client → server | Modify an existing resource. Maps to `PUT`. |
| `UpdateResponse` | server → client | Reply to an `UpdateRequest`. **Now observed** — `200 OK`, `MessageBodyType: OneAreaDefinition`, the updated entity echoed back; see "Resource create and delete". |
| `DeleteRequest` | client → server | Remove a resource. Maps to `DELETE`. |
| `DeleteResponse` | server → client | Reply to a `DeleteRequest`. **Now observed** — see "Resource create and delete" below. |
| `SubscribeRequest` | client → server | Start a subscription on a resource. |
| `SubscribeResponse` | server → client | Reply to a `SubscribeRequest`, carrying the initial state. |
| `UnsubscribeRequest` | client → server | End a subscription. |
| `UnsubscribeResponse` | server → client | Reply to an `UnsubscribeRequest`. **Now observed** — `204 NoContent`, no body, correlated on its own `ClientTag`; see "Resource create and delete". |
| `ExceptionResponse` | server → client | An error reply distinct from a normal response with an error `StatusCode`. **Now observed**, once — see below. |
| `CommandResponse` | server → client | Named in the firmware's own communique-type count, and still never seen on the wire in this project's corpus. Every captured command-processor exchange answered as `CreateResponse` instead — 8 in all now, `fixtures/push-probe.json` `seq` 20 and 24 plus 6 more in `fixtures/push-experiments.json`, and all 8 identical in form: `CommuniqueType: CreateResponse`, `StatusCode: 201 Created`, `MessageBodyType: OneZoneStatus`, a `ZoneStatus` body. Two devices and two platforms now (`/zone/4664/commandprocessor` on the RA3 processor, `/zone/2/commandprocessor` on the Caseta bridge), which is broader than the original two frames — but it is still one route family, and says nothing about whether `CommandResponse` is used elsewhere or is a distinct reply type this corpus never provoked. See `docs/mapping.md`'s Commands section for why the rest of the write surface is app RE rather than captured traffic. |

### `ExceptionResponse`, observed

This document said, until `fixtures/push-experiments.json` landed, that
`ExceptionResponse` was named in the firmware and never seen. It has now been
seen — once, in the `ra3-keypad-press` run, answering a `SubscribeRequest` to
`/device`:

```json
{
  "communiqueType": "ExceptionResponse",
  "header": {
    "MessageBodyType": "ExceptionDetail",
    "StatusCode": "405 MethodNotAllowed",
    "Url": "/device",
    "ClientTag": "lt-2"
  },
  "body": { "Message": "This request is not supported" }
}
```

It settles four things.

- It **is** correlated like any other reply: `ClientTag` `lt-2` matches the
  `SubscribeRequest` that provoked it, and the frame log records
  `"deliveredToOnEvent": false`, so a client's ordinary pending-request map
  resolves it. A client that only switches on `CommuniqueType` and has no
  `ExceptionResponse` branch will not lose the frame; it will fail to
  recognise it.
- Its `MessageBodyType` is `ExceptionDetail`, a body type this project had
  never seen either.
- Its body is `{"Message": "<string>"}` — the same shape the ordinary error
  bodies in the probe corpora carry, e.g. `{"Message": "This resource does
  not exist : /area/32"}` in `fixtures/spec-read-caseta.json`.
- It carries an error `StatusCode` as well, so the distinction the row above
  draws — "an error reply distinct from a normal response with an error
  `StatusCode`" — is a distinction of `CommuniqueType`, not of whether a
  status code is present.

What it does not settle is **when** the server chooses `ExceptionResponse`
over a plain response with an error status. `fixtures/spec-read-caseta.json`
alone holds 191 `400`s and 38 `405`s, and being a probe set rather than a
frame log it records no `CommuniqueType` at all — so nothing in it says which
form any of those answers took. One frame is not a rule.

A later frame-logged session broadens it past one frame, though not all the
way to a rule (`$SRC/data/session-2026-08-13/`, an RA3/QSX processor at
v03.249 and a bare Caseta bridge at v01.124). Every *refused*
`SubscribeRequest`, `DeleteRequest` and `CreateRequest` in that session came
back as `ExceptionResponse`, across `405 MethodNotAllowed`, `400 BadRequest`
and `500 InternalServerError` alike — e.g. `SubscribeRequest
/zone/546/status` → `405`, `DeleteRequest /area/32` → `500`
(`{"Message": "Area could not be deleted."}`), `CreateRequest /virtualbutton`
→ `405`. The three whose full headers were logged (the subscribe refusals)
carry `MessageBodyType: ExceptionDetail`, matching the frame above; all carry
a `{"Message": <string>}` body, and the `Message` does not always track the
status (a `400` on `/zone/546/expanded/status` still read "This request is
not supported"). So a refused write or subscribe on a live connection is an
`ExceptionResponse`, consistently — what stays open is only the GET/probe-set
side, since those captures record no `CommuniqueType`.

Unsolicited subscription pushes are not a distinct `CommuniqueType` in this
list — they arrive with the same `CommuniqueType`/`Header`/`Body` shape as any
other frame, distinguished by the client only by `ClientTag` not matching a
pending request (see "Framing" above). All five pushes captured in
`fixtures/push-probe.json` take the same shape; one of the five verbatim
(`seq` 21):

```json
{
  "CommuniqueType": "ReadResponse",
  "Header": {
    "MessageBodyType": "MultipleZoneStatus",
    "StatusCode": "200 OK",
    "Url": "/zone/status",
    "ClientTag": "lt-18"
  }
}
```

The other four differ only in the fields that identify the subscription:
one more on `/zone/status` with `lt-18` and `MultipleZoneStatus` (`seq` 25),
and three on `/area/1340/status` with `lt-19` and `OneAreaStatus` (`seq` 22,
23 and 26). All five are `ReadResponse` / `200 OK`.

That is, **`ReadResponse` — not `SubscribeResponse`** — with `200 OK`, the
subscribed URL echoed back, and the subscription's own tag. `Body` carries
only the fields that changed, not a full snapshot; `docs/subscriptions.md`
has the details and the client consequences.

### Resource create and delete, observed

Until the `$SRC/data/session-2026-08-13/` session, the only `CreateResponse`
captured in this project was the command-processor form — `201 Created`,
`MessageBodyType: OneZoneStatus`, a `ZoneStatus` body (the eight frames the
`CommandResponse` row above accounts for) — and no `DeleteResponse` had ever
been seen at all. That session captured a full **create → delete round trip
on a real resource** (a `TimeclockEvent`, created under `/timeclock/6923`
then removed; all mutation office-scoped and self-restoring), which settles
the shape of both replies:

- **`CreateResponse`** — `StatusCode: 201 Created`,
  `MessageBodyType: OneTimeclockEventDefinition`, and a `Body` carrying the
  **created object echoed back in full**, not a status summary. So the
  resource-create reply mirrors the created entity (here a `TimeclockEvent`),
  where the command-processor reply mirrors the affected zone's status
  (`OneZoneStatus`) — the `MessageBodyType` names which. Two behaviors of
  note on this processor:
  - **Server-assigned ids are in a high, transient-looking range.** The new
    event came back as `/timeclockevent/2147483646` (2³¹−2), distinct from
    the low ids of committed objects. Whether this is an uncommitted-object
    id space or simply the next free id is not established here.
  - **The create can spawn child objects.** No `ProgrammingModel` was sent,
    yet the response carried `ProgrammingModel: {href:
    "/programmingmodel/2147483645"}` — the processor created one for the
    event.
- **`DeleteResponse`** — `CommuniqueType: DeleteResponse`,
  `StatusCode: 204 NoContent`, **no `Body`**. The delete **cascaded**: a
  follow-up `ReadRequest` for the auto-created `/programmingmodel/2147483645`
  answered `404`, so removing the event removed its child model too, leaving
  the timeclock as it was.

One resource family, one processor — this says nothing yet about whether
other creatable types reply in the same `One<Type>Definition` shape, or
whether every delete is a bodyless `204`. But `DeleteResponse` and the
resource-create `CreateResponse` are no longer unobserved. Note also that
the route table's face-value verb list overstates what a processor accepts:
`CreateRequest /virtualbutton` is refused `405` on this unit despite the
firmware table flagging the route CREATE-capable, and `/timeclock` itself is
GET-only (a timeclock is not LEAP-creatable; a timeclock *event* is). The
same holds for `UpdateRequest`: handed a zone's own read body straight back,
`UpdateRequest /zone/{id}` is refused `400` — so the table's `UPDATE` verb on
`/zone/{id}` does not mean the zone accepts its detail body as an update, and
zone writes go through the `CreateRequest`/`201` command path above. The
identical read-then-write-back on `/area/{id}` *is* accepted (`200`, and a
follow-up read shows the state unmoved), so the refusal is specific to the
zone resource, not to echoing a body in general.

That accepted `/area/32` write, plus a subscribe/unsubscribe on
`/zone/status`, also captured the two reply frames this project had never
seen — and the update one partly answers the "same `One<Type>Definition`
shape?" question above:

- **`UpdateResponse`** — `StatusCode: 200 OK`,
  `MessageBodyType: OneAreaDefinition`, `Body` carrying the updated entity
  echoed back. So an update reply mirrors the updated object the same way the
  resource-create reply mirrors the created one — `One<Type>Definition` in
  both.
- **`UnsubscribeResponse`** — from `UnsubscribeRequest /zone/status` after a
  `SubscribeRequest` on the same URL: `StatusCode: 204 NoContent`, no `Body`,
  no `MessageBodyType`, correlated on its own `ClientTag`. Bodyless like the
  successful `DeleteResponse` above. (`fixtures/subscriptions.json` records
  subscribe *acceptance* only; this is the first `UnsubscribeResponse` frame
  captured — see `docs/subscriptions.md`, which had it as never observed.)

## Status codes

`Header.StatusCode` deliberately mimics HTTP status line text — literal
strings like `"200 OK"`, not bare numeric codes. This is the detail that makes
an OpenAPI representation a good fit rather than a forced one (see
`docs/mapping.md`).

Counts below are observed across this project's probe sweeps of RA3 (1,124
endpoints) and Caseta (963 endpoints) — 2,087 total probed requests, tallied
in this project's design document:

| Status | Count observed | Notes |
|---|---|---|
| `400 BadRequest` | 1,310 | By far the most common response — an unsupported or malformed request. |
| `200 OK` | 439 | |
| `204 NoContent` | 183 | Valid request, empty result (e.g. an empty list, or a feature not configured on this system). |
| `404 NotFound` | 117 | The resource type is recognized but the specific instance does not exist. |
| `500 InternalServerError` | 32 | Observed on RA3 for `/device/{id}/ledsettings` — the field exists in the firmware but is broken on that platform. |
| `405 MethodNotAllowed` | 6 | The path exists but not for the verb used — e.g. `ReadRequest /zone` on RA3, which lacks a flat zone-list endpoint (see `docs/platforms.md`). |
| `502 Bad Gateway` | 0 (not observed) | Listed in `$SRC/docs/reference/leap-api-spec.yaml`'s firmware-derived `StatusCodes` note as a code the server emits, but no request in either probe sweep triggered it. |
| `504 Gateway Timeout` | 0 (not observed) | Same source and same caveat as `502` above. |

`502` and `504` are included here because they are named in the firmware's own
list of status codes it can emit, not because any capture in this project's
corpus shows one.

### `102 Processing` — an interim acknowledgement, not a terminal status

Not part of the RA3/Caseta counts above, and observed on a separate,
single-processor sweep (Task 8's probe campaign against an RA3 processor at
a host masked throughout this project's public fixtures — see
`docs/platforms.md`): 5 of that sweep's 206 probed paths, all
`ReadRequest /firmwareimage/{firmwareimageId}`, initially came back
`102 Processing` with a null body instead of a terminal status.

`102 Processing` is **not** the final answer. The processor follows it, on
the *same* `ClientTag`, with the real response roughly a second later —
`StatusCode: 200 OK`, a populated body, `CommuniqueType: ReadResponse`. All
5 of the interim `102`s in this sweep resolved this way; none was ever
followed by anything else. `fixtures/late-frames.json` (redacted) captures
those 5 real, delayed responses directly — `receivedMsAfterSubscribe`
(a generic timing field name from the capture tool, not specific to
subscriptions) records 980–1029ms after the original request, and each
frame's `header.ClientTag` (`lt-1`) matches what the corresponding entry in
`fixtures/sweep-read.json` would have used to send the request in the first
place.

This is a **two-frame pattern for a single logical request**, not a
subscription push and not a distinct `CommuniqueType`. Both this and a
subscription push land on a tag the client has seen before, which makes them
easy to conflate; the difference is whether the tag is still pending. A `102`
arrives while the request is unresolved and is followed by that request's
terminal response. A push arrives after the request already got its terminal
response, and only when the resource's state moves. `docs/mapping.md`'s
verb table and "The 14 CommuniqueTypes" section above still apply
unchanged; a client just cannot treat the first frame on a tag as
necessarily the last. `$SRC/lib/leap-client.ts`'s `handleData` (see
"Framing and correlation" above) implements this directly: on a frame whose
`ClientTag` matches a pending request, if `Header.StatusCode` starts with
`102`, the frame is discarded and the pending entry is left in place rather
than resolved; the entry is only resolved (and removed) on a later frame
carrying the same tag with a non-`102` status. An earlier version of this
client resolved on the `102` itself, permanently losing the real response
that followed — `$SRC`'s own commit history documents this bug and its fix,
made necessary directly by this sweep's captured evidence. Only `102` has
been observed behaving this way; every other status, including other `1xx`
codes not yet seen in practice, is still treated as terminal.

This has one direct consequence for a client's timeout handling: a fixed
deadline measured from the original request still covers the observed case
(the real response arrives in ~1s, well inside a typical multi-second
timeout), so `$SRC/lib/leap-client.ts` deliberately does *not* extend or
reset its per-request timeout when a `102` is seen for that tag — doing so
would let a processor that kept re-emitting `102` without ever finishing
stall the caller indefinitely instead of failing loudly.

## Transports

LEAP is one protocol among several the processor speaks, all sharing the same
JSON-envelope design but on different ports with different client-limit and
authentication rules. Source: `$SRC/docs/reference/leap-api-spec.yaml`'s
"Transport configuration" comment block, itself derived from the firmware
binary:

| Transport | Port | Notes |
|---|---|---|
| LEAP (TLS) | TCP 8081 | The subject of this specification. Mutual TLS. 10 clients max, 600-second idle timeout. |
| LEAP (plaintext) | TCP 8080 | Localhost only — not reachable from the network. |
| LAP | TCP 8083 | Mutual TLS. 25 integrators max. "LAP" is also used elsewhere in the source material as an abbreviation for "Lutron Authentication Protocol" describing the unauthenticated pairing handshake (see "Mutual TLS and certificate provisioning" below); whether that pairing flow and this TCP 8083 transport are the same thing is not established in the available sources, and this document does not assume they are. |
| HAP | TCP 4548 | HomeKit Accessory Protocol bridging. 20 clients max. |
| McLEAP | UDP multicast, `239.255.255.255:2647` | 4,000-byte maximum datagram. This resolves a question `$SRC/docs/protocols/leap/index.md` leaves open — it calls the purpose of UDP:2647 "unknown," observing only that the RA3 `/server` endpoint advertises a `UDP` port `2647` endpoint alongside the TLS `8081` one. The firmware-derived spec names the protocol (McLEAP) and its parameters; what McLEAP is used for beyond that (e.g. discovery, keepalive) is not established from the firmware alone. **A live on-subnet capture did not confirm the firmware's parameters and points at "discovery beacon."** Listening on UDP:2647 directly on the QSX processor's own Lutron VLAN (via SSH to the processor, ~110 s across idle and zone-provoked windows, 2026-08-13) saw **nothing on `239.255.255.255` and nothing 4000-byte or JSON-shaped**. What UDP:2647 multicast the segment did carry was a 10-byte ASCII payload — `<LUTRON=1>` — on group **`224.0.37.42`**, emitted every 30 s from the network's UniFi gateway IP (`10.1.9.1`, a Ubiquiti source MAC), **not** from the processor: the QSX binds `0.0.0.0:2647` and joins a 2647 group but was never seen to transmit. Driving an office zone produced no multicast at all — that state change rode unicast LEAP/TLS (8081) subscriptions. So on this network UDP:2647 behaves as a small periodic presence/discovery beacon, and whether that `<LUTRON=1>` beacon *is* the firmware's "McLEAP" or a separate gateway-sourced discovery is unresolved; the firmware's `239.255.255.255` / 4000-byte / JSON-envelope form was not observed and may require a trigger this capture never hit (processor boot, or an app/Designer discovery burst). |

What each processor's `/server` advertises live (2026-08-13,
`$SRC/data/session-2026-08-13/`) ties this firmware-derived table to observed
endpoints and shows it is not uniform across platforms:

- **QSX/Phoenix (v03.249)** — `/server/1` lists two endpoints, `TCP 8081`
  and `UDP 2647` (LEAP + McLEAP), and a separate `/server/ipl` object lists
  `TLS 8902` and `WSS 443` — the IPL transport (see `docs/discovery.md` /
  `$SRC` for IPL) reachable over both a raw TLS socket and secure WebSocket.
- **Caseta (v01.124)** — `/server/1` lists only `TCP 8081`. No `UDP 2647`,
  no `/server/ipl`. So McLEAP and IPL are Phoenix features here, absent on
  the Caseta bridge, consistent with the McLEAP row above.

## Mutual TLS and certificate provisioning

The LEAP TLS transport (port 8081) uses mutual TLS: both client and server
present X.509 certificates, and the server only accepts connections from
clients whose certificate it trusts. `$SRC/docs/protocols/leap/api-discovery.md`
("Certificate & Security Architecture," decompiled from the Android app,
`com.lutron.lsb` v26.1.0.4) describes how a client obtains a certificate
during initial pairing, before it has one:

1. Connect to the bridge on the LEAP port without a client certificate.
2. Send `ReadRequest /certificate/root` (unauthenticated — this is the one
   endpoint reachable before pairing).
3. Receive `Body.Certificate.Certificate`, a PEM-encoded X.509 root
   certificate: the bridge's own self-signed CA, generated per bridge
   instance.
4. Generate an EC keypair (secp256r1) and a CSR.
5. Send the CSR to a `/pair` endpoint.
6. Receive a signed client certificate.
7. Store both the root certificate and the client certificate for all future
   mTLS connections.

Once paired, `/certificate/root` returns `400` — RA3 was observed returning
this because the connection is already authenticated via mTLS, and the
endpoint is believed to be available only on the unauthenticated listener used
during setup.

TLS configuration observed from the app: TLS 1.2 exclusively (no TLS 1.3),
mutual authentication, EC keys on the secp256r1 curve signed with
SHA256withECDSA, with RSA-2048 used for legacy/Caseta pairing paths.

This project's own test fixtures connect using pre-provisioned per-processor
certificate bundles (see `config.example.json` in `$SRC`) rather than
performing this pairing flow live. See `docs/discovery.md` for how a client
locates a processor to pair with in the first place.
