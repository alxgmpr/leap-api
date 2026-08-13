import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { buildModel } from "../lib/site/model.ts";
import { renderResourcePages } from "../lib/site/render/resource.ts";

describe("resource pages", () => {
  const model = buildModel();
  const pages = renderResourcePages(model);
  const zone = pages.find((p) => p.path === "resource/zone/index.html");

  test("emits one page per resource", () => {
    assert.equal(pages.length, model.resources.length);
    assert.ok(zone);
  });

  test("leads with CommuniqueType, not the HTTP verb", () => {
    const html = zone?.html ?? "";
    const communique = html.indexOf("ReadRequest");
    const verb = html.indexOf("OpenAPI mapping");
    assert.ok(communique > -1);
    assert.ok(
      verb === -1 || communique < verb,
      "CommuniqueType must come first",
    );
  });

  test("shows the captured response frame inline", () => {
    assert.match(zone?.html ?? "", /ZoneStatuses/);
    assert.match(zone?.html ?? "", /data-fidelity="captured-body"/);
  });

  test("marks subscribable operations and names the pushed schema", () => {
    assert.match(zone?.html ?? "", /class="sub">subscribable/);
    assert.match(zone?.html ?? "", /Subscribing pushes/);
    assert.match(zone?.html ?? "", /schema\/ZoneStatus\/index\.html/);
  });

  test("carries one provenance mark per URL, not per verb", () => {
    const html = zone?.html ?? "";
    const chips = (html.match(/class="chip chip-verdict/g) ?? []).length;
    const urls = new Set(
      model.resources
        .find((r) => r.name === "zone")
        ?.operations.map((o) => o.url),
    ).size;
    assert.equal(chips, urls);
    assert.ok(
      chips <
        (model.resources.find((r) => r.name === "zone")?.operations.length ??
          0),
      "grouping must actually reduce the marks",
    );
  });

  test("renders the command composer with CommandType options", () => {
    assert.match(zone?.html ?? "", /class="composer"/);
    assert.match(zone?.html ?? "", /GoToDimmedLevel/);
  });

  test("renders the authored operation description as markdown", () => {
    const html = zone?.html ?? "";
    // The commandprocessor's own note -- 2,610 characters of which
    // CommandTypes are confirmed and by what source.
    assert.match(html, /Confirmed accepted CommandTypes/);
    assert.match(html, /class="prose opdesc"/);
    assert.match(html, /<code>GoToShadeLevelWithTilt<\/code>/);
  });

  test("does not print the injected platform table on top of its own", () => {
    const html = zone?.html ?? "";
    assert.ok(
      !html.includes("Platform availability"),
      "bundle.ts's injected copy must not render beside the native observation table",
    );
    assert.match(html, /class="observations"/);
  });

  test("every operation with a description shows it", () => {
    for (const resource of model.resources) {
      const html =
        pages.find((p) => p.path === `resource/${resource.name}/index.html`)
          ?.html ?? "";
      const withProse = resource.operations.filter(
        (o) => o.description && !o.description.startsWith("**Platform"),
      ).length;
      if (withProse === 0) continue;
      assert.ok(
        (html.match(/class="prose opdesc"/g) ?? []).length > 0,
        `${resource.name} renders no operation description`,
      );
    }
  });

  test("a CommandType carries its parameter schema's scalar fields", () => {
    // Without these, composing a GoToDimmedLevel still means opening
    // DimmedLevelParameters to learn it holds a Level -- the jump this page
    // exists to remove.
    const html = zone?.html ?? "";
    const option =
      /<option value="GoToDimmedLevel"[^>]*data-fields="([^"]*)"/.exec(html);
    assert.ok(option, "GoToDimmedLevel option must carry its fields");
    const fields = JSON.parse((option[1] as string).replaceAll("&quot;", '"'));
    assert.ok(
      fields.some((f: { name: string }) => f.name === "Level"),
      "Level must be offered as an input",
    );
  });

  test("a CommandType with no established field carries no fields", () => {
    const html = zone?.html ?? "";
    const option =
      /<option value="GoToFanSpeed"[^>]*data-fields="([^"]*)"/.exec(html);
    assert.ok(option);
    assert.deepEqual(
      JSON.parse((option[1] as string).replaceAll("&quot;", '"')),
      [],
      "no source pairs GoToFanSpeed with a field, so none may be offered",
    );
  });

  test("renders edges, with unresolved ones visibly unresolved", () => {
    const html =
      pages.find((p) => p.path === "resource/area/index.html")?.html ?? "";
    assert.match(html, /class="edges"/);
    assert.match(html, /data-target="area"|data-target=""/);
  });

  test("an observed target this reference does not document is not linked", () => {
    // Zone.CountdownTimer resolves to /countdowntimer from a real captured
    // href, and no resource page covers it. Linking it would be a dead link;
    // dropping it would hide a real relationship.
    const html = zone?.html ?? "";
    assert.match(html, /not documented here/);
    assert.ok(
      !html.includes("resource/countdowntimer/index.html"),
      "must not link to a page that does not exist",
    );
  });

  test("links are relative to the page, not to site root", () => {
    assert.ok(!(zone?.html ?? "").includes('href="/'));
  });

  test("every URL group is filterable by its verdict", () => {
    const html = zone?.html ?? "";
    const groups = (html.match(/class="group"/g) ?? []).length;
    const verdicts = (html.match(/data-verdict="/g) ?? []).length;
    assert.equal(groups, verdicts);
    assert.ok(groups > 0);
  });

  test("renders each frame as one wire line, not pretty-printed", () => {
    const html = zone?.html ?? "";
    const wires = [
      ...html.matchAll(
        /<pre class="wire" [^>]*><code>([\s\S]*?)<\/code><\/pre>/g,
      ),
    ];
    assert.ok(wires.length > 0);
    for (const [, line] of wires)
      assert.ok(
        !(line as string).includes("\n"),
        "a LEAP frame is one line on the socket",
      );
  });

  test("collapses a captured reply to its shape", () => {
    const html = zone?.html ?? "";
    assert.match(html, /<summary><span class="dir"[^>]*>←<\/span>/);
    assert.match(html, /class="shape">ZoneStatuses · \d+ items/);
  });

  test("keeps the composer, evidence and OpenAPI mapping behind one disclosure", () => {
    const html = zone?.html ?? "";
    assert.match(
      html,
      /<details class="more"><summary>Details, evidence and composer/,
    );
    assert.match(html, /class="composer"/);
    assert.match(html, /class="observations"/);
    assert.match(html, /openapi-mapping/);
  });
});
