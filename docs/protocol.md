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

### `Body` is a wrapper, not the payload — read this before writing a client

`Body` does **not** contain the payload directly. It contains a single key,
named by `Header.MessageBodyType`, whose value is the actual payload:

```json
"Body": { "ZoneStatus": { "href": "/zone/518/status", "Level": 100 } }
```

Every schema in this specification (`spec/components/schemas/`) describes
the **unwrapped payload** — the value of that one key (`{ "href":
"/zone/518/status", "Level": 100 }` above), not the `{"ZoneStatus": {...}}`
envelope around it. A client that parses `Body` itself as the payload object
will fail on every response, because every response actually looks like
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
resolved by an unrelated subscription's push. See `docs/subscriptions.md` for
the evidence, the delta-versus-snapshot shape of push bodies, and the limits
of a single-processor sample.

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
| `CreateResponse` | server → client | Reply to a `CreateRequest`. |
| `UpdateRequest` | client → server | Modify an existing resource. Maps to `PUT`. |
| `UpdateResponse` | server → client | Reply to an `UpdateRequest`. |
| `DeleteRequest` | client → server | Remove a resource. Maps to `DELETE`. |
| `DeleteResponse` | server → client | Reply to a `DeleteRequest`. |
| `SubscribeRequest` | client → server | Start a subscription on a resource. |
| `SubscribeResponse` | server → client | Reply to a `SubscribeRequest`, carrying the initial state. |
| `UnsubscribeRequest` | client → server | End a subscription. |
| `UnsubscribeResponse` | server → client | Reply to an `UnsubscribeRequest`. |
| `ExceptionResponse` | server → client | An error reply distinct from a normal response with an error `StatusCode`. Named in the firmware's own communique-type count; no capture in this project's corpus shows one on the wire, so its exact shape is not established here. |
| `CommandResponse` | server → client | Named in the firmware's own communique-type count. Whether this is used interchangeably with `CreateResponse` for command-processor replies, or is a distinct reply type, is not established from the sources available to this project — no command-processor response body was captured (see `docs/mapping.md`'s Commands section for why: the firmware route extraction has zero `commandprocessor` routes, so this whole write surface is documented from app RE, not captured traffic). |

Unsolicited subscription pushes are not a distinct `CommuniqueType` in this
list — they arrive with the same `CommuniqueType`/`Header`/`Body` shape as any
other frame, distinguished by the client only by `ClientTag` not matching a
pending request (see "Framing" above). Every push captured in
`fixtures/push-probe.json` takes the same concrete form:

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

That is, **`ReadResponse` — not `SubscribeResponse`** — with `200 OK`, the
subscribed URL echoed back, and the subscription's own tag. `Body` carries
only the fields that changed, not a full snapshot; `docs/subscriptions.md`
has the details and the client consequences.

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
corpus shows one — that gap is stated explicitly rather than silently omitted.

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
| McLEAP | UDP multicast, `239.255.255.255:2647` | 4,000-byte maximum datagram. This resolves a question `$SRC/docs/protocols/leap/index.md` leaves open — it calls the purpose of UDP:2647 "unknown," observing only that the RA3 `/server` endpoint advertises a `UDP` port `2647` endpoint alongside the TLS `8081` one. The firmware-derived spec names the protocol (McLEAP) and its parameters; what McLEAP is used for beyond that (e.g. discovery, keepalive) is not established here. |

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
