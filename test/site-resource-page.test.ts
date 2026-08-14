import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { buildModel } from "../lib/site/model.ts";
import { renderResourceSections } from "../lib/site/render/resource.ts";

describe("resource sections", () => {
  const model = buildModel();
  const sections = renderResourceSections(model);
  const zone = sections.find((s) => s.id === "resource-zone");

  test("emits one section per resource, plus the lead", () => {
    assert.equal(sections.length, model.resources.length + 1);
    assert.ok(zone);
  });

  test("leads with CommuniqueType and never shows an HTTP verb", () => {
    const html = zone?.html ?? "";
    // The markup carries the CommuniqueType; the uppercasing is presentational.
    assert.match(html, /class="ct">Read</);
    assert.match(html, /class="ct">Update</);
    assert.ok(
      !/\bGET\b|\bPOST\b|\bPUT\b|\bDELETE\b/.test(
        html.replace(/<div class="prose opdesc">[\s\S]*?<\/div>/g, ""),
      ),
      "HTTP verbs are not part of this protocol's vocabulary",
    );
  });

  test("shows the captured response frame inline", () => {
    assert.match(zone?.html ?? "", /ZoneStatuses/);
    assert.match(zone?.html ?? "", /data-fidelity="captured-body"/);
  });

  test("marks subscribable operations and names the pushed schema", () => {
    assert.match(zone?.html ?? "", /class="sub">subscribable/);
    assert.match(zone?.html ?? "", /Subscribing pushes/);
    assert.match(zone?.html ?? "", /href="schema\/ZoneStatus\.html"/);
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
        sections.find((s) => s.id === `resource-${resource.name}`)?.html ?? "";
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
    const html = sections.find((s) => s.id === "resource-area")?.html ?? "";
    assert.match(html, /class="edges"/);
    assert.match(html, /data-target="area"|data-target=""/);
  });

  test("an observed target is linked once the reference documents it", () => {
    // Zone.CountdownTimer resolves to /countdowntimer from a real captured
    // href. Before the unverified import there was no section to link to and
    // the edge rendered as "not documented here"; the import gave it one.
    const html = zone?.html ?? "";
    assert.match(html, /href="index\.html#resource-countdowntimer"/);
  });

  test("an edge to a resource with no section at all is still not linked", () => {
    // The guard the test above used to provide: every resolved target that is
    // linked must have a rendered section behind it.
    const documented = new Set(model.resources.map((r) => r.name));
    for (const resource of model.resources)
      for (const edge of resource.edges)
        if (edge.target && !documented.has(edge.target)) {
          const html =
            sections.find((s) => s.id === `resource-${resource.name}`)?.html ??
            "";
          assert.ok(
            !html.includes(`href="index.html#resource-${edge.target}"`),
            `${edge.schema}.${edge.property} links to a section that does not exist`,
          );
        }
  });

  test("links are in-page anchors, never root-absolute", () => {
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

  test("gives the composer its own affordance, separate from the evidence", () => {
    const html = zone?.html ?? "";
    assert.match(
      html,
      /<details class="compose"[^>]*><summary>Compose a frame/,
    );
    assert.match(html, /<details class="more"><summary>Evidence and notes/);
    assert.match(html, /class="composer"/);
    assert.match(html, /class="observations"/);
  });

  test("opens the composer where composing is the point", () => {
    const html = zone?.html ?? "";
    // A command processor's whole surface is the frame you build; a read's is
    // the frame already shown above it.
    const opened = (html.match(/<details class="compose" open>/g) ?? []).length;
    const commandProcessors = (
      model.resources.find((r) => r.name === "zone")?.operations ?? []
    ).filter((o) => o.url.endsWith("/commandprocessor")).length;
    assert.ok(commandProcessors > 0);
    assert.equal(opened, commandProcessors);
  });

  test("does not route the reader through OpenAPI in its own voice", () => {
    // Authored spec prose may still mention it; the site's own chrome may not.
    const chrome = (zone?.html ?? "").replace(
      /<div class="prose opdesc">[\s\S]*?<\/div>/g,
      "",
    );
    assert.ok(
      !/openapi/i.test(chrome),
      "the site's own labels and links must not lean on OpenAPI",
    );
  });
});
