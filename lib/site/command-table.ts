export type CommandRow = {
  commandType: string;
  /** The `*Parameters` field this CommandType populates, or null when no source establishes one. */
  parameterField: string | null;
  /** The source cell, verbatim -- rendered next to the pairing so a reader sees the evidence. */
  establishedBy: string;
};

const HEADING = "## CommandType -> parameter field";

/**
 * Parse the CommandType-to-parameter-field table out of Command.yaml's
 * description. Throwing on a missing heading or an empty table is deliberate:
 * the command composer is built from this, and a silently empty table would
 * render a command surface with no parameters at all.
 */
export function parseCommandTable(description: string): CommandRow[] {
  const start = description.indexOf(HEADING);
  if (start === -1)
    throw new Error(`Command.yaml: heading "${HEADING}" not found`);

  const after = description.slice(start + HEADING.length);
  const end = after.indexOf("\n## ");
  const section = end === -1 ? after : after.slice(0, end);

  const rows: CommandRow[] = [];
  for (const line of section.split("\n")) {
    const cells = /^\s*\|\s*`([^`]+)`\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$/.exec(
      line,
    );
    if (!cells) continue;
    const [, commandType, field, establishedBy] = cells;
    const named = /`([^`]+)`/.exec(field as string);
    rows.push({
      commandType: commandType as string,
      parameterField: named ? (named[1] as string) : null,
      establishedBy: establishedBy as string,
    });
  }
  if (rows.length === 0)
    throw new Error(`Command.yaml: "${HEADING}" parsed to zero rows`);
  return rows;
}
