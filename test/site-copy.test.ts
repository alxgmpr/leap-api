import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { parseHTML } from "linkedom";
import { buildRequestFrame, renderNdjson } from "../lib/site/frames.ts";
import { renderWire } from "../lib/site/render/highlight.ts";
import { attachCopyButtons } from "../site-src/copy.js";

/** The project builds without the DOM lib, so linkedom's own type is the one. */
type Doc = ReturnType<typeof parseHTML>["document"];

/** A document with the three kinds of block the built page contains. */
function page(): Doc {
  const { document } = parseHTML(`<body>
<pre class="wire"><code>{"CommuniqueType":"ReadRequest"}</code></pre>
<pre class="wire body"><code>{
  "ZoneStatus": []
}</code></pre>
<pre><code>npm run bundle</code></pre>
</body>`);
  return document;
}

describe("copy buttons", () => {
  test("gives a control to both kinds of wire block", () => {
    const document = page();
    attachCopyButtons(document);
    assert.equal(document.querySelectorAll("button.copy").length, 2);
  });

  test("leaves a prose fence alone", () => {
    const document = page();
    attachCopyButtons(document);
    const prose = document.querySelector("pre:not(.wire)");
    assert.equal(prose?.parentElement?.tagName, "BODY");
  });

  // What replaced the data-copy attribute. Highlighting wraps spans around
  // escaped text, so the block's own text is the line the generator emitted --
  // this is the assertion that keeps that true.
  test("copies the wire line byte for byte with the generator", () => {
    const frame = buildRequestFrame({
      url: "/zone/1/commandprocessor",
      communiqueType: "CreateRequest",
      wrapperKey: "Command",
      payload: { CommandType: "GoToDimmedLevel" },
    });
    const { document } = parseHTML(`<body>${renderWire(frame)}</body>`);
    const written: string[] = [];
    attachCopyButtons(document, async (text: string) => {
      written.push(text);
    });

    document.querySelector("button.copy")?.click();

    assert.deepEqual(written, [renderNdjson(frame)]);
  });

  test("copies a pretty-printed body with its newlines intact", () => {
    const document = page();
    const written: string[] = [];
    attachCopyButtons(document, async (text: string) => {
      written.push(text);
    });

    document.querySelectorAll("button.copy")[1]?.click();

    assert.equal(written[0], '{\n  "ZoneStatus": []\n}');
  });

  // The control is an icon, so the label is the only thing a screen reader
  // has -- both to know what the button does and to hear that it worked.
  test("names itself, and says so when it has copied", async () => {
    const document = page();
    attachCopyButtons(document, async () => {});
    const button = document.querySelector("button.copy");
    assert.equal(button?.getAttribute("aria-label"), "Copy");

    button?.click();
    await Promise.resolve();

    assert.equal(button?.getAttribute("aria-label"), "Copied");
  });

  test("runs twice without doubling the controls", () => {
    const document = page();
    attachCopyButtons(document);
    attachCopyButtons(document);
    assert.equal(document.querySelectorAll("button.copy").length, 2);
  });
});
