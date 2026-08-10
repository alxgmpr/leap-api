# Platform divergence

LEAP is spoken, with real differences, by several distinct product lines.
This specification's schemas are derived from one of them — see "Scope and
schema provenance" below before relying on any schema for a platform other
than RA3.

## Scope and schema provenance

| Platform | Source coverage in this project |
|---|---|
| RA3 / HWQS | Deep. Firmware extraction (410 routes, 636 struct definitions) plus 1,124 endpoints probed live on firmware v03.247. |
| Caseta / RA2 Select | Probe only, two bridges, no firmware extraction — a full 963-endpoint sweep of a configured bridge, plus an 848-URL coverage-blind probe of a second, nearly-empty one (see "The coverage-blind probe" below). Exposes device-configuration endpoints RA3 does not (see below). |
| Vive | Thin. Represented in this project's source data only by `leap-vive.json`, a 5.5&nbsp;KB dump that is summary-shaped (built by a dump tool's own output format) rather than path-keyed probe data — see "Vive" below for why that matters. |
| Cloud LEAP proxy | Thin. App reverse engineering only; no live probing was performed against it. |

**Every schema in this specification (`spec/components/schemas/`) is
RA3-derived.** RA3 is the only platform with a firmware extraction, and the
firmware extraction is this project's schema source (see `docs/mapping.md`).
Caseta, Vive, and the cloud proxy do not get their own schema trees — they
contribute *divergence data* instead: which routes exist, which return which
status, layered onto the RA3-derived operations via the `x-leap-platforms`
extension (`docs/mapping.md`) and the table below. A `200 OK` recorded for
Caseta on some path means Caseta was observed returning success on that path,
not that Caseta's response body was independently verified against the
schema shown for it.

**Vive** and the **cloud proxy** are documented-but-unprobed for the purposes
of this specification: neither contributes to `x-leap-platforms`, and neither
appears in the divergence table below, because neither has path-keyed probe
data in this project's fixture pipeline. `data/leap-vive.json` in the source
repository uses camelCase field names that are an artifact of the dump tool
that produced it (`tools/leap/leap-dump.ts` building its own summary object)
and are explicitly **not** the Vive wire format — treat that file as informal
notes, not as evidence for this document. Bringing either platform into the
conformance corpus this specification is validated against would require new
capture work, which is out of scope here.

## A second RA3 unit, and what its refusals show

Task 8's probe campaign targeted two configured processors, both masked
throughout this project's public fixtures and this document: the same RA3
unit behind `fixtures/ra3.json`, and a second, previously-unswept RA3 unit.
**The first was unreachable for the entire campaign** (no response on TCP
8081, no ARP entry); every sweep capture in this project
(`fixtures/sweep-read.json`, `fixtures/sweep-write.json`,
`fixtures/subscriptions.json`, `fixtures/late-frames.json`) is against the
second unit instead. This is not an ambiguity about which platform was
reached: the swept unit is confirmed a genuine RA3 processor by its own
`GET /clientsetting` response (`ClientMajorVersion: 3`, an `Admin` session —
see `fixtures/sweep-read.json`), independent of, and a different physical
unit from, the one behind `fixtures/ra3.json`.

Of the 206 routes this campaign probed against it — the firmware's own
route table, minus routes this specification already documents (so the
sweep would surface only genuinely new ground) — **119 (58%) came back
`400 BadRequest`, body `{"Message": "This request is not supported"}`, a
deliberate server refusal, not a malformed request or a wrong host.** Only
56 came back `200 OK`. This is the direct explanation for Task 8's modest
yield (5 new path templates, 2 existing templates gaining their first
fixture, out of 206 routes probed): **presence in the firmware-extracted
route table does not mean a live processor implements that route.** The
firmware extraction (`vendor/leap-routes.json`) is a recovered
compile-time route table — every handler the server binary *can* dispatch
to — not a live capability list for any one deployed unit; a specific
processor's actual configuration, firmware build, and installed
feature set determine which of those routes it answers on the wire, and
this unit answers well under half of the routes it was asked about with a
handler that exists in the binary but declines to serve. This is a real
finding about how firmware-extracted route tables and live processor
behavior diverge, not a failure of the probe methodology — see
`docs/mapping.md` for how this specification's own paths are derived from
that same route table, and why probe confirmation (not extraction
presence alone) is what this project treats as evidence a route is
actually live. The conclusion in this section was drawn from one unit, so
"this processor is configured differently" remained a live alternative
explanation for it; the next section closes that off with a second platform.

