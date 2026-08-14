import { existsSync, readFileSync } from "node:fs";
import type { Snapshot } from "../../tools/coverage-snapshot.ts";

export const HISTORY_FILE = "coverage-history.json";

export type HistoryPoint = {
  sha: string;
  /** Author date, ISO 8601 with offset. */
  date: string;
  subject: string;
  metrics: Snapshot;
};

/**
 * The measured history, oldest first. Absent file is not an error: a fresh
 * clone has no history until `npm run history:coverage` runs, and the site
 * builds without the chart rather than failing.
 */
export function readHistory(file = HISTORY_FILE): HistoryPoint[] {
  if (!existsSync(file)) return [];
  return JSON.parse(readFileSync(file, "utf8")) as HistoryPoint[];
}
