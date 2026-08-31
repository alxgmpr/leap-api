import { href, ROOT_TOP } from "../href.ts";
import type { LeapModel } from "../model.ts";
import { esc } from "./html.ts";
import type { NavItem, Section } from "./layout.ts";

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

export function renderOverview(_model: LeapModel): Section {
  const html = `
<h1>LEAP — The Missing Manual</h1>
<p class="lede">LEAP is the language Lutron's lighting systems — RA3, HomeWorks,
Caseta — speak on the local network. Lutron never published a manual for it, so
this is that manual, reconstructed the hard way: reading firmware, taking apps
apart, and listening to real hardware talk to itself. How to connect, what you
can ask, what comes back — with receipts for every claim.</p>

<h2>Start here</h2>
<ul class="entrypoints">
<li><a href="${esc(href.doc(ROOT_TOP, "protocol"))}">The wire protocol</a> — envelope, framing, status codes, transports.</li>
<li><a href="${esc(href.tier(ROOT_TOP, "recipes"))}">Recipes</a> — frame sequences for the common tasks: pair, discover the layout, read state, drive a zone, watch for changes.</li>
<li><a href="${esc(href.doc(ROOT_TOP, "subscriptions"))}">Subscriptions</a> — the lifecycle and the shape of a push.</li>
<li><a href="${esc(href.tier(ROOT_TOP, "resources"))}">Resources</a> and <a href="${esc(href.tier(ROOT_TOP, "schemas"))}">Schemas</a> — the full reference, one page per endpoint and type.</li>
<li><a href="${esc(href.tier(ROOT_TOP, "coverage"))}">Coverage</a> — what is documented, what is imported unverified, and what is absent.</li>
</ul>`;

  return { id: "overview", html };
}
