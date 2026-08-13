import type { LeapModel } from "../model.ts";
import { classifyRoutes, readRoutes, summarize } from "../uncovered.ts";
import { siteNav } from "./home.ts";
import { esc } from "./html.ts";
import { type Page, page } from "./layout.ts";

export function renderCoveragePage(model: LeapModel): Page[] {
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

  const main = `<h1>What this covers, and what it does not</h1>
<p class="lede">A reader who looks up a route and finds nothing here cannot tell
"this route does not exist" from "this route is not written up" without these
numbers.</p>

<dl class="coverage">
<dt>Covered</dt>
<dd>${operations} operations across ${model.resources.length} resources, and ${model.schemas.length} schemas.</dd>

<dt>Firmware routes not covered</dt>
<dd>228 of the 410 route templates the firmware extraction recovered are absent
from this reference. 4 of those are <code>{xid}</code> twins whose
<code>{id}</code> form is covered — the two forms address the same resource and
cannot be stated separately, so they are represented rather than missing —
leaving 224 genuinely not covered.</dd>

<dt>Probed but missing from this reference</dt>
<dd>${coverage.probedNotInSpec.length}${coverage.probedNotInSpec.length === 0 ? " — every path a corpus answered 200 on is documented." : ""}</dd>

<dt>Covered with no 200 capture</dt>
<dd>${coverage.specWithoutFixture.length}. Mostly "asked and not answered 200",
not "hardware refused it" — the two should not be conflated. Each operation's
own page shows what every corpus actually answered.</dd>

<dt>Unresolved enums</dt>
<dd>${coverage.todoEnums} <code>TODO(enum)</code> markers: a type whose members
the firmware extraction never recovered.</dd>

<dt>Unresolved response types</dt>
<dd>${coverage.todoResponses} <code>TODO(response)</code> markers: an operation
whose response shape is not established.</dd>
</dl>

<h2>What the firmware route table has, and in what state</h2>
<p>The extraction recovered ${firmwareRoutes} route templates. Every one of
them is now represented here except ${summary["uncovered-path-in-doubt"]},
whose paths cannot be written down without guessing. But representation is not
verification, and ${coverage.unverifiedPaths} of these paths are imported
without it.</p>

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

<h2>Why the imported tier stays labelled</h2>
<p>Hand-refining a path family or schema is evidence-checked work — cross-referencing
captures, correcting mislabels, trimming <code>required</code> to what was actually
observed. The imported tier has had none of that done to it, which is why it is
labelled on every page it appears on rather than quietly mixed in. Reading an
unverified entry as though it were checked is the one mistake this document is
built to prevent.</p>

<h2>Paths with no 200 capture</h2>
<ul class="nofixture">${coverage.specWithoutFixture
    .map((path) => `<li><code>${esc(path)}</code></li>`)
    .join("")}</ul>`;

  return [
    {
      path: "coverage/index.html",
      html: page({
        title: "Coverage",
        relativeRoot: "../",
        nav: siteNav(model),
        main,
      }),
    },
  ];
}
