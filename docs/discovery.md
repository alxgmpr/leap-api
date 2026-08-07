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
Bonjour identity from the device side: it reports a `BonjourServiceName` of
`"Lutron Processor"`.

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
- **Caseta / RA2 Select.** Certificates are issued per bridge, following the
  same `/certificate/root` → CSR → `/pair` flow. The Android app ships a
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

This project's own test fixtures and probing did not exercise the pairing
flow live — they connect using pre-provisioned certificate bundles resolved
per target host (the mechanism `$SRC/config.example.json` sketches for RA3:
a per-host `cert`/`key`/`ca` triple). A from-scratch client implementation
needs to perform the CSR/`/pair` exchange described in `docs/protocol.md` at
least once per bridge before it has a certificate to connect with at all.

## Certificate revocation

The Android app ships a `security/revoked_certs.pem` asset
(`$SRC/docs/protocols/leap/index.md`), implying some certificate revocation
mechanism exists client-side. How revocation is checked or enforced during a
live LEAP TLS handshake is not established in the sources available to this
project.
