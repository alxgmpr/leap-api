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

## A second RA3 corpus

Task 8's probe campaign reached a configured RA3 processor at a host masked
throughout this project's public fixtures and this document; every sweep
capture in this project (`fixtures/sweep-read.json`,
`fixtures/sweep-write.json`, `fixtures/subscriptions.json`,
`fixtures/late-frames.json`) comes from it. It is confirmed a genuine RA3
processor by its own `GET /clientsetting` response
(`ClientMajorVersion: 3`, `ClientMinorVersion: 249`, on an `Admin` session
— see `fixtures/sweep-read.json`).

**This document describes corpora, not processor counts.** What the committed
fixtures establish is that the later coverage-blind probe read a *different
firmware build* from the original RA3 capture — `03.249` on
`fixtures/spec-read.json`'s `/server` against `03.247` on
`fixtures/ra3.json`'s, five months apart — while reporting the *same
project, edited in between*.

Same project: `/project` is byte-identical in the two corpora apart from its
`ProjectModifiedTimestamp` (2026-03-06 against 2026-08-10), so the same
`MasterDeviceList` (`/device/435`) and the same `Contacts`
(`/contactinfo/102`). `/area/912` carries the same `XID` in
`fixtures/ra3.json`, `fixtures/sweep-read.json` and `fixtures/spec-read.json`
— the same area object in all three.

Edited in between: that same `/area/912` grows from 2 `AssociatedZones` to 5
and from 3 `AssociatedControlStations` to 6 between the original capture and
the two later ones, and its `Name` redacts to a different placeholder, so it
was renamed. The later corpora are **not** a subset of the earlier one:
`fixtures/sweep-read.json` references 10 zone ids and 1 device id that
appear nowhere in `fixtures/ra3.json`. All 16 zone, device and area objects
the sweep returned *in full*, at their own URL, are present in the original
capture; the 11 additions appear only as references from bodies that grew.

Whether that is a second physical processor or the original one at a later
firmware build is **not determined by anything this repository publishes** —
five months of programming changes is equally consistent with either — and
nothing in this document depends on the answer: the finding below is about
what a live processor refuses, not about how many processors were asked.

Of the 206 routes this campaign probed — the firmware's own
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
handler that exists in the binary but declines to serve. This is a
finding about how firmware-extracted route tables and live processor
behavior diverge, not a failure of the probe methodology — see
`docs/mapping.md` for how this specification's own paths are derived from
that same route table, and why probe confirmation (not extraction
presence alone) is what this project treats as evidence a route is
actually live. The conclusion in this section was drawn from one RA3
corpus, so "this processor is configured differently" remained a live
alternative explanation for it; the next section closes that off with a
second platform.

## The coverage-blind probe

The sweep above deliberately skipped every route this specification already
documents, so it could only ever answer "what is out there that we have not
written up". It could not answer the obvious follow-up: **are the routes it
found refused because the firmware never implements them, or because that
one processor does not?**

A later, *coverage-blind* probe was built to answer exactly that. It ignores
what the sweep had already covered and replays the specification's **own**
path list — every URL this document declares — against a live unit,
recording status and body for each. It has now been run three times:

| Corpus | Target | URLs | Statuses |
|---|---|---|---|
| `fixtures/spec-read.json` | RA3 v03.249 (`/server` `ProtocolVersion`). Same project as the sweep corpora: of the 206 URLs `fixtures/sweep-read.json` probed, 47 were probed by this corpus too, and **all 47 return byte-identical bodies** — 45 as `200 OK`, 2 as matching `404 NotFound`s. Same `/clientsetting` version pair too, `3` / `249` | 864 | 226 × `200`, 61 × `204`, 192 × `400`, 366 × `404`, 11 × `405`, 8 × `500` |
| `fixtures/spec-read-caseta.json` | Caseta v01.123 (`L-BDG2-WH`), a bridge re-paired after a factory reset | 848 | 104 × `200`, 195 × `204`, 191 × `400`, 317 × `404`, 38 × `405`, 3 × `500` |
| `fixtures/spec-read-caseta-bare.json` | Caseta v01.124 — the **same bridge** (`/networkinterface/1` `IPv4Properties.IP` is `<ipv4-6>` in both), factory-reset again and left with **zero devices provisioned** | 848 | 78 × `200`, 196 × `204`, 191 × `400`, 344 × `404`, 37 × `405`, 2 × `500` |