## The coverage-blind probe, and what two platforms' refusals show

The sweep above deliberately skipped every route this specification already
documents, so it could only ever answer "what is out there that we have not
written up". It could not answer the obvious follow-up: **are the routes it
found refused because the firmware never implements them, or because that
one processor does not?**

A later, *coverage-blind* probe was built to answer exactly that. It ignores
what the sweep had already covered and replays the specification's **own**
path list — every URL this document declares — against a live unit,
recording status and body for each. It has now been run twice:

| Corpus | Unit | URLs | Statuses |
|---|---|---|---|
| `fixtures/spec-read.json` | RA3 v03.247, the same second unit the sweep reached | 864 | 226 × `200`, 61 × `204`, 192 × `400`, 366 × `404`, 11 × `405`, 8 × `500` |
| `fixtures/spec-read-caseta.json` | Caseta v01.123 (`L-BDG2-WH`), a bridge re-paired after a factory reset | 848 | 104 × `200`, 195 × `204`, 191 × `400`, 317 × `404`, 38 × `405`, 3 × `500` |

Both are `{path: {status, body}}` probe sets in `captures.json`, so the
conformance suite validates their bodies against this specification's schemas
like any other corpus. `ServiceType.yaml`, `ServerType.yaml`,
`Organization.yaml` and `LoadController.yaml` all cite one of them as the
evidence for a firmware-derived assertion that hardware falsified.

### The two-platform refusal test

Collapsing every concrete probed path to a template (each `/\d+/` segment to
`/{id}`) and, where several concrete instances collapse to one template,
keeping the most successful observed status — the same rule
`lib/platform-matrix.ts` uses, and the ranking among *non*-`200` statuses
turns out not to matter here: three different tie-break orders give the same
counts — **187 templates were probed on both platforms.** Of those:

- **RA3 refuses 59** with `400 BadRequest` or `405 MethodNotAllowed`.
- **Caseta refuses 56 of those same 59** (54 × `400`, 2 × `405`).
- **2 are refused by RA3 and work on Caseta**: `/zone` and
  `/zone/tuningsettings` — both already-known flat-collection and
  zone-tuning divergences, covered in the two sections below.
- The remaining 1 is `/system/action`, which Caseta answers `204 NoContent`
  — neither a refusal nor data. See the caveat below for why.
- Going the other way, **3 work on RA3 and are refused by Caseta**:
  `/project/masterdevicelist`, `/server/ipl`, and
  `/system/loadshedding/status`.

Reproduce from the committed fixtures with:

```
node --import tsx -e '
import { readFileSync } from "node:fs";
import { buildMatrix } from "./lib/platform-matrix.ts";
const m = buildMatrix({
  ra3: JSON.parse(readFileSync("fixtures/spec-read.json", "utf8")),
  caseta: JSON.parse(readFileSync("fixtures/spec-read-caseta.json", "utf8")),
});
const rows = Object.entries(m).filter(([, s]) => s.ra3 !== "not probed" && s.caseta !== "not probed");
const ref = (s) => s.startsWith("400") || s.startsWith("405");
const ra3Ref = rows.filter(([, s]) => ref(s.ra3));
console.log("probed on both:", rows.length);
console.log("RA3 refuses:", ra3Ref.length);
console.log("  Caseta also refuses:", ra3Ref.filter(([, s]) => ref(s.caseta)).length);
console.log("  Caseta 200:", ra3Ref.filter(([, s]) => s.caseta.startsWith("200")).map(([p]) => p));
console.log("Caseta refuses, RA3 200:", rows.filter(([, s]) => ref(s.caseta) && s.ra3.startsWith("200")).map(([p]) => p));
'
```

**What this establishes.** 95% of the routes one platform's firmware declines
to serve, the *other platform's completely different firmware* also declines
to serve. The section above concluded from a single RA3 unit that presence in
the firmware-extracted route table does not imply a live implementation; that
was a claim about one device, and a per-unit configuration difference was a
live alternative explanation for it. It no longer is. Two units, two product
lines, two firmware builds, two households, and the same 56 routes refused by
both: the refusals track the route rather than the installation.

