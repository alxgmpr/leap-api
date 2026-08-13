import { type Frame, renderNdjson } from "../frames.ts";
import { esc } from "./html.ts";

const TOKEN =
  /("(?:\\.|[^"\\])*")(\s*:)|("(?:\\.|[^"\\])*")|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

/** Colour a JSON string. Hand-written because we emit the JSON ourselves. */
export function highlightJson(json: string): string {
  let out = "";
  let last = 0;
  for (const match of json.matchAll(TOKEN)) {
    const at = match.index;
    out += esc(json.slice(last, at));
    const [whole, key, colon, str, lit, num] = match;
    if (key)
      out += `<span class="tok-key">${esc(key)}</span>${esc(colon ?? "")}`;
    else if (str) out += `<span class="tok-str">${esc(str)}</span>`;
    else if (lit) out += `<span class="tok-lit">${esc(lit)}</span>`;
    else if (num) out += `<span class="tok-num">${esc(num)}</span>`;
    else out += esc(whole);
    last = at + whole.length;
  }
  return out + esc(json.slice(last));
}

const FIDELITY_NOTE: Record<Frame["fidelity"], string> = {
  "captured-frame": "Captured frame — every header is real.",
  "captured-body":
    "Captured body — StatusCode and Body are from hardware; CommuniqueType, MessageBodyType and ClientTag are supplied by convention.",
  constructed: "Constructed — synthesized from the schema. Not observed.",
};

/** One frame, pretty-printed for reading and one-lined for copying. */
export function renderFrame(frame: Frame, label: string): string {
  const wire = renderNdjson(frame);
  const pretty = JSON.stringify(JSON.parse(wire), null, 2);
  return [
    `<figure class="frame" data-fidelity="${frame.fidelity}">`,
    `<figcaption><span class="frame-label">${esc(label)}</span>`,
    `<span class="chip chip-${frame.fidelity}" title="${esc(FIDELITY_NOTE[frame.fidelity])}">${esc(frame.fidelity.replace("-", " "))}</span>`,
    frame.source
      ? `<span class="frame-source">${esc(frame.source)}</span>`
      : "",
    "</figcaption>",
    `<pre class="frame-json"><code>${highlightJson(pretty)}</code></pre>`,
    `<button class="copy" type="button" data-copy="${esc(wire)}">Copy wire line</button>`,
    "</figure>",
  ].join("");
}
