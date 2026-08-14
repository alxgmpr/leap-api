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

  // A 557-page reference fails by linking somewhere that was never emitted.
  // Every href that is not a bare fragment, an external URL, or an asset must
  // name a page in this build.
  const built = new Set(pages.map((p) => p.path));
  for (const p of pages) {
    const dir = p.path.includes("/")
      ? `${p.path.slice(0, p.path.lastIndexOf("/"))}/`
      : "";
    for (const [, raw] of p.html.matchAll(/href="([^"]+)"/g)) {
      if (
        raw.startsWith("#") ||
        raw.startsWith("http") ||
        raw.startsWith("mailto:") ||
        raw.includes("assets/")
      )
        continue;
      const path = raw.split("#")[0];
      if (path === "") continue;
      // Resolve "../" against the linking page's own directory.
      const resolved = new URL(path, `http://x/${dir}`).pathname.slice(1);
      if (!built.has(resolved))
        throw new Error(`${p.path} links to ${resolved}, which is not built`);
    }
  }
}
