import { templatePath } from "../platform-matrix.ts";
import type { Frame } from "./frames.ts";
import type { FrameLog, Operation } from "./model.ts";

export type Timeline = { logId: string; frames: Frame[] };

/**
 * The captured session for one operation, or null.
 *
 * A frame log is a whole connection touching many URLs, so attaching one
 * wholesale to an operation would imply evidence that is not about it. This
 * filters a log to the frames whose Url templates to this operation's, and
 * returns the richest log that has at least two -- one frame is not a
 * sequence, and there is nothing to show.
 */
export function timelineFor(
  operation: Operation,
  logs: FrameLog[],
): Timeline | null {
  let best: Timeline | null = null;

  for (const log of logs) {
    const frames = log.frames.filter(
      (frame) => templatePath(frame.Header.Url ?? "") === operation.url,
    );
    if (frames.length < 2) continue;
    if (!best || frames.length > best.frames.length)
      best = { logId: log.id, frames };
  }

  return best;
}
