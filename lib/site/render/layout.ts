import { esc } from "./html.ts";

export type Page = { path: string; html: string };

export type NavItem = { href: string; label: string; group?: string };

/**
 * One block of the single-page reference. `id` is the section's anchor and
 * must be unique across the whole document -- the build enforces that.
 */
export type Section = { id: string; html: string };

/**
 * The whole reference is one document: every section in one long scroll, and
 * the sidebar navigates by anchor. Asset links stay relative -- GitHub Pages
 * serves this project under a subpath, and the one page lives at its root.
 */
export function page(input: {
  title: string;
  nav: NavItem[];
  sections: Section[];
}): string {
  const groups = new Map<string, NavItem[]>();
  for (const item of input.nav) {
    const group = item.group ?? "";
    groups.set(group, [...(groups.get(group) ?? []), item]);
  }
  const nav = [...groups.entries()]
    .map(
      ([group, items]) =>
        `${group ? `<h2 class="navgroup">${esc(group)}</h2>` : ""}<ul>${items
          .map(
            (item) =>
              `<li><a href="${esc(item.href)}">${esc(item.label)}</a></li>`,
          )
          .join("")}</ul>`,
    )
    .join("");

  const main = input.sections
    .map(
      (section) =>
        `<section class="docsec" id="${esc(section.id)}">${section.html}</section>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(input.title)} — LEAP</title>
<link rel="stylesheet" href="assets/app.css">
</head>
<body data-root="">
<a class="skip" href="#main">Skip to content</a>
<header class="topbar">
<a class="brand" href="#overview">LEAP</a>
<div class="searchwrap">
<input id="search" class="search" type="search" placeholder="Search resources, schemas, commands" autocomplete="off"
 role="combobox" aria-expanded="false" aria-controls="search-results" aria-autocomplete="list">
<ul id="search-results" class="search-results" role="listbox" aria-label="Search results" hidden></ul>
</div>
<label class="filter"><input id="confirmed-only" type="checkbox"> Hardware-confirmed only</label>
</header>
<div class="shell">
<nav class="sidebar">${nav}</nav>
<main id="main">${main}</main>
</div>
<script type="module" src="assets/boot.js"></script>
</body>
</html>`;
}