All three are `{path: {status, body}}` probe sets in `captures.json`, so the
conformance suite validates their bodies against this specification's schemas
like any other corpus. `ServiceType.yaml`, `ServerType.yaml`,
`Organization.yaml` and `LoadController.yaml` all cite one of the first two as
the evidence for a firmware-derived assertion that hardware falsified. The
third falsified nothing — all 78 of its `200` bodies validated on import —
which is what a strict subset of already-validated routes should do.

The two-platform comparison below uses the first two, not the bare corpus:
the point of that comparison is what two *different* firmwares refuse, and
the bare corpus is the same bridge as the second. What the bare corpus is for
is a different question — separating "nothing configured" from "not
implemented" — and it has its own section further down.

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
to serve. The section above concluded from a single RA3 corpus that presence
in the firmware-extracted route table does not imply a live implementation;
that was a claim about one device, and a per-installation configuration
difference was a live alternative explanation for it. It no longer is. Two
devices, two product lines, two firmware builds, two households, and the same
56 routes refused by both: the refusals track the route rather than the
installation.

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

**Caseta emits no `XID` on any object, on any route.** Across every probe
corpus in `captures.json`, no Caseta-sourced body carries the key at all,
while RA3 returns it on areas, zones, control stations and load controllers:

```
$ for f in fixtures/*.json; do
    printf '%-34s %s\n' "$f" "$(grep -o '"XID"' "$f" | wc -l | tr -d ' ')"
  done
fixtures/caseta.json               0
fixtures/late-frames.json          0
fixtures/push-experiments.json     120
fixtures/push-probe.json           60
fixtures/ra3.json                  191
fixtures/spec-read-caseta-bare.json 0
fixtures/spec-read-caseta.json     0
fixtures/spec-read.json            193
fixtures/subscriptions.json        0
fixtures/sweep-read.json           31
fixtures/sweep-write.json          15
```

All three Caseta corpora are `0`, and every RA3-sourced corpus that reads an
XID-bearing object is not. Three RA3-sourced files also read `0`; naming them
keeps them from being mistaken for counterexamples:
`fixtures/subscriptions.json` stores no bodies at all (its entries are `url`,
`requestTag`, `subscribeStatus`, `frames`); `fixtures/late-frames.json`'s five
frames are all `OneFirmwareImageDefinition` reads of `/firmwareimage/{id}`, an
object type that carries no `XID` on either platform; and `ra3-keypad-press`,
inside the mixed file below, receives no body of an XID-bearing type. Read the
`push-experiments.json` line with care — it is the one **mixed** file, three
RA3 runs and three Caseta ones, so its 120 is not a per-platform figure. It
splits 60 in `ra3-push-pad-0`, 60 in `ra3-push-pad-7`, and **0 in the other
four**, including all three Caseta runs. The two RA3 runs that carry XIDs are
the ones that read `/area/{id}/associatedzone` fourteen times each.

The third RA3 run, `ra3-keypad-press`, reads `0` for a different reason —
"it issued no read" is true but is not the cause. It is not
bodiless: it received three subscribe snapshots, two of them substantial — a
46-entry `/zone/status` and a full `Project` — and those bodies were counted
by the `grep` above. They contain no `XID` because **neither object type
carries one on RA3 either**:

```
$ npx tsx -e '...ZoneStatus bodies across ra3.json + spec-read.json...'
/zone/{id}/status bodies: 35 with XID: 0
ra3 /project keys: href,Name,ProductType,MasterDeviceList,Contacts,
                   TimeclockEventRules,ProjectModifiedTimestamp
```

So its `0` is a statement about `ZoneStatus` and `Project`, not about the
platform, and still not a Caseta-like absence. `XID` appears on areas, zones,
control stations and load controllers — the *definition* objects — and not on
the status objects that report their state.

