import assert from "node:assert/strict";
import test, { describe } from "node:test";
import {
  highlightJson,
  renderCopy,
  renderFrame,
} from "../lib/site/render/highlight.ts";
import { esc, slug } from "../lib/site/render/html.ts";

describe("html primitives", () => {
  test("escapes every character that can break markup", () => {
    assert.equal(
      esc(`<a href="x">&'`),
      "&lt;a href=&quot;x&quot;&gt;&amp;&#39;",
    );
  });

  test("slugifies a schema name for use in a path", () => {
    assert.equal(slug("ZoneStatus"), "zonestatus");
    assert.equal(slug("/area/{areaId}/status"), "area-areaid-status");
  });

  test("highlights keys, strings, numbers and literals distinctly", () => {
    const html = highlightJson('{"Level":100,"Ok":true,"Name":"hall"}');
    assert.match(html, /class="tok-key"/);
    assert.match(html, /class="tok-num"/);
    assert.match(html, /class="tok-lit"/);
    assert.match(html, /class="tok-str"/);
  });

  test("escapes inside highlighted output", () => {
    const html = highlightJson('{"Name":"<script>"}');
    assert.ok(!html.includes("<script>"));
    assert.match(html, /&lt;script&gt;/);
  });

  test("a rendered frame states its fidelity and its source", () => {
    const html = renderFrame(
      {
        CommuniqueType: "ReadResponse",
        Header: {
          Url: "/zone/status",
          ClientTag: "lt-1",
          StatusCode: "200 OK",
        },
        Body: { ZoneStatuses: [] },
        fidelity: "captured-body",
        source: "ra3",
      },
      "Response",
    );
    assert.match(html, /data-fidelity="captured-body"/);
    assert.match(html, /ra3/);
    assert.match(html, /Response/);
  });

  test("a constructed frame is marked as constructed", () => {
    const html = renderFrame(
      {
        CommuniqueType: "ReadRequest",
        Header: { Url: "/curve/1", ClientTag: "lt-1" },
        fidelity: "constructed",
        source: null,
      },
      "Request",
    );
    assert.match(html, /data-fidelity="constructed"/);
  });

  test("the copyable wire line survives escaping into an attribute", () => {
    const html = renderCopy({
      CommuniqueType: "CreateRequest",
      Header: { Url: "/zone/1/commandprocessor", ClientTag: "lt-1" },
      Body: { Command: { CommandType: "GoToDimmedLevel" } },
      fidelity: "constructed",
      source: null,
    });
    assert.match(html, /data-copy="\{&quot;CommuniqueType&quot;/);
    assert.ok(
      !html.includes('data-copy="{"'),
      "unescaped quotes break the attribute",
    );
  });
});
