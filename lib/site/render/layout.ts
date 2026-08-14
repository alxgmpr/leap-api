import { href } from "../href.ts";
import { esc } from "./html.ts";

export type Page = { path: string; html: string };

export type NavItem = { href: string; label: string; group?: string };

/**
 * The body content of one page in the reference (each page carries exactly
 * one). `id` becomes the `id` attribute on the wrapping `<section
 * class="docsec">` -- it and every other id inside `html` only need to be
 * unique within this page, not across the other 556; `assertInvariants`
 * checks per page.
 */
export type Section = { id: string; html: string };

/**
 * Renders one page of the reference. `root` is the prefix that reaches the
 * site root from this page's own directory ("" at the top level, "../" one
 * directory deep) -- it prefixes every asset URL and the brand link, and
 * seeds the speculation-rules prefetch pattern below. Asset and cross-page
 * links stay relative -- GitHub Pages serves this project under a subpath.
 * `current`, when given, is the nav entry's own `href`, so that entry gets
 * `class="current"`.
 */
export function page(input: {
  title: string;
  root: string;
  nav: NavItem[];
  sections: Section[];
  current?: string;
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
              `<li><a${item.href === input.current ? ' class="current"' : ""} href="${esc(item.href)}">${esc(item.label)}</a></li>`,
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
<link rel="stylesheet" href="${esc(input.root)}assets/app.css">
<!-- The pattern is "/*", not a prefix built from the page's root: prefetch
     is same-origin by default, and every link this site emits is relative,
     so "/*" already covers every internal link without the build needing to
     know its own deployment subpath (GitHub Pages serves this project under
     one). -->
<script type="speculationrules">
{"prefetch":[{"where":{"href_matches":"/*"},"eagerness":"moderate"}]}
</script>
</head>
<body data-root="${esc(input.root)}">
<a class="skip" href="#main">Skip to content</a>
<header class="topbar">
<a class="brand" href="${esc(href.overview(input.root))}">LEAP</a>
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
<script type="module" src="${esc(input.root)}assets/boot.js"></script>
</body>
</html>`;
}
