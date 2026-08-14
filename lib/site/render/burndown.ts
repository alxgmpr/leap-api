/**
 * The coverage burndown: one chart that is a burndown, and four that are not.
 *
 * Only routes-not-covered is measured against a fixed denominator -- the route
 * templates the firmware extraction recovered, a number that does not move --
 * so it can only fall as work lands. The other four counts are properties of
 * what is *already* covered: an operation with no capture, an unresolved enum,
 * an imported path nobody has verified. Covering a new route adds to them.
 * Stacked into one total they would draw a line that climbs while the project
 * improves, which is the opposite of what a reader should take away, so they
 * are drawn beside each other instead of on top of each other.
 *
 * Only ever embedded in the coverage page (Task 6), one level under its own
 * h1 -- headings here start at h2 to match.
 */
import { stackedArea } from "../chart.ts";
import type { LeapModel } from "../model.ts";
import { esc } from "./html.ts";

type Metrics = LeapModel["history"][number]["metrics"];

const OPEN: { label: string; of: (m: Metrics) => number; note: string }[] = [
  {
    label: "Imported, unverified",
    of: (m) => m.unverifiedPaths,
    note: "paths taken from the route table as-is",
  },
  {
    label: "No 200 capture",
    of: (m) => m.noFixture,
    note: "covered, never answered 200",
  },
  {
    label: "TODO(response)",
    of: (m) => m.todoResponses,
    note: "response shape not established",
  },
  {
    label: "TODO(enum)",
    of: (m) => m.todoEnums,
    note: "members never recovered",
  },
];

function day(date: string): string {
  return date.slice(0, 10);
}

export function renderBurndown(model: LeapModel): string {
  const history = model.history;
  // No history file, or a single commit: nothing to plot. The section still
  // renders its numbers, so a fresh clone builds without running the backfill.
  if (history.length < 2) return "";

  const first = history[0] as (typeof history)[number];
  const last = history[history.length - 1] as (typeof history)[number];
  const points = history.map((point) => ({
    t: Date.parse(point.date),
    metrics: point.metrics,
  }));

  const routes = stackedArea({
    points: points.map((point) => ({
      t: point.t,
      values: [point.metrics.uncoveredRoutes],
    })),
    series: [{ key: "uncovered", label: "Not covered", color: "var(--live)" }],
    caption: `Firmware routes with no hand-refined path: ${first.metrics.uncoveredRoutes} → ${last.metrics.uncoveredRoutes} of ${last.metrics.firmwareRoutes}`,
  });

  const open = OPEN.map((series) => {
    const chart = stackedArea({
      points: points.map((point) => ({
        t: point.t,
        values: [series.of(point.metrics)],
      })),
      series: [
        { key: series.label, label: series.label, color: "var(--mute)" },
      ],
      compact: true,
      caption: `${series.label} — ${series.note}`,
    });
    return `<div class="multiple"><h3>${esc(series.label)} <span class="count">${series.of(last.metrics)}</span></h3>${chart}</div>`;
  }).join("\n");

  return `<h2>Where this stands, and how it got here</h2>
<p>Measured at each of the ${history.length} commits that touched
<code>spec/</code>, <code>vendor/</code> or <code>fixtures/</code>, from
${day(first.date)} to ${day(last.date)}. Every point is that commit's own
bundle read by today's rules — the definitions of "covered" changed repeatedly
over that stretch, and a burndown whose metric moves underneath it measures
nothing. Commits older than the current bundler cannot be rebuilt and are not
plotted.</p>

${routes}

<p>That is the burndown proper. The ${last.metrics.firmwareRoutes} route
templates the extraction recovered are a fixed denominator, so the line falls
only when routes get written up. An imported, unverified path does not count as
covered here — importing 163 of them is the step up near the right-hand end of
the first small multiple below, and it moved this line not at all.</p>

<h3 class="multiples-title">Open questions against what is already covered</h3>
<p class="meta">Not a backlog being burned down. Each of these counts something
the covered surface raises, so covering more routes adds to them — a path with
no 200 capture, an unresolved enum or an unverified import only exists to be
counted once the path itself is documented. Same commit axis as the burndown
above; each has its own scale.</p>
<div class="multiples">${open}</div>`;
}