Sizing the Caseta side of that: the original Caseta capture returned 14
zones, 24 devices and 25 areas (`/zone`, `/device`, `/area` collection
lengths), reached across 92 zone-rooted, 144 device-rooted and 50
area-rooted **object occurrences** — the same 14 zones and 24 devices recur
under `/zone/{id}`, `/zone/{id}/status`, `/device/{id}/status`,
`/device/{id}/linknode/{id}` and so on, and sub-resources are counted where
they hang off a zone or device href. None of those occurrences, at either
counting rule, carries an `XID`. The cross-reference
identifier `docs/mapping.md` describes as an alternative addressing key for
several routes appears to be an RA3-family concept. This falsified
`LoadController`'s firmware-derived `required: XID` (see
`LoadController.yaml`); `ControlStation` still requires it, because no Caseta
capture returns a control station at all and so nothing has falsified it.

## The bare-bridge baseline: separating "nothing configured" from "not implemented"

The caveat two sections up — that a `404` from a nearly-empty bridge usually
means "nothing of that kind exists here", not "the platform lacks the
concept" — is the single largest source of over-reading in this document.
`fixtures/spec-read-caseta-bare.json` exists to bound it. It is the **same
bridge** as `fixtures/spec-read-caseta.json`, probed by the same
coverage-blind prober over the same 848-URL path list, after a factory reset
that left it with zero devices provisioned.

**The refusals do not move.** Collapsing both corpora to templates, the set of
templates answering `400 BadRequest` is identical between them, and so is the
set answering `405 MethodNotAllowed` and the set answering
`500 InternalServerError`:

```
node --import tsx -e '
import { readFileSync } from "node:fs";
import { templatePath } from "./lib/platform-matrix.ts";
const load = (f) => JSON.parse(readFileSync(f, "utf8"));
const bare = load("fixtures/spec-read-caseta-bare.json");
const prov = load("fixtures/spec-read-caseta.json");
const code = (s) => s.split(" ")[0];
const tmpl = (o, c) => new Set(Object.keys(o).filter(k => code(o[k].status) === c).map(templatePath));
for (const c of ["400", "405", "500"]) {
  const b = tmpl(bare, c), p = tmpl(prov, c);
  console.log(c, "templates bare", b.size, "prov", p.size,
    "| only bare:", [...b].filter(x => !p.has(x)),
    "| only prov:", [...p].filter(x => !b.has(x)));
}'

400 templates bare 55 prov 55 | only bare: [] | only prov: []
405 templates bare 9 prov 9 | only bare: [] | only prov: []
500 templates bare 2 prov 2 | only bare: [] | only prov: []
```

**Say "templates", not "instances" — the instance counts mislead.**
The `400` counts happen to agree at instance level too (191 in each), but the
`405`s do not (38 provisioned, 37 bare) and neither do the `500`s (3 versus
2). Both differences come from the same place and neither is about method
support: `/area/{areaId}/associateddevice` `405`s and `/area/{areaId}/status`
`500`s once per *existing* area, and the provisioned bridge had two areas
where the bare one has one. Quoting the instance counts as if they were the
refusal sets would turn "the bridge has fewer areas" into "the firmware
changed".

**What does move is `200 → 204` on collections a bare bridge cannot fill.**
Restricting to the 573 URLs both runs actually requested (the prober samples
concrete ids from the live inventory, so 275 of each run's 848 URLs name ids
that only exist in that run):

| Transition | Count | URLs |
|---|---|---|
| `200 → 204` | 10 | `/zone`, `/zone/status`, `/zone/tuningsettings`, `/occupancygroup`, `/occupancygroup/status`, `/area/daylightinggainsettings`, `/area/occupancysensorsettings`, `/area/occupancysettings`, `/area/1/childarea/summary`, `/project/contactinfo` |
| `200 → 404` | 1 | `/occupancygroup/1` |
| `404 → 200` | 1 | `/link/1` |
| unchanged | 561 | |

Every one of the ten is a collection or settings route with nothing left to
list. `/project/contactinfo` is the one that is not device-derived: the
provisioned run returns a one-element `Contacts` array with an `Installer`
role, and the bare run returns `204`, so the reset took the installer record
with it. None of the ten is a route that stopped working.

