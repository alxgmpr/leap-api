# leap-api

An unofficial reference for Lutron LEAP (Lutron Extensible Application
Protocol) — the JSON protocol RA3/HWQS processors and Caseta bridges speak
over mutual-TLS port 8081. Built from a firmware route and type extraction
cross-checked against roughly 5,000 requests of probe traffic captured on
live RA3 and Caseta hardware, and published as a browsable site
(<https://alxgmpr.github.io/leap-api/>) and an OpenAPI 3.1 document.

**Not affiliated with, endorsed by, or reviewed by Lutron Electronics.**
Behavior was observed on specific firmware builds and may differ on others.
Where something is inferred rather than confirmed, the spec says so — look
for "not established".

## Layout

- `spec/` — hand-refined paths and schemas; bundles to `dist/openapi.yaml`
- `docs/` — the wire protocol, spec conventions, subscriptions, platform
  divergence, and discovery/pairing
- `fixtures/` — redacted captured traffic the schemas are validated against
- `site/` — the browsable reference (generated, not checked in)

Content comes in two tiers: hand-refined (checked against captures) and
imported (`x-leap-verified: false` — the firmware route table taken as-is,
never exercised on hardware). The site's Coverage section has the current
numbers.

## For agents (machine-readable)

- Spec: <https://alxgmpr.github.io/leap-api/openapi.yaml> (also
  [`openapi.json`](https://alxgmpr.github.io/leap-api/openapi.json))
- Index of everything: <https://alxgmpr.github.io/leap-api/llms.txt>
- Docs as raw markdown: `https://alxgmpr.github.io/leap-api/docs/<name>.md`

Schemas describe the **unwrapped** payload — `Body` is a one-key wrapper
named by `Header.MessageBodyType`. Read
[protocol.md](https://alxgmpr.github.io/leap-api/docs/protocol.md) before
writing a client.

## Use

```bash
npm install
npm run bundle       # spec/ -> dist/openapi.yaml (required before npm test)
npm run build:site   # dist + fixtures + docs -> site/
npm test
```
