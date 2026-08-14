import assert from "node:assert/strict";
import test, { describe } from "node:test";
import {
  areaPaths,
  type ChartSeries,
  niceCeiling,
  PLOT,
  stackedArea,
} from "../lib/site/chart.ts";

const SERIES: ChartSeries[] = [
  { key: "a", label: "Series A", color: "#2a78d6" },
  { key: "b", label: "Series B", color: "#eb6834" },
];

/** Every y in a path's `d`, in draw order -- the second of each coordinate pair. */
function ys(d: string): number[] {
  return [...d.matchAll(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)].map(
    (match) => Number(match[2]),
  );
}

describe("burndown chart", () => {
  describe("axis ceiling", () => {
    test("rounds up to a readable step", () => {
      assert.equal(niceCeiling(214), 250);
      assert.equal(niceCeiling(410), 500);
      assert.equal(niceCeiling(96), 100);
      assert.equal(niceCeiling(12), 20);
    });

    test("never rounds a value down out of the plot", () => {
      for (const value of [1, 7, 51, 199, 201, 999])
        assert.ok(niceCeiling(value) >= value, `${value}`);
    });

    test("an all-zero history still has a positive scale", () => {
      assert.ok(niceCeiling(0) > 0);
    });
  });

  describe("stacking", () => {
    const points = [
      { t: 0, values: [10, 10] },
      { t: 1, values: [10, 10] },
    ];

    test("the bottom band sits on the baseline", () => {
      const [bottom] = areaPaths({ points, series: SERIES });
      assert.ok((bottom as { d: string }).d.includes(String(PLOT.bottom)));
    });

    test("the second band's floor is the first band's ceiling", () => {
      const [bottom, top] = areaPaths({ points, series: SERIES });
      const bottomTop = Math.min(...ys((bottom as { d: string }).d));
      // The upper band is drawn as a ring: its own top edge, then back along
      // the band below it. That return edge must be the lower band's top.
      assert.ok(
        ys((top as { d: string }).d).includes(bottomTop),
        "upper band does not close on the lower band's top edge",
      );
    });

    test("a taller total compresses the same value further down", () => {
      const small = areaPaths({
        points: [
          { t: 0, values: [10, 0] },
          { t: 1, values: [10, 0] },
        ],
        series: SERIES,
      });
      const large = areaPaths({
        points: [
          { t: 0, values: [10, 500] },
          { t: 1, values: [10, 500] },
        ],
        series: SERIES,
      });
      const smallTop = Math.min(...ys((small[0] as { d: string }).d));
      const largeTop = Math.min(...ys((large[0] as { d: string }).d));
      assert.ok(
        largeTop > smallTop,
        "the same 10 units should be thinner when the axis is taller",
      );
    });

    test("one path per series, in stacking order", () => {
      const paths = areaPaths({ points, series: SERIES });
      assert.deepEqual(
        paths.map((p) => p.key),
        ["a", "b"],
      );
    });
  });

  describe("rendering", () => {
    const points = [
      { t: 1754438400000, values: [200, 100] },
      { t: 1754697600000, values: [150, 90] },
      { t: 1755129600000, values: [120, 80] },
    ];

    test("a single point is not a trend, so nothing is drawn", () => {
      assert.equal(
        stackedArea({ points: points.slice(0, 1), series: SERIES }),
        "",
      );
      assert.equal(stackedArea({ points: [], series: SERIES }), "");
    });

    test("draws every series and names every series", () => {
      const svg = stackedArea({ points, series: SERIES });
      for (const s of SERIES) {
        assert.ok(svg.includes(s.color), `${s.key} colour missing`);
        assert.ok(svg.includes(s.label), `${s.key} label missing`);
      }
    });

    test("identity never rests on colour alone", () => {
      const svg = stackedArea({ points, series: SERIES });
      // A legend swatch plus its text, for each series.
      assert.equal((svg.match(/class="legend-key"/g) ?? []).length, 2);
    });

    test("labels are escaped", () => {
      const svg = stackedArea({
        points,
        series: [
          { key: "a", label: "a & <b>", color: "#2a78d6" },
          SERIES[1] as ChartSeries,
        ],
      });
      assert.ok(svg.includes("a &amp; &lt;b&gt;"));
      assert.ok(!svg.includes("<b>"));
    });

    test("the first and last dates are on the axis", () => {
      const svg = stackedArea({ points, series: SERIES });
      assert.ok(svg.includes("Aug 6"));
      assert.ok(svg.includes("Aug 14"));
    });

    test("scales to the viewBox rather than fixed pixels", () => {
      const svg = stackedArea({ points, series: SERIES });
      assert.ok(svg.includes(`viewBox="0 0 ${PLOT.width} ${PLOT.height}"`));
      assert.ok(!/width="\d+px"/.test(svg));
    });
  });
});
