import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { buildModel } from "../lib/site/model.ts";
import { timelineFor } from "../lib/site/timelines.ts";

describe("per-operation timelines", () => {
  const model = buildModel();
  const operations = model.resources.flatMap((r) => r.operations);
  const find = (url: string) => operations.find((o) => o.url === url);

  test("attaches the 102 two-frame pattern to the route that showed it", () => {
    const op = find("/firmwareimage/{firmwareimageId}");
    assert.ok(op);
    const timeline = timelineFor(op, model.frameLogs);
    assert.ok(timeline, "late-frames captured this route");
    assert.equal(timeline.logId, "late-frames");
  });

  test("attaches the subscribe-and-push session to /zone/status", () => {
    const op = find("/zone/status");
    assert.ok(op);
    const timeline = timelineFor(op, model.frameLogs);
    assert.ok(timeline);
    assert.ok(
      timeline.frames.some((f) => f.pushed),
      "the point of this timeline is the pushes",
    );
  });

  test("never invents a timeline for an operation with no captured session", () => {
    const op = find("/zone/daylightinggainsettings");
    assert.ok(op);
    assert.equal(timelineFor(op, model.frameLogs), null);
  });

  test("a single frame is not a sequence", () => {
    const lonely = {
      ...(find("/zone/status") as NonNullable<ReturnType<typeof find>>),
    };
    const logs = model.frameLogs.map((log) => ({
      ...log,
      frames: log.frames.slice(0, 1),
    }));
    assert.equal(timelineFor(lonely, logs), null);
  });

  test("frames carry their timing and push classification", () => {
    const log = model.frameLogs.find((l) => l.id === "push-probe");
    assert.ok(log);
    assert.ok(log.frames.some((f) => typeof f.atMs === "number"));
    assert.ok(log.frames.some((f) => f.pushed === true));
    assert.ok(log.frames.some((f) => f.pushed === false));
  });
});

describe("timeline timing", () => {
  const model = buildModel();

  test("keeps a per-request delay apart from a session clock", () => {
    // late-frames records how long after its own request each frame arrived.
    // Differencing those against a first frame produced "+-2ms" nonsense.
    const late = model.frameLogs.find((l) => l.id === "late-frames");
    assert.ok(late);
    for (const frame of late.frames) {
      assert.equal(typeof frame.delayMs, "number");
      assert.equal(frame.atMs, undefined);
    }
    assert.ok(late.frames.every((f) => (f.delayMs ?? 0) > 900));
  });

  test("a session log keeps its clock", () => {
    const probe = model.frameLogs.find((l) => l.id === "push-probe");
    assert.ok(probe);
    assert.ok(probe.frames.every((f) => f.delayMs === undefined));
    assert.ok(probe.frames.some((f) => typeof f.atMs === "number"));
  });
});
