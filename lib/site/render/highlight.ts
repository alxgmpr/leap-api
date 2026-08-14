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

export const FIDELITY_NOTE: Record<Frame["fidelity"], string> = {
  "captured-frame": "Captured frame — every header is real.",
  "captured-body":
    "Captured body — StatusCode and Body are from hardware; CommuniqueType, MessageBodyType and ClientTag are supplied by convention.",
  constructed: "Constructed — synthesized from the schema. Not observed.",
};

/**
 * A frame as it exists on the wire: one line.
 *
 * LEAP is newline-delimited JSON, so a frame is a single line on a socket.
 * Pretty-printing it here would misrepresent the format and cost four times
 * the height; the captured body gets pretty-printed separately, behind a
 * disclosure, because that is the part a reader actually reads.
 */
export function renderWire(frame: Frame): string {
  return `<pre class="wire" data-fidelity="${frame.fidelity}" title="${esc(FIDELITY_NOTE[frame.fidelity])}"><code>${highlightJson(renderNdjson(frame))}</code></pre>`;
}

/** Copy the exact line, which is the reason this reference exists. */
export function renderCopy(frame: Frame): string {
  return `<button class="copy" type="button" data-copy="${esc(renderNdjson(frame))}">copy line</button>`;
}

/** "Zones · 14 items" — what is in the reply, before deciding to open it. */
export function bodyShape(body: Record<string, unknown> | undefined): string {
  if (!body) return "no body";
  const key = Object.keys(body)[0];
  if (!key) return "empty object";
  const value = body[key];
  if (Array.isArray(value))
    return `${key} · ${value.length} item${value.length === 1 ? "" : "s"}`;
  if (value && typeof value === "object")
    return `${key} · ${Object.keys(value).length} fields`;
  return key;
}

/**
 * The reply, collapsed to its answer. The summary line is the disclosure
 * trigger, so this needs no JavaScript and no id bookkeeping.
 */
export function renderReply(frame: Frame, root = ""): string {
  const status = frame.Header.StatusCode ?? "";
  const head = `<span class="dir" aria-hidden="true">←</span><span class="status">${esc(status)}</span><span class="shape">${esc(bodyShape(frame.Body))}</span>${frame.source ? `<span class="src" title="${esc(FIDELITY_NOTE[frame.fidelity])}">${esc(frame.source)}</span>` : ""}`;

  if (!frame.Body)
    return `<div class="reply" data-fidelity="${frame.fidelity}">${head}</div>`;

  // Stated where the wrapper is actually on screen. A reader who expands this
  // is looking at {"<MessageBodyType>": ...} and needs to know the schema
  // describes what is under that key, not this object.
  const key = Object.keys(frame.Body)[0];
  const wrapperNote = key
    ? `<p class="wrapnote">The one key <code>${esc(key)}</code> is <code>Header.MessageBodyType</code>; the schema describes what is under it, not this object. <a href="${esc(root)}docs/protocol/index.html#body-wraps-the-payload">The Body wrapper</a>.</p>`
    : "";

  return `<details class="reply" data-fidelity="${frame.fidelity}">
<summary>${head}</summary>
${wrapperNote}
<pre class="wire body"><code>${highlightJson(JSON.stringify(frame.Body, null, 2))}</code></pre>
</details>`;
}

/** A labelled single frame, for pages that show one outside an exchange. */
export function renderFrame(frame: Frame, label: string): string {
  const direction = frame.Header.StatusCode ? "←" : "→";
  return `<div class="frame" data-fidelity="${frame.fidelity}">
<div class="send"><span class="dir" aria-hidden="true">${direction}</span><span class="ct">${esc(label)}</span>${frame.source ? `<span class="src">${esc(frame.source)}</span>` : ""}${renderCopy(frame)}</div>
${renderWire(frame)}
${frame.Body ? `<details class="frame-body"><summary>show body</summary><pre class="wire body"><code>${highlightJson(JSON.stringify(frame.Body, null, 2))}</code></pre></details>` : ""}
</div>`;
}
