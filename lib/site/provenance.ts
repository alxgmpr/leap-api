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
}): Provenance {
  const observations = input.observations;
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
}): Verdict {
  if (Array.isArray(node["x-observed-values"])) return "confirmed";
  if (node.description?.includes("TODO(")) return "not-established";
  return "firmware";
}
