import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { describe } from "node:test";
import { parse } from "yaml";
import { parseCommandTable } from "../lib/site/command-table.ts";

describe("CommandType table", () => {
  const description = (
    parse(readFileSync("spec/components/schemas/Command.yaml", "utf8")) as {
      description: string;
    }
  ).description;

  test("parses one row per CommandType enum member", () => {
    const rows = parseCommandTable(description);
    const commandType = parse(
      readFileSync("spec/components/schemas/CommandType.yaml", "utf8"),
    ) as { enum: string[] };
    assert.equal(rows.length, commandType.enum.length);
    assert.deepEqual(
      rows.map((r) => r.commandType).sort(),
      [...commandType.enum].sort(),
    );
  });

  test("pairs a command with its parameter field", () => {
    const rows = parseCommandTable(description);
    const row = rows.find((r) => r.commandType === "GoToDimmedLevel");
    assert.equal(row?.parameterField, "DimmedLevelParameters");
  });

  test("a parameterless command has a null field, not an empty string", () => {
    const rows = parseCommandTable(description);
    assert.equal(
      rows.find((r) => r.commandType === "Raise")?.parameterField,
      null,
    );
  });

  test("an unestablished pairing has a null field and says why", () => {
    const rows = parseCommandTable(description);
    const row = rows.find((r) => r.commandType === "GoToFanSpeed");
    assert.equal(row?.parameterField, null);
    assert.match(row?.establishedBy ?? "", /not established|index\.md/);
  });

  test("stops at the next heading rather than swallowing later tables", () => {
    const rows = parseCommandTable(
      "## CommandType -> parameter field\n\n| A | B | C |\n|---|---|---|\n| `X` | `XParameters` | src |\n\n## Other\n\n| `Y` | `YParameters` | src |\n",
    );
    assert.deepEqual(
      rows.map((r) => r.commandType),
      ["X"],
    );
  });

  test("a renamed heading fails loudly", () => {
    assert.throws(() => parseCommandTable("## Something else\n"), /heading/);
  });

  test("a present heading with no rows fails loudly", () => {
    assert.throws(
      () =>
        parseCommandTable("## CommandType -> parameter field\n\nprose only\n"),
      /zero rows/,
    );
  });
});
