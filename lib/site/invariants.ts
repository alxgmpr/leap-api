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
}