**What it does not establish.** This is still two devices. The Caseta bridge
in particular is nearly unconfigured — one device (the bridge itself) and one
zone — so a `404` from it is very often a statement that nothing of that kind
exists on *this* bridge, not that the platform lacks the concept. That is why
this comparison is drawn on `400`/`405` refusals and not on the 317 `404`s,
which are the status most contaminated by an empty installation. Refusals are
the server declining to serve a route at all; `404` is the server serving the
route and finding nothing.

**And a worked example of that caveat.** `/system/action` is listed in the
divergence table below as Caseta `200 OK` — a Caseta-only automation feature,
recorded from the fully configured bridge of the original campaign. The
nearly-empty bridge answers `204 NoContent` on the same route. Nothing about
the platform changed; the second bridge simply has no automation rules
configured. Read every Caseta absence in this document with that in mind.

### One more platform-wide difference this probe surfaced

**Caseta emits no `XID` on any object, on any route.** Across all five probe
corpora: 0 of 92 zones, 0 of 144 devices and 0 of 50 areas on the original
Caseta capture, and 0 of everything on the second bridge — while RA3 returns
one on areas, zones, control stations and load controllers. The cross-reference
identifier `docs/mapping.md` describes as an alternative addressing key for
several routes appears to be an RA3-family concept. This falsified
`LoadController`'s firmware-derived `required: XID` (see
`LoadController.yaml`); `ControlStation` still requires it, because no Caseta
capture returns a control station at all and so nothing has falsified it.

## RA3 vs. Caseta: two different navigation models

The single largest structural difference between the two platforms this
project probed in full is how a client discovers zones and devices at all.

**Caseta exposes flat list endpoints** — `GET /zone` and `GET /device` return
every zone and device on the system in one call. **RA3 does not**: both of
those bare collection endpoints are unavailable on RA3 (`/zone` returns
`405 MethodNotAllowed`; `/device` returns `204 NoContent`, an empty result,
not an error). RA3 requires **area-walk navigation** instead: enumerate
`/area`, then for each area call `/area/{areaId}/associatedzone` and
`/area/{areaId}/associatedcontrolstation` to reach that area's zones and
control stations. There is no evidence in this project's source material for
why RA3, an architecturally newer and more capable platform than Caseta,
dropped the flat endpoints — it is simply the observed behavior.

## Caseta exposes device configuration RA3 does not

Caseta returns real data (`200 OK`) for several device-configuration and
zone-tuning endpoints that RA3 either outright rejects (`400`/`404`) or, in
one case, exposes with a broken implementation:

- **LED settings** (`/device/{deviceId}/ledsettings`) — Caseta: `200 OK` on
  wired dimmers/switches. RA3: `500 InternalServerError` on every device
  tested — the field exists in the firmware but the implementation is broken
  on RA3, not merely absent.
- **Tuning settings** (`/zone/{zoneId}/tuningsettings`) — high/low/energy trim
  per zone. Caseta: `200 OK`. RA3: `404 NotFound` (the resource type is
  recognized but never populated).
- **Phase settings** (`/zone/{zoneId}/phasesettings`) — forward/reverse dimmer
  phase. Caseta: `200 OK`. RA3: `404 NotFound`.
- **Countdown timers** (`/zone/{zoneId}/countdowntimer`) — Caseta: `200 OK`,
  with real configured timers observed. RA3: `404 NotFound`.
- **System actions** (`/system/action`) — Caseta-only automation rules
  (`Arrive`/`Leave` scenes triggering virtual buttons). Caseta: `200 OK`. RA3:
  `400 BadRequest`.

On RA3, this class of configuration is managed exclusively through Lutron
Designer (a separate protocol, IPL, on different ports and certificates —
see `docs/protocol.md`), not through LEAP. This is architectural, not a gap in
this project's probing: RA3's firmware genuinely does not serve these values
over LEAP.

## Generated divergence table

The table below is produced directly from this project's `buildMatrix`
function (`lib/platform-matrix.ts`) against the committed, redacted probe
fixtures (`fixtures/ra3.json`, `fixtures/caseta.json`) — not hand-typed —
using:

