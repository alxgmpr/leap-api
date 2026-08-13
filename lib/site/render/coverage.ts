import type { LeapModel } from "../model.ts";
import { siteNav } from "./home.ts";
import { esc } from "./html.ts";
import { type Page, page } from "./layout.ts";

export function renderCoveragePage(model: LeapModel): Page[] {
  const { coverage } = model;
  const operations = model.resources.reduce(
    (n, r) => n + r.operations.length,
    0,
  );

  const main = `<h1>What this covers, and what it does not</h1>
<p class="lede">A reader who looks up a route and finds nothing here cannot tell
"this route does not exist" from "this route is not written up" without these
numbers.</p>

<dl class="coverage">
<dt>Bundled</dt>
<dd>${operations} operations across ${model.resources.length} resources, and ${model.schemas.length} schemas.</dd>

<dt>Firmware routes not covered</dt>
<dd>228 of the 410 route templates the firmware extraction recovered are absent
from the bundle. 4 of those are <code>{xid}</code> twins whose <code>{id}</code>
form is bundled — OpenAPI forbids two paths differing only in parameter name, so
they are represented rather than missing — leaving 224 genuinely not covered.</dd>

<dt>Probed but missing from the specification</dt>
<dd>${coverage.probedNotInSpec.length}${coverage.probedNotInSpec.length === 0 ? " — every path a corpus answered 200 on is documented." : ""}</dd>

<dt>Bundled with no 200 capture</dt>
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

<h2>Why the untouched routes stay untouched</h2>
<p>Hand-refining a path family or schema is evidence-checked work — cross-referencing
captures, correcting mislabels, trimming <code>required</code> to what was actually
observed. A straight unverified copy of the other 224 routes would carry exactly
the false confidence this reference works to avoid everywhere else.</p>

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