`/area` is the reason two of the instance counts moved: it returns
`/area/1` and `/area/2` on the provisioned bridge and only `/area/1` on the
bare one, which is the "two areas versus one" behind the `405` and `500`
differences noted above.

**`/link/1` is the one difference running the other way, and it is
confounded.** `GET /link` returns a one-element `Links` array advertising
`/link/1` on both bridges — not the *same* array, since
`RFProperties.DefaultChannel` reads `26` provisioned and `255` bare, while
`Channel` is `26` in both; `GET /link/1` answers `404 NotFound` on the
provisioned run and `200 OK` on the bare one. A collection that lists an href
its own per-item route then denies is a firmware inconsistency worth
recording — but **provisioning and firmware changed together here** (01.123 →
01.124), so this is not evidence of a firmware fix, and it is not evidence of
a provisioning effect either. It is one observation with two candidate causes
and no way to separate them from these two corpora. The same confound applies
to every row of the table above; the `200 → 204` set is *readable* as a
provisioning effect because the routes are exactly the ones a device list
feeds, not because the comparison isolates provisioning.

**A 200 is not proof of provisioning.** A Caseta bridge with zero devices still answers `200 OK`
with real content on a great many routes:

```
node -e '
const p = JSON.parse(require("fs").readFileSync("fixtures/spec-read-caseta-bare.json","utf8"));
const n = (u) => { const b = p[u].body; const k = Object.keys(b)[0];
  return `${u}: ${p[u].status} ${k}=${b[k].length}`; };
["/virtualbutton","/programmingmodel","/facade","/timeclock","/device","/area",
 "/device/1/buttongroup"].forEach(u => console.log(n(u)));
console.log("/zone:", p["/zone"].status);'

/virtualbutton: 200 OK VirtualButtons=100
/programmingmodel: 200 OK ProgrammingModels=108
/facade: 200 OK Facades=8
/timeclock: 200 OK Timeclocks=1
/device: 200 OK Devices=1
/area: 200 OK Areas=1
/device/1/buttongroup: 200 OK ButtonGroups=1
/zone: 204 NoContent
```

100 virtual buttons, 108 programming models, 8 facades, a timeclock, and a
button group on `/device/1` — all present before a single device exists. The
one `Device` is the bridge itself (`DeviceType: SmartBridge`) and the one
`Area` is `/area/1`, the only area in either corpus with no `Parent`; on the
bare bridge it reports `IsLeaf: true`, and on the provisioned one
`IsLeaf: false`, because there it has `/area/2` under it. Anything that infers
"this system is configured" from a `200` on those routes will be wrong on
every bare bridge. `/zone` is the honest signal here: no zones, so `204`.

## The connect-time auto-subscribe is Caseta-only

A Caseta bridge sends two frames the client never asked for, within 18 ms of
the connection opening, on all three connections captured here: untagged
`SubscribeResponse` `204 NoContent` for `/device/status/deviceheard` and for
`/zone/status/deprecated/level`. An RA3 processor sends nothing at all until
it is asked.

The easy mistake with this one is to file it as LEAP firmware behaviour —
"the protocol pushes a couple of subscriptions at you on connect". It is not
that. The committed frame logs separate the two platforms cleanly: **four RA3
connections send zero unprompted frames; three Caseta connections each send
the same two.**

```
node -e '
const d = JSON.parse(require("fs").readFileSync("fixtures/push-experiments.json","utf8"));
d["push-probe"] = JSON.parse(require("fs").readFileSync("fixtures/push-probe.json","utf8"));
for (const [k, r] of Object.entries(d))
  console.log(k.padEnd(24), "host=" + r.host,
    "unprompted frames:", r.frames.filter(f => f.header.ClientTag === undefined).length);'

ra3-push-pad-0           host=<ipv4-2> unprompted frames: 0
ra3-push-pad-7           host=<ipv4-2> unprompted frames: 0
caseta-push-pad-0        host=<ipv4-6> unprompted frames: 4
ra3-keypad-press         host=<ipv4-2> unprompted frames: 0
caseta-device-join       host=<ipv4-6> unprompted frames: 3
caseta-connect-observe   host=<ipv4-6> unprompted frames: 2
push-probe               host=<ipv4-2> unprompted frames: 0
```

