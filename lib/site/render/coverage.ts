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

<h2>What the firmware route table has and this does not</h2>
<p>The extraction recovered ${firmwareRoutes} route templates.
${summary.uncovered + summary["uncovered-path-in-doubt"]} of them are not
documented here. ${summary["represented-xid-twin"]} more are
<code>{xid}</code> forms whose <code>{id}</code> twin is covered, and
${summary["represented-corrected"]} are concatenated spellings whose corrected,
slashed form is covered — <code>/devicestatus</code> is documented as
<code>/device/status</code>, on captured evidence. Those two groups are
represented rather than missing.</p>

<details class="links"><summary>Not documented, path taken at face value · ${summary.uncovered}</summary>
<p class="meta">The route table records these and nothing here verifies them.
No shape, status or platform is asserted for any of them.</p>
<ul class="nofixture">${absent
    .filter((r) => r.absence === "uncovered")
    .map(
      (r) =>
        `<li><code>${esc(r.path)}</code> <span class="evidence">${esc(r.verbs.join(" "))}</span></li>`,
    )
    .join("")}</ul>
</details>

<details class="links"><summary>Not documented, and the path itself is in doubt · ${summary["uncovered-path-in-doubt"]}</summary>
<p class="meta">Each of these begins with another resource's name, so it may be
a concatenation the extraction mangled rather than a path in its own right.
That defect is real and proven: <code>/devicestatus</code>,
<code>/occupancygroupstatus</code>, <code>/systemaway</code> and two others
were confirmed by captures to be the slashed form. Nothing distinguishes the
ones below without asking hardware, so both readings are shown and neither is
asserted.</p>
<ul class="nofixture">${absent
    .filter((r) => r.absence === "uncovered-path-in-doubt")
    .map(
      (r) =>
        `<li><code>${esc(r.path)}</code> <span class="unresolved">or <code>${esc(r.slashedReading ?? "")}</code></span></li>`,
    )
    .join("")}</ul>
</details>

<h2>Why the untouched routes stay untouched</h2>
<p>Hand-refining a path family or schema is evidence-checked work — cross-referencing
captures, correcting mislabels, trimming <code>required</code> to what was actually
observed. A straight unverified copy of the ${summary.uncovered + summary["uncovered-path-in-doubt"]}
routes above would carry exactly the false confidence this reference works to
avoid everywhere else — and for ${summary["uncovered-path-in-doubt"]} of them it
would have to guess the path itself before it could even begin.</p>

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
