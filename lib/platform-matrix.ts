export type PlatformStatus = Record<string, string>;

const NOT_PROBED = "not probed";

/**
 * Collapse a concrete probed path to the same template shape `gen-paths`
 * produces, so probe results can be matched to generated operations.
 *
 * LIMITATION: This function templates numeric segments only. `disambiguatePath`
 * distinguishes {id} from {xid}, producing {zoneXid} for XID-keyed routes, but
 * templatePath only recognizes numeric ids and appends Id, so a concrete
 * XID-keyed probe (e.g., /zone/someString) would produce /zone/{zoneId} and
 * never join to its generated {zoneXid} counterpart.
 *
 * This gap is currently SAFE because no captured probe uses an XID. A shape-based
 * heuristic (treating non-numeric segments as XIDs) is deliberately rejected
 * because it would mangle literal sub-resource segments: /zone/status would
 * wrongly become /zone/{zoneXid} instead of staying /zone/status.
 *
 * If XID-keyed probes are ever captured, the caller would need to supply
 * route context rather than trying to infer it from the string alone.
 */
export function templatePath(concretePath: string): string {
  const segments = concretePath.split("/");
  return segments
    .map((seg, i) => {
      if (!/^\d+$/.test(seg)) return seg;
      const owner = segments[i - 1] ?? "resource"; // unreachable: segments[0] is always empty string for absolute paths
      return `{${owner}Id}`;
    })
    .join("/");
}

function rank(status: string): number {
  if (status.startsWith("200")) return 4;
  if (status.startsWith("204")) return 3;
  if (status.startsWith("405")) return 2;
  if (status.startsWith("404")) return 1;
  return 0;
}

/**
 * Build the availability matrix. Where many concrete instances collapse to one
 * template, the most successful observed status wins — one 404 for a deleted
 * id should not mask that the route works.
 */
export function buildMatrix(
  probes: Record<string, Record<string, { status: string }>>,
): Record<string, PlatformStatus> {
  const platforms = Object.keys(probes);
  const matrix: Record<string, PlatformStatus> = {};

  for (const [platform, paths] of Object.entries(probes)) {
    for (const [concrete, result] of Object.entries(paths)) {
      const template = templatePath(concrete);
      if (matrix[template] === undefined) {
        matrix[template] = {};
      }
      const row = matrix[template];
      const current = row[platform];
      if (current === undefined || rank(result.status) > rank(current)) {
        row[platform] = result.status;
      }
    }
  }

  for (const row of Object.values(matrix)) {
    for (const platform of platforms) {
      row[platform] ??= NOT_PROBED;
    }
  }

  return matrix;
}

/** Render one operation's availability as a markdown table for its description. */
export function renderMatrixTable(status: PlatformStatus): string {
  const rows = Object.entries(status)
    .map(([platform, s]) => `| ${platform} | ${s} |`)
    .join("\n");
  return `**Platform availability**\n\n| Platform | Status |\n| --- | --- |\n${rows}`;
}