`caseta-connect-observe` is the control: 30 s of connection, **zero requests
sent**, and exactly two frames on the whole socket — the auto-subscribe pair,
at 8 ms and 11 ms. `caseta-device-join` is the same experiment held for
900 s, and its third and only other frame is a push on one of those two
subscribed routes. The Caseta counts above are 4 and 3 rather than 2 because
those runs also received untagged *pushes* later; the connect-time pair is 2
in all three.

**Scope.** Three Caseta connections and four RA3 ones, one bridge and one
processor. This says the two platforms differ, and it does not say every
Caseta firmware does it or that no RA3 firmware ever will. It also does not
say a client may subscribe to those two routes itself — nothing in this
project has ever tried. See `docs/subscriptions.md` for the consequence a
client actually has to handle, which is that pushes arriving on those routes
carry no `ClientTag`.

## `fixtures/sweep-write.json` is write traffic, and the format does not say so

Every probe set in `captures.json` is `{url: {status, body}}`. There is no
verb field. `fixtures/sweep-write.json` is the write phase of the sweep
campaign described above, and the only one of the seven that is not a read
probe: `tools/bundle.ts` records `ra3` and `caseta` as ReadRequest-only,
`tools/redact.ts` describes the coverage-blind captures as a read-only
replay, and `sweep-read` is the read phase of the same two-phase sweep that
produced this file. Nothing inside the file records that. Its 30 entries
are identical in shape to the 206 read entries of
`fixtures/sweep-read.json`; the file name is the only marker.

**A status taken from that corpus is a status for a write.** `/device/435`
answers `405 MethodNotAllowed` there and `200 OK` to a read in
`fixtures/spec-read.json`. `/clientsetting` answers `400 BadRequest` there,
body `{"Message": "ClientMinorVersion is not modifiable"}`, and `200 OK` to
a read in both `fixtures/sweep-read.json` and `fixtures/spec-read.json`.
**And any premise of the form "every probe in this project sends only reads"
is false**: this corpus is one counterexample, and `fixtures/push-probe.json`
and `fixtures/push-experiments.json` are the others — between them eight
`CreateRequest`s to a `/zone/{id}/commandprocessor`, on both platforms.
`spec/paths/server.yaml` states the narrow version of that premise which does
hold, and shows why narrowing it to the seven `captures.json` corpora would
not repair it: `sweep-write` is one of the seven.

The write traffic is invisible to a body-level comparison because where
these writes succeeded they returned the same body a read of that URL
returns. Of the 30 entries, 22 are `200 OK`, 7 are `400 BadRequest` and 1 is
`405 MethodNotAllowed`. All 30 URLs also appear in a read corpus (16 in
`fixtures/sweep-read.json`, 27 in `fixtures/spec-read.json`), and the 22
successes are byte-identical to every read corpus that holds the same URL.
The 8 bodies that differ are exactly the 7 `400`s and the 1 `405` — server
refusal messages, not objects.

What that means for the tools that read `captures.json`:

- `test/conformance.test.ts` validates `200` bodies only, so it checks this
  corpus's 22 successes against the same response schemas as any read
  corpus. That is sound here precisely because those 22 bodies are
  byte-identical to reads; it is not a general licence to treat the corpus
  as read data.
- `tools/check-coverage.ts` marks a path probed on any `200`, so a
  successful *write* counts toward coverage. Nothing currently rests on
  that: the 22 successes collapse to three templates — `/area/{areaId}`,
  `/button/{buttonId}` and `/controlstation/{controlstationId}` — and all
  three are reached at `200` by a read corpus as well.
- The divergence table below and `x-leap-platforms` are unaffected:
  `tools/bundle.ts` builds its matrix from `fixtures/ra3.json` and
  `fixtures/caseta.json` only.

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
this project's probing: RA3's firmware does not serve these values
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

Two rows stand out beyond the device-configuration and
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
