import type { Timeline } from "../timelines.ts";
import { esc } from "./html.ts";

/**
 * A captured session, rendered at build time.
 *
 * These were client-side before, which meant every page downloaded 92KB of
 * frame logs to draw one list. They are static content; the server knows them.
 */
/**
 * What a given log is evidence of. Without this the firmwareimage timeline
 * reads as five ordinary 200s, when the point is that each arrived about a
 * second late, after a 102 the log does not itself record.
 */
const LOG_CAPTION: Record<string, string> = {
  "late-frames":
    "The delayed terminal responses, each about a second after its request on the same tag. The 102 that preceded each one is in the sweep corpus, not this log",
  "push-probe": "Subscribe, command, push — one connection",
  "caseta-device-join": "A device joining, pushed unasked",
  "caseta-connect-observe": "A silent connect, with the auto-subscribe",
};

export function renderTimeline(timeline: Timeline, caption: string): string {
  // Offsets are relative to the first frame shown, so a filtered timeline
  // reads from zero rather than from wherever it sat in the session.
  const start = Number(timeline.frames[0]?.atMs ?? 0);
  const label = LOG_CAPTION[timeline.logId] ?? caption;

  const rows = timeline.frames
    .map((frame) => {
      // A session clock gets an offset from the first frame shown; a
      // per-request delay is already absolute and is labelled as such.
      // Differencing the two kinds produced "+-2ms" before they were split.
      const at =
        frame.delayMs !== undefined
          ? `${frame.delayMs}ms after its request`
          : frame.atMs === undefined
            ? ""
            : `+${Number(frame.atMs) - start}ms`;
      // A push lands on a tag the client already resolved -- that is what makes
      // it a push rather than a reply, and it is the thing worth marking.
      const push = frame.pushed === true;
      return `<li data-push="${push}">
<span class="at">${esc(at)}</span>
<span class="tl-ct">${esc(frame.CommuniqueType)}</span>
<span class="tl-url">${esc(frame.Header.Url ?? "")}</span>
<span class="tl-status">${esc(frame.Header.StatusCode ?? "")}</span>
<span class="pushnote">${esc(frame.Header.ClientTag ?? "")}${push ? " · push" : ""}</span>
</li>`;
    })
    .join("");

  return `<figure class="timeline">
<figcaption>${esc(label)} — captured, <code>${esc(timeline.logId)}</code></figcaption>
<ol>${rows}</ol>
</figure>`;
}
