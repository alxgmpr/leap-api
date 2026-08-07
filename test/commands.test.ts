import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { describe } from "node:test";
import { parse } from "yaml";

const doc = parse(readFileSync("dist/openapi.yaml", "utf8"));

describe("command surface", () => {
  test("every command processor path takes a Command body", () => {
    const procs = Object.keys(doc.paths).filter((p) =>
      p.endsWith("/commandprocessor"),
    );
    assert.ok(
      procs.length >= 9,
      `expected >=9 processors, got ${procs.length}`,
    );
    for (const p of procs) {
      const post = doc.paths[p].post;
      assert.ok(post, `${p} has no post`);
      assert.equal(post["x-leap-communique-type"], "CreateRequest");
      assert.equal(
        post.requestBody.content["application/json"].schema.$ref,
        "#/components/schemas/Command",
      );
    }
  });

  test("Command is flat, not a discriminated union", () => {
    const cmd = doc.components.schemas.Command;
    assert.deepEqual(cmd.required, ["CommandType"]);
    assert.ok(!("oneOf" in cmd));
    assert.ok(
      Object.keys(cmd.properties).filter((k) => k.endsWith("Parameters"))
        .length >= 50,
    );
  });

  test("CommandType enum is populated", () => {
    const ct = doc.components.schemas.CommandType;
    assert.ok(
      Array.isArray(ct.enum) && ct.enum.length >= 20,
      "CommandType enum not filled",
    );
    assert.ok(ct.enum.includes("GoToDimmedLevel"));
  });
});
