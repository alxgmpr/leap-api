import { esc } from "./html.ts";

export type Page = { path: string; html: string };

export type NavItem = { href: string; label: string; group?: string };

/**
 * Full HTML document. `relativeRoot` is the prefix back to site root ("" at
 * root, "../../" two levels down) -- GitHub Pages serves this project under a
 * subpath, so every link must be relative.
 */
export function page(input: {
  title: string;
  relativeRoot: string;
  nav: NavItem[];
  main: string;
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
              `<li><a href="${esc(input.relativeRoot)}${esc(item.href)}">${esc(item.label)}</a></li>`,
          )
          .join("")}</ul>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(input.title)} — LEAP</title>
<link rel="stylesheet" href="${esc(input.relativeRoot)}assets/app.css">
</head>
<body data-root="${esc(input.relativeRoot)}">
<a class="skip" href="#main">Skip to content</a>
<header class="topbar">
<a class="brand" href="${esc(input.relativeRoot)}index.html">LEAP</a>
<div class="searchwrap">
<input id="search" class="search" type="search" placeholder="Search resources, schemas, commands" autocomplete="off">
<ul id="search-results" class="search-results" hidden></ul>
</div>
<label class="filter"><input id="confirmed-only" type="checkbox"> Hardware-confirmed only</label>
</header>
<div class="shell">
<nav class="sidebar">${nav}</nav>
<main id="main">${input.main}</main>
</div>
<script type="module" src="${esc(input.relativeRoot)}assets/boot.js"></script>
</body>
</html>`;
}
