/**
 * Evidence grading, derived from artifacts already in the tree -- the probe
 * corpora, the TODO markers the specification writes about itself, and the one
 * structural fact that the command-processor surface has no firmware route
 * behind it at all.
 *
 * Where a verdict cannot be derived, callers emit no chip. This module never
 * guesses a grade.
 */

export type Verdict =
  /** A 200 was captured from hardware. */
  | "confirmed"
  /**
   * Imported from the firmware route table without hand-refinement: no
   * capture, no platform data, and staging shapes. Outranks every other
   * verdict because it is a statement about the entry itself, not about what
   * hardware said.
   */
  | "unverified"
  /** Hardware was asked and answered something other than 200. */
  | "refused"
  /** Recovered from decompiled Lutron app binaries, not firmware and not captures. */
  | "app-re"
  /** Present in the firmware extraction. */
  | "firmware"
  /** An open TODO marker: the spec says so itself. */
  | "not-established"
  /** No corpus ever sent this. */
  | "never-asked";

export type Observation = { corpus: string; status: string };

export type Provenance = { verdict: Verdict; observations: Observation[] };

/**
 * The whole command-processor surface is app reverse engineering: the firmware
 * route extraction recovered zero commandprocessor routes, and every probe of
 * one was refused. See spec/paths/commandprocessor.yaml.
 */
function isCommandProcessor(url: string): boolean {
  return url.endsWith("/commandprocessor");
}

export function classifyOperation(input: {
  url: string;
  description?: string;
  observations: Observation[];
  verified?: boolean;
}): Provenance {
  const observations = input.observations;
  if (input.verified === false) return { verdict: "unverified", observations };
  if (isCommandProcessor(input.url)) return { verdict: "app-re", observations };
  if (observations.some((o) => o.status.startsWith("200")))
    return { verdict: "confirmed", observations };
  if (observations.length > 0) return { verdict: "refused", observations };
  if (input.description?.includes("TODO("))
    return { verdict: "not-established", observations };
  return { verdict: "never-asked", observations };
}

export function classifyField(node: {
  enum?: unknown[];
  description?: string;
  "x-observed-values"?: unknown[];
  /** Real schema nodes carry `type`, `$ref`, `items` and the rest alongside these. */
  [key: string]: unknown;
}): Verdict {
  // An open TODO outranks observed values, and the two co-occur constantly --
  // 18 of the 24 fields carrying `x-observed-values` also carry a
  // `TODO(enum)`, meaning "the member set was never recovered, but these
  // values were seen". Grading that `confirmed` would claim the set is
  // settled. The observed values are still rendered beside the chip.
  if (node.description?.includes("TODO(")) return "not-established";
  if (Array.isArray(node["x-observed-values"])) return "confirmed";
  return "firmware";
}
