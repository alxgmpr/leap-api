import { href, ROOT_TOP } from "../href.ts";
import type { LeapModel } from "../model.ts";
import { renderFrame } from "./highlight.ts";
import { esc } from "./html.ts";
import type { NavItem, Section } from "./layout.ts";
import { renderTimeline } from "./timeline.ts";

export function siteNav(model: LeapModel, root: string): NavItem[] {
  return [
    { href: href.overview(root), label: "Overview" },
    { href: href.tier(root, "recipes"), label: "Recipes" },
    { href: href.tier(root, "coverage"), label: "Coverage" },
    { href: href.tier(root, "resources"), label: "Resources" },
    { href: href.tier(root, "schemas"), label: "Schemas" },
    ...model.docs.map((d) => ({
      href: href.doc(root, d.slug),
      label: d.title,
      group: "Protocol",
    })),
    ...model.resources.map((r) => ({
      href: href.resource(root, r.name),
      label: r.name,
      group: "Resources",
    })),
  ];
}

/**
 * The `.resource-grid` `<li>` list: every resource, linked, with its
 * operation count. Shared by the overview's "Resources" section and
 * `renderResourceIndex` -- the two were a byte-identical template kept in
 * sync by hand.
 */
export function resourceGrid(model: LeapModel, root: string): string {
  return model.resources
    .map(
      (r) =>
        `<li><a href="${esc(href.resource(root, r.name))}">${esc(r.name)}</a> <span class="count">${r.operations.length}</span></li>`,
    )
    .join("");
}

export function renderOverview(model: LeapModel): Section {
  // The most informative real frame available: a captured response with a body.
  const session = model.frameLogs.find((log) => log.id === "push-probe");
  const example = model.frameLogs
    .flatMap((log) => log.frames)
    .find((frame) => frame.Header.StatusCode?.startsWith("200") && frame.Body);

  const html = `
<h1>LEAP</h1>
<p class="lede">LEAP (Lutron Extensible Application Protocol) is the JSON
protocol Lutron processors and bridges — RA3, HWQS, Caseta — speak for
control and status. This reference is built from firmware extraction,
decompiled apps, and traffic captured on live hardware, and every claim is
labelled with the evidence behind it.</p>

<h2>Not HTTP</h2>
<p>Despite the HTTP-style status strings and URLs, LEAP is newline-delimited
JSON over one persistent mutual-TLS socket on port 8081. A client opens the
socket once and reuses it for the life of the session; every request and every
response is a single JSON object on its own line, correlated by
<code>Header.ClientTag</code>. There is no per-request connection and no
HTTP-layer request/response pairing — an HTTP client cannot speak it.</p>

<h2>The envelope</h2>
<p>Every message in both directions has the same three top-level keys:
<code>CommuniqueType</code> says what kind of message it is,
<code>Header</code> carries the LEAP <code>Url</code> and the correlation tag,
and <code>Body</code> carries the payload.</p>
${example ? renderFrame(example, "Captured from hardware") : ""}

<h2>Every payload is wrapped</h2>
<p><code>Body</code> holds exactly one key, named by
<code>Header.MessageBodyType</code>, and the payload is that key's value.
Every schema in this reference describes the value under that key, so a
client must unwrap <code>Body</code> before parsing. 438 of the 439
<code>200 OK</code> bodies captured for this project have this shape; the
one exception, RA3's read of <code>/button</code>, returns a bare
<code>{}</code>.</p>

<h2>What a session looks like</h2>
<p>Subscribe, send a command, and watch the processor push the result back on
the subscription's own tag — one captured connection, in order.</p>
${
  session
    ? renderTimeline(
        { logId: session.id, frames: session.frames.slice(0, 12) },
        "One connection",
      )
    : ""
}

<h2>Start here</h2>
<ul class="entrypoints">
<li><a href="${esc(href.tier(ROOT_TOP, "recipes"))}">Recipes</a> — frame sequences for the common tasks: pair, discover the layout, read state, drive a zone, watch for changes.</li>
<li><a href="${esc(href.doc(ROOT_TOP, "protocol"))}">The wire protocol</a> — envelope, framing, status codes, transports.</li>
<li><a href="${esc(href.doc(ROOT_TOP, "subscriptions"))}">Subscriptions</a> — the lifecycle and the shape of a push.</li>
<li><a href="${esc(href.tier(ROOT_TOP, "coverage"))}">Coverage</a> — what is documented, what is imported unverified, and what is absent.</li>
</ul>

<h2>Resources</h2>
<ul class="resource-grid">
${resourceGrid(model, ROOT_TOP)}
</ul>`;

  return { id: "overview", html };
}
