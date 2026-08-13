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
    assert.match(zone?.html ?? "", /Subscribable/);
    assert.match(zone?.html ?? "", /ZoneStatus/);
  });

  test("carries a provenance chip on every operation", () => {
    const chips = (zone?.html ?? "").match(/class="chip chip-verdict/g) ?? [];
    const zoneOps =
      model.resources.find((r) => r.name === "zone")?.operations ?? [];
    assert.equal(chips.length, zoneOps.length);
  });

  test("renders the command composer with CommandType options", () => {
    assert.match(zone?.html ?? "", /class="composer"/);
    assert.match(zone?.html ?? "", /GoToDimmedLevel/);
  });

  test("renders edges, with unresolved ones visibly unresolved", () => {
    const html =
      pages.find((p) => p.path === "resource/area/index.html")?.html ?? "";
    assert.match(html, /class="edges"/);
    assert.match(html, /data-target="area"|data-target=""/);
  });

  test("links are relative to the page, not to site root", () => {
    assert.ok(!(zone?.html ?? "").includes('href="/'));
  });

  test("every operation is filterable by its verdict", () => {
    const html = zone?.html ?? "";
    const ops = (html.match(/class="operation"/g) ?? []).length;
    const verdicts = (html.match(/data-verdict="/g) ?? []).length;
    assert.equal(ops, verdicts);
  });
});
