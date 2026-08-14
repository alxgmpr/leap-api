/**
 * Area charts, rendered as inline SVG with no client script.
 *
 * Colours arrive as strings from the caller and are written straight into the
 * markup, so production passes CSS custom properties (`var(--live)`) and gets
 * both themes from one document, while tests pass literal hex.
 *
 * There is no categorical palette here on purpose. This site spends colour on
 * one thing -- amber means hardware answered -- so a chart that needed four
 * hues to say which band is which would have to break that rule. Anything with
 * more than one measure is drawn as small multiples instead, where a heading
 * carries identity and colour stays free to keep meaning what it means.
 */
import { esc } from "./render/html.ts";

export type ChartSeries = { key: string; label: string; color: string };

/** One measurement: a time, and one value per series in stacking order. */
export type ChartPoint = { t: number; values: number[] };

export type PlotRect = {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
};

/** The full-width plot. The right margin holds band labels. */
export const PLOT: PlotRect = {
  width: 900,
  height: 300,
  left: 48,
  right: 726,
  top: 16,
  bottom: 258,
};

/** One cell of a small-multiples row: no band labels, no date axis. */
export const PLOT_COMPACT: PlotRect = {
  width: 420,
  height: 150,
  left: 40,
  right: 410,
  top: 12,
  bottom: 122,
};

/** Smallest readable axis top at or above `value`: 1, 2, 2.5 or 5 times a power of ten. */
export function niceCeiling(value: number): number {
  if (value <= 0) return 10;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (value <= step * magnitude) return step * magnitude;
  }
  return 10 * magnitude;
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

/** Running totals per point, so band `i` spans totals[i]..totals[i+1]. */
function stacks(points: ChartPoint[], count: number): number[][] {
  return points.map((point) => {
    const totals = [0];
    for (let i = 0; i < count; i += 1)
      totals.push((totals[i] as number) + (point.values[i] ?? 0));
    return totals;
  });
}

function scales(points: ChartPoint[], count: number, rect: PlotRect) {
  const totals = stacks(points, count);
  const max = niceCeiling(
    Math.max(...totals.map((row) => row[row.length - 1] as number)),
  );
  // x is the commit sequence, not wall-clock. The project's route coverage was
  // established in a single day of many commits and has moved slowly since; on
  // a time axis that day is a vertical cliff two pixels wide, and the shape of
  // the actual work is invisible. Commits are the unit the work happens in.
  const span = points.length - 1 || 1;
  return {
    totals,
    max,
    x: (index: number) =>
      round(rect.left + (index / span) * (rect.right - rect.left)),
    y: (value: number) =>
      round(rect.bottom - (value / max) * (rect.bottom - rect.top)),
  };
}

/**
 * One filled band per series, bottom of the stack first. Each is a closed ring:
 * out along its own top edge, back along the top edge of the band beneath it.
 */
export function areaPaths(input: {
  points: ChartPoint[];
  series: ChartSeries[];
  rect?: PlotRect;
}): { key: string; color: string; d: string; edge: string }[] {
  const { points, series, rect = PLOT } = input;
  const { totals, x, y } = scales(points, series.length, rect);

  return series.map((entry, index) => {
    const top = points.map(
      (_point, i) =>
        `${x(i)} ${y((totals[i] as number[])[index + 1] as number)}`,
    );
    const floor = points
      .map(
        (_point, i) => `${x(i)} ${y((totals[i] as number[])[index] as number)}`,
      )
      .reverse();
    return {
      key: entry.key,
      color: entry.color,
      d: `M ${top.join(" L ")} L ${floor.join(" L ")} Z`,
      edge: top.join(" "),
    };
  });
}

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

/** UTC so a reader's timezone cannot shift a label onto the wrong day. */
function dayLabel(t: number): string {
  const date = new Date(t);
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

/**
 * Band labels down the right margin, nudged apart where bands are too thin to
 * hold them at their own mid-height.
 */
function bandLabels(
  series: ChartSeries[],
  totals: number[][],
  y: (value: number) => number,
): { label: string; y: number }[] {
  const last = totals[totals.length - 1] as number[];
  const placed = series.map((entry, index) => ({
    label: entry.label,
    y: (y(last[index] as number) + y(last[index + 1] as number)) / 2,
  }));

  const MIN_GAP = 14;
  for (let i = placed.length - 2; i >= 0; i -= 1) {
    const below = placed[i + 1] as { y: number };
    const here = placed[i] as { y: number };
    if (below.y - here.y < MIN_GAP) here.y = below.y - MIN_GAP;
  }
  return placed.map((entry) => ({ ...entry, y: round(entry.y) }));
}

export function stackedArea(input: {
  points: ChartPoint[];
  series: ChartSeries[];
  caption?: string;
  compact?: boolean;
}): string {
  const { points, series, caption, compact = false } = input;
  // One measurement is a number, not a trend; drawing it as a chart overstates it.
  if (points.length < 2) return "";

  const rect = compact ? PLOT_COMPACT : PLOT;
  // No `x` here: the date labels anchor to the plot edges, not to a position
  // computed from a timestamp, now that the axis counts commits.
  const { totals, max, y } = scales(points, series.length, rect);
  const paths = areaPaths({ points, series, rect });

  const gridlines = (compact ? [0, 1] : [0, 0.25, 0.5, 0.75, 1]).map(
    (fraction) => {
      const value = max * fraction;
      return `<line class="grid" x1="${rect.left}" y1="${y(value)}" x2="${rect.right}" y2="${y(value)}"/>
<text class="axis" x="${rect.left - 8}" y="${y(value) + 4}" text-anchor="end">${value}</text>`;
    },
  );

  const first = points[0] as ChartPoint;
  const last = points[points.length - 1] as ChartPoint;
  const dates = compact
    ? []
    : [first, last].map(
        (point, index) =>
          `<text class="axis" x="${index === 0 ? rect.left : rect.right}" y="${rect.bottom + 18}" text-anchor="${index === 0 ? "start" : "end"}">${dayLabel(point.t)}</text>`,
      );

  const bands = paths
    .map(
      (path) =>
        `<path d="${path.d}" fill="${path.color}" fill-opacity="0.18"/>
<polyline points="${path.edge}" fill="none" stroke="${path.color}" stroke-width="2" stroke-linejoin="round"/>`,
    )
    .join("\n");

  // The right margin exists only on the full plot; a compact cell is named by
  // its own heading instead.
  const labels = compact
    ? ""
    : bandLabels(series, totals, y)
        .map(
          (entry) =>
            `<text class="band" x="${rect.right + 10}" y="${entry.y + 4}">${esc(entry.label)}</text>`,
        )
        .join("\n");

  // One series is named by its own band label and the prose around it; a legend
  // box of one entry is furniture.
  const legend = (series.length > 1 ? series : [])
    .map(
      (entry) =>
        `<span class="legend-key"><i style="background:${entry.color}"></i>${esc(entry.label)}</span>`,
    )
    .join("");

  return `<figure class="chart${compact ? " compact" : ""}">
<svg viewBox="0 0 ${rect.width} ${rect.height}" role="img" aria-label="${esc(caption ?? "Coverage over time")}">
${gridlines.join("\n")}
${bands}
${labels}
${dates.join("\n")}
</svg>
${legend ? `<div class="legend">${legend}</div>` : ""}
${caption ? `<figcaption>${esc(caption)}</figcaption>` : ""}
</figure>`;
}
