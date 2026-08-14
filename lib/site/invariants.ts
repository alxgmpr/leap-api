import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { bodyWrapperKey } from "./frames.ts";
import type { LeapModel } from "./model.ts";
import type { Page } from "./render/layout.ts";

/**
 * RA3's read of /button returns a bare {} -- an empty object has no key to
 * wrap. The one known exception to the single-key-wrapper rule, per
 * docs/protocol.md, and the same case test/conformance.test.ts carves out.
 */
function isKnownBareBody(body: Record<string, unknown>): boolean {
  return Object.keys(body).length === 0;
}

/** Refuse to ship a site that misrepresents the wire. */
export function assertInvariants(model: LeapModel, pages: Page[]): void {
  for (const resource of model.resources)
    for (const operation of resource.operations)
      for (const frame of [operation.request, ...operation.responses]) {
        if (!frame.fidelity)
          throw new Error(`${operation.url}: frame has no fidelity level`);
        if (
          frame.Body &&
          !isKnownBareBody(frame.Body) &&
          !bodyWrapperKey(frame.Body)
        )
          throw new Error(
            `${operation.url}: Body is not a single-key wrapper -- ${JSON.stringify(
              Object.keys(frame.Body),
            )}`,
          );
      }

  const commandType = parse(
    readFileSync("spec/components/schemas/CommandType.yaml", "utf8"),
  ) as { enum: string[] };
  if (model.commandTable.length !== commandType.enum.length)
    throw new Error(
      `CommandType table has ${model.commandTable.length} rows for ${commandType.enum.length} enum members`,
    );

  const doc = parse(readFileSync("dist/openapi.yaml", "utf8")) as {
    paths: Record<string, unknown>;
  };
  const rendered = new Set(
    model.resources.flatMap((r) => r.operations.map((o) => o.url)),
  );
  for (const url of Object.keys(doc.paths))
    if (!rendered.has(url)) throw new Error(`${url} has no page`);

  const duplicates = pages
    .map((p) => p.path)
    .filter((path, index, all) => all.indexOf(path) !== index);
  if (duplicates.length > 0)
    throw new Error(`duplicate page paths: ${duplicates.join(", ")}`);

  // The whole reference is one document, so every anchor shares one id space:
  // doc headings, operation ids, resource and schema sections. A collision
  // silently hijacks deep links.
  for (const p of pages) {
    const ids = [...p.html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    const clashes = [
      ...new Set(ids.filter((id, index) => ids.indexOf(id) !== index)),
    ];
    if (clashes.length > 0)
      throw new Error(
        `duplicate element ids in ${p.path}: ${clashes.join(", ")}`,
      );
  }

  // A 557-page reference fails two ways: linking somewhere that was never
  // emitted, or linking at a fragment nothing on the target page carries as
  // an id. Every href that is not an external URL or an asset must name a
  // page in this build, and if it carries a fragment, that fragment must be
  // one of that *target* page's own ids -- not just any id anywhere.
  //
  // Before R1, every cross-reference was a bare "#fragment" and the whole
  // single-page document was one id space, so the fragment half went
  // unchecked here on the assumption a same-page browser jump either lands
  // or doesn't. After R1 almost every reference names its target page
  // explicitly, so the id space is per page: a stale or mistyped fragment
  // would otherwise still pass (the page it names exists), silently landing
  // nowhere on that page.
  const built = new Set(pages.map((p) => p.path));
  const idsByPage = new Map<string, Set<string>>(
    pages.map((p) => [
      p.path,
      new Set(
        [...p.html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1] as string),
      ),
    ]),
  );
  for (const p of pages) {
    const dir = p.path.includes("/")
      ? `${p.path.slice(0, p.path.lastIndexOf("/"))}/`
      : "";
    for (const [, raw] of p.html.matchAll(/href="([^"]+)"/g)) {
      if (
        raw.startsWith("http") ||
        raw.startsWith("mailto:") ||
        raw.includes("assets/")
      )
        continue;
      const [rawPath, fragment] = raw.split("#") as [
        string,
        string | undefined,
      ];
      // A bare "#fragment" targets the linking page itself; anything else
      // resolves "../" against that page's own directory.
      const target =
        rawPath === ""
          ? p.path
          : new URL(rawPath, `http://x/${dir}`).pathname.slice(1);
      if (!built.has(target))
        throw new Error(`${p.path} links to ${target}, which is not built`);
      if (fragment !== undefined && !idsByPage.get(target)?.has(fragment))
        throw new Error(
          `${p.path} links to ${target}#${fragment}, which has no matching id`,
        );
    }
  }
}
