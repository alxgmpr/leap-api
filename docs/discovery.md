# Discovery and pairing

Before a client can open a LEAP session it needs to find a processor or
bridge on the local network and obtain a certificate trusted by it. This
document covers both. See `docs/protocol.md` for the transport and mutual-TLS
mechanics once a session is established.

## mDNS discovery

Lutron processors and bridges advertise themselves via mDNS/Bonjour under the
service type `_lutron._tcp`
(`$SRC/docs/protocols/leap/index.md`, "Protocol Basics"). A live RA3
processor's `/service/homekit` endpoint independently confirms the same
Bonjour identity from the device side: it reports a non-empty
`BonjourServiceName` (redacted as `<name-N>` in this project's fixtures,
since it may be user-customizable per installation — see
`fixtures/ra3.json`'s `HomeKitProperties.BonjourServiceName`).

To enumerate every Lutron device advertising on the local network:

```
dns-sd -B _lutron._tcp
```

### TXT record fields

The advertised TXT record carries at least these fields
(`$SRC/docs/protocols/leap/index.md`):

| Field | Meaning |
|---|---|
| `MACADDR` | The device's MAC address. |
| `CODEVER` | Firmware/code version. |
| `SYSTYPE` | System type (distinguishes RA3/HWQS from Caseta from other product lines). |
| `SERNUM` | Serial number. |

The source material notes the advertisement's stated purpose is to advertise
an SSH port (legacy access, historically used on Caseta) rather than the LEAP
TLS port directly — a client still needs to separately know or default to
port 8081 for LEAP itself (`docs/protocol.md`).

## Certificate provisioning per platform

All LEAP-family platforms in scope for this project use the same general
pairing architecture — described in full in `docs/protocol.md`'s "Mutual TLS
and certificate provisioning" section: an unauthenticated
`ReadRequest /certificate/root` returns the bridge's self-signed root CA, the
client generates an EC keypair and CSR, and a signed client certificate comes
back from a `/pair` endpoint. That flow is documented from Android app
reverse engineering (`$SRC/docs/protocols/leap/api-discovery.md`) and is not
independently re-derived per platform here; this section records what does
differ by platform.

- **RA3 / HWQS.** Certificates are issued per processor, chained to a
  processor-specific self-signed root. The Android app additionally ships a
  hardcoded `phoenix_root_cert.pem` asset ("Phoenix" is the RA3 platform
  codename) alongside the per-bridge root — the source material treats this
  as suggestive of a platform-wide root CA shared across RA3 processors, but
  does not confirm it; this document does not assert more than that.
- **Caseta / RA2 Select.** Certificates are issued per bridge. The Android
  app's flow is the `/certificate/root` → CSR → `/pair` one above, but a live
  capture of a different client shows Caseta also accepts a distinct **LAP /
  port 8083** pairing exchange that never reads `/certificate/root` — see
  "The Caseta LAP pairing flow, captured live" below. The Android app ships a
  separate hardcoded `caseta_root_cert.pem` asset, distinct from the RA3
  Phoenix one, plus a pre-provisioned app client certificate/key pair
  (`app_cert.pem` / `private_key.pem`) used during the pairing handshake
  itself, before the bridge-specific client certificate is issued. Caseta
  additionally has a legacy pairing/access path over SSH on port 22 that RA3
  does not (`$SRC/docs/protocols/leap/index.md`'s "Protocol Basics" notes SSH
  port 22 as "legacy Caseta").
- **Vive.** The source repository holds a separate `lutron-vive-ca.pem` /
  `lutron-vive-cert.pem` / `lutron-vive-key.pem` certificate triple, distinct
  from the RA3 files (`lutron-ra3-ca.pem` / `lutron-ra3-cert.pem` /
  `lutron-ra3-key.pem`) — evidence that Vive uses its own certificate chain,
  separate from both RA3 and Caseta, but the pairing flow itself was not
  independently probed against a Vive system for this project. See
  `docs/platforms.md`, which documents Vive as thin/unprobed generally.
- **Cloud LEAP proxy.** Not probed for pairing behavior in this project.
  App reverse engineering is the only source available for the cloud path
  generally (`docs/platforms.md`).

Most of this project's probing connects using pre-provisioned certificate
bundles resolved per target host (the mechanism `$SRC/config.example.json`
sketches for RA3: a per-host `cert`/`key`/`ca` triple). But the pairing flow
itself has now been **captured live once**, for Caseta — and the captured
flow does not match the `/certificate/root` account above, which is the
Android app's. See the next subsection.

### The Caseta LAP pairing flow, captured live

The Android-RE account above (LEAP port 8081, unauthenticated
`ReadRequest /certificate/root`, an EC/secp256r1 CSR) is one client's flow.
A live capture of a **different** client — `pylutron_caseta`'s
`async_pair`, instrumented to log every frame while pairing the bench Caseta
bridge (v01.124) on 2026-08-13, `$SRC/data/session-2026-08-13/pairing-caseta-capture.json`
— shows a distinct path that never reads `/certificate/root` at all:

1. **Transport is LAP on port 8083, not LEAP on 8081**, and it is *mutual*
   TLS from the first byte: the client authenticates with a **pre-shipped,
   well-known LAP client cert/key** and validates the bridge against a
   shipped LAP CA (both baked into `pylutron_caseta`), so this leg is not
   "unauthenticated." RA3 differs only in the validating CA — `pylutron`
   falls back to the Lutron root CA when the LAP CA fails to verify the 8083
   listener, and treats that as the signal the bridge is RA3.
2. **The envelope is not LEAP's.** Frames use `Header.RequestType`,
   `Header.ContentType`, and `Header.CorrelationID` — not `CommuniqueType` /
   `MessageBodyType` / `StatusCode`-only.
3. **The button press is a status frame**, received on the LAP socket:
   `ContentType: "status;plurality=single"`, body
   `{"Status": {"Permissions": ["Public", "PhysicalAccess"]}}`. The
   `PhysicalAccess` permission is the gate — it is absent until the small
   black button on the bridge is pressed, and the client blocks until it
   appears.
4. **The CSR is submitted as a command to `/pair`:**

   ```json
   { "Header": { "RequestType": "Execute", "Url": "/pair", "ClientTag": "get-cert" },
     "Body": { "CommandType": "CSR",
       "Parameters": { "CSR": "<PEM CSR>", "DisplayName": "pylutron_caseta",
                       "DeviceUID": "000000000000", "Role": "Admin" } } }
   ```

   The CSR here is **RSA-2048**, not the EC/secp256r1 the app-RE section
   describes — a client-implementation difference, not necessarily a bridge
   requirement.
5. **The reply carries the issued certificate and the root:**
   `ContentType: "signing-result;plurality=single"`, a `CorrelationID` UUID,
   body `{"SigningResult": {"Certificate": "<PEM>", "RootCertificate": "<PEM>"}}`.
6. **Verification is a normal LEAP exchange on 8081** with the freshly issued
   cert: `ReadRequest /server/1/status/ping` → `ReadResponse`,
   `MessageBodyType: OnePingResponse`, body
   `{"PingResponse": {"LEAPVersion": 1.124}}`.

So there are at least two real pairing paths — the app's `/certificate/root`
LEAP flow and this LAP `/pair` `CommandType: CSR` flow — and this is the one
this project has now watched on the wire. What is *not* established is
whether the Caseta bridge would also honor the app's `/certificate/root`
route; only the LAP path was exercised. All PEM blobs in the capture file
are placeholdered, and no key material is recorded.

## Certificate revocation

The Android app ships a `security/revoked_certs.pem` asset
(`$SRC/docs/protocols/leap/index.md`), implying some certificate revocation
mechanism exists client-side. How revocation is checked or enforced during a
live LEAP TLS handshake is not established in the sources available to this
project.