```
node --import tsx -e '
import { readFileSync } from "node:fs";
import { buildMatrix } from "./lib/platform-matrix.ts";
const m = buildMatrix({
  ra3: JSON.parse(readFileSync("fixtures/ra3.json", "utf8")),
  caseta: JSON.parse(readFileSync("fixtures/caseta.json", "utf8")),
});
const diverge = Object.entries(m).filter(([, s]) => s.ra3 !== s.caseta);
console.log("| Path | RA3 | Caseta |");
console.log("| --- | --- | --- |");
for (const [p, s] of diverge.sort()) console.log(`| \`${p}\` | ${s.ra3} | ${s.caseta} |`);
'
```

`buildMatrix` templates each concrete probed path (`/zone/518` →
`/zone/{zoneId}`) and, where several concrete instances collapse to one
template, keeps the most successful observed status per platform — a single
`404` for one deleted id does not mask that the route works for others. Where
a platform never probed a given templated path at all, it reads `not probed`
rather than being omitted. 32 templates diverge between the two platforms:

| Path | RA3 | Caseta |
| --- | --- | --- |
| `/area/{areaId}/associatedcontrolstation` | 200 OK | 204 NoContent |
| `/area/{areaId}/associatedzone` | 200 OK | 204 NoContent |
| `/buttongroup` | 204 NoContent | 200 OK |
| `/device` | 204 NoContent | 200 OK |
| `/device/status` | 204 NoContent | 200 OK |
| `/device/{deviceId}/buttongroup/expanded` | 200 OK | 204 NoContent |
| `/device/{deviceId}/ledsettings` | 500 InternalServerError | 200 OK |
| `/facade` | 204 NoContent | 200 OK |
| `/link/{linkId}` | 200 OK | 404 NotFound |
| `/link/{linkId}/associatedlinknode` | 200 OK | 204 NoContent |
| `/occupancygroup` | 204 NoContent | 200 OK |
| `/occupancygroup/status` | 204 NoContent | 200 OK |
| `/occupancygroup/{occupancygroupId}` | not probed | 200 OK |
| `/occupancygroup/{occupancygroupId}/associatedsensor` | not probed | 400 BadRequest |
| `/occupancygroup/{occupancygroupId}/associatedzone` | not probed | 400 BadRequest |
| `/occupancygroup/{occupancygroupId}/status` | not probed | 400 BadRequest |
| `/presetassignment` | 204 NoContent | 200 OK |
| `/programmingmodel` | 204 NoContent | 200 OK |
| `/project/contactinfo` | 200 OK | 204 NoContent |
| `/project/masterdevicelist/devices` | 200 OK | 204 NoContent |
| `/system/action` | 400 BadRequest | 200 OK |
| `/system/away` | 204 NoContent | 200 OK |
| `/system/loadshedding/status` | 200 OK | 405 MethodNotAllowed |
| `/system/naturallightoptimization` | 204 NoContent | 200 OK |
| `/system/naturallightoptimization/status` | 204 NoContent | 200 OK |
| `/timeclock/status` | 200 OK | 204 NoContent |
| `/timeclockevent` | 200 OK | 204 NoContent |
| `/virtualbutton` | 204 NoContent | 200 OK |
| `/zone` | 405 MethodNotAllowed | 200 OK |
| `/zone/{zoneId}/countdowntimer` | 404 NotFound | 200 OK |
| `/zone/{zoneId}/phasesettings` | 404 NotFound | 200 OK |
| `/zone/{zoneId}/tuningsettings` | 404 NotFound | 200 OK |

Two rows are worth calling out beyond the device-configuration and
navigation-model differences already covered above:

- **`/link/{linkId}`: RA3 `200 OK`, Caseta `404 NotFound`.** A direct
  `ReadRequest` to a link by id works on RA3 but not on Caseta, even though
  both platforms expose the link list (`/link`) itself.
- **`/system/loadshedding/status`: RA3 `200 OK`, Caseta
  `405 MethodNotAllowed`.** Load shedding status is an RA3-only feature over
  LEAP — the reverse of most of the divergence in this table, where RA3 is
  the more restrictive platform.

This table is regenerated by re-running the command above whenever the
fixtures change; it should never be hand-edited to add or remove a row.

It is built from the **original campaign's** two corpora only, and stays that
way deliberately: those are the two fully configured systems this project has
probed, and mixing in the nearly-empty second bridge would turn "Caseta does
not serve this" rows into "this bridge has none of those configured" rows
without saying so. The coverage-blind corpora are compared separately, on
refusals rather than on `404`s, under "The two-platform refusal test" above.
