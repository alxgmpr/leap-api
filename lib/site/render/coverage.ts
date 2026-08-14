import type { LeapModel } from "../model.ts";
import { groupNoFixture } from "../no-fixture.ts";
import { classifyRoutes, readRoutes, summarize } from "../uncovered.ts";
import { esc } from "./html.ts";
import type { Section } from "./layout.ts";

export function renderCoverageSection(model: LeapModel): Section {
  const { coverage } = model;
  const operations = model.resources.reduce(
    (n, r) => n + r.operations.length,
    0,
  );

  const bundledPaths = new Set(
    model.resources.flatMap((r) => r.operations.map((o) => o.url)),
  );
  const absent = classifyRoutes({ bundledPaths });
  const summary = summarize(absent);
  // Not bundledPaths.size: 29 bundled paths have no firmware route behind
  // them, so adding the two counts overstates what the extraction recovered.
  const firmwareRoutes = readRoutes().length;

  const main = `<h2 class="part">Coverage</h2>
<p class="lede">A route absent from this reference may not exist, or may just
not be written up. These numbers tell the two apart.</p>

<dl class="coverage">
<dt>Covered</dt>
<dd>${operations} operations across ${model.resources.length} resources, and ${model.schemas.length} schemas.</dd>

<dt>Firmware routes not covered</dt>
<dd>228 of the 410 route templates the firmware extraction recovered are absent
from this reference. 4 of those are <code>{xid}</code> twins whose
<code>{id}</code> form is covered — the two forms address the same resource and
cannot be stated separately, so they are represented rather than missing —
leaving 224 not covered.</dd>

<dt>Probed but missing from this reference</dt>
<dd>${coverage.probedNotInSpec.length}${coverage.probedNotInSpec.length === 0 ? " — every path a corpus answered 200 on is documented." : ""}</dd>

<dt>Covered with no 200 capture</dt>
<dd>${coverage.specWithoutFixture.length}, each classified by reason below —
structural (a GET can never answer 200) or conditional (nothing of that kind is
configured on the probed home). Mostly "asked and not answered 200" rather than
"hardware refused it"; each operation's own section shows what every corpus
answered.</dd>

<dt>Unresolved enums</dt>
<dd>${coverage.todoEnums} <code>TODO(enum)</code> markers: a type whose members
the firmware extraction never recovered.</dd>

<dt>Unresolved response types</dt>
<dd>${coverage.todoResponses} <code>TODO(response)</code> markers: an operation
whose response shape is not established.</dd>
</dl>

<h3>What the firmware route table has, and in what state</h3>
<p>The extraction recovered ${firmwareRoutes} route templates. Every one of
them is now represented here except ${summary["uncovered-path-in-doubt"]},
whose paths cannot be written down without guessing — but
${coverage.unverifiedPaths} of the represented paths are imported without
verification.</p>

<dl class="coverage">
<dt>Hand-refined</dt>
<dd>Checked against captured traffic: shapes corrected, <code>required</code>
trimmed to what was observed, mislabels fixed. Everything outside the two
groups below.</dd>

<dt>Imported, unverified — ${coverage.unverifiedPaths} paths, ${coverage.unverifiedSchemas} schemas</dt>
<dd>Taken from the firmware route table as-is. No capture has exercised them,
no platform availability is known, and their shapes are the generator's staging
output. They carry <code>x-leap-verified: false</code> and are marked
<em>unverified</em> wherever they appear. Where such a route is a single-segment
collection read, no response schema is asserted at all: the extraction labels
that shape with the singular struct name while the wire sends a plural wrapper,
a defect confirmed elsewhere in this document, and the wrapper's real key has
only ever come from captures.</dd>

<dt>Not represented — ${summary["uncovered-path-in-doubt"]} paths</dt>
<dd>Each begins with another resource's name, so it may be a concatenation the
extraction mangled rather than a path in its own right. That defect is real and
proven: <code>/devicestatus</code>, <code>/occupancygroupstatus</code>,
<code>/systemaway</code> and three others were confirmed to be the slashed form.
Nothing separates these from genuine resources without asking hardware, and
importing one would mean guessing the path before guessing the shape.</dd>
</dl>

<details class="links"><summary>The paths in doubt · ${summary["uncovered-path-in-doubt"]}</summary>
<p class="meta">Both readings shown. Neither is asserted.</p>
<ul class="nofixture">${absent
    .filter((r) => r.absence === "uncovered-path-in-doubt")
    .map(
      (r) =>
        `<li><code>${esc(r.path)}</code> <span class="unresolved">or <code>${esc(r.slashedReading ?? "")}</code></span></li>`,
    )
    .join("")}</ul>
</details>

<h3>Why the imported tier stays labelled</h3>
<p>Hand-refining a path family or schema means cross-referencing captures,
correcting mislabels, and trimming <code>required</code> to what was observed.
The imported tier has had none of that done to it, so it is labelled on every
page it appears on.</p>

<h3>Paths with no 200 capture</h3>
<p>Every one of the ${coverage.specWithoutFixture.length} falls into one reason
below. The <strong>structural</strong> reasons can never answer a GET 200 by
route design — a write verb, a paging projection, a push route, a setup
listener — so no capture will ever move them off this list. The
<strong>conditional</strong> reasons are real GET-able resources that answered
non-200 only because nothing of that kind is configured on the processors
probed; a home that had one would capture a 200.</p>
${groupNoFixture(coverage.specWithoutFixture)
  .map(
    ({
      reason,
      paths,
    }) => `<h4>${esc(reason.label)} · ${paths.length} <span class="meta">(${reason.kind})</span></h4>
<p class="meta">${esc(reason.blurb)}</p>
<ul class="nofixture">${paths
      .map((path) => `<li><code>${esc(path)}</code></li>`)
      .join("")}</ul>`,
  )
  .join("\n")}`;

  return { id: "coverage", html: main };
}
