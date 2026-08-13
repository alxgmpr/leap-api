import { readFileSync } from "node:fs";
import { disambiguatePath, type Route } from "../route-to-path.ts";

/**
 * Why a firmware route is absent from this reference, which is not one
 * question but four. A reader looking up a route needs to know which.
 */
export type Absence =
  /**
   * The slashed form of this path is bundled. The extraction records
   * collection paths concatenated -- `/devicestatus` where the wire carries
   * `/device/status` -- and captures confirmed the slashed form, so the route
   * is represented under a corrected name rather than missing.
   */
  | "represented-corrected"
  /**
   * An `{xid}` route whose `{id}` twin is bundled. Both address the same
   * resource and the document cannot state two paths differing only in a
   * parameter name, so this is represented rather than missing.
   */
  | "represented-xid-twin"
  /**
   * Not covered, and the path can be taken at face value: no other route
   * shares a prefix that would suggest the extraction concatenated it.
   */
  | "uncovered"
  /**
   * Not covered, and the path itself is in doubt. Its first segment starts
   * with another resource's name, so it may be a concatenation the extraction
   * mangled -- `/areastatus` for `/area/status` -- or it may be exactly what
   * it says. Five such paths were proven mangled by captures; nothing
   * distinguishes these without asking hardware.
   */
  | "uncovered-path-in-doubt";

/**
 * Every way of inserting one slash inside a segment of a path.
 *
 * The extraction concatenates path segments, and not only the first one:
 * `/device/{id}/buttongroupexpanded` is the mangled spelling of
 * `/device/{id}/buttongroup/expanded`, which the refined tree already carries
 * hand-authored. Checking only the leading segment missed it, and the import
 * that followed collided with the refined operationId.
 */
export function slashedForms(path: string): string[] {
  const out: string[] = [];
  const segments = path.split("/");
  for (let i = 1; i < segments.length; i += 1) {
    const segment = segments[i];
    if (!segment || segment.startsWith("{")) continue;
    for (let cut = 1; cut < segment.length; cut += 1)
      out.push(
        [
          ...segments.slice(0, i),
          segment.slice(0, cut),
          segment.slice(cut),
          ...segments.slice(i + 1),
        ].join("/"),
      );
  }
  return out;
}

export type UncoveredRoute = {
  path: string;
  verbs: string[];
  responseType: string | null;
  absence: Absence;
  /** The slashed reading, when one is plausible. Never asserted as correct. */
  slashedReading: string | null;
  resource: string;
};

/** Every route template the firmware extraction recovered. */
export function readRoutes(routesFile?: string): Route[] {
  return JSON.parse(
    readFileSync(routesFile ?? "vendor/leap-routes.json", "utf8"),
  ) as Route[];
}

export function classifyRoutes(input: {
  bundledPaths: Set<string>;
  routesFile?: string;
}): UncoveredRoute[] {
  const routes = readRoutes(input.routesFile);

  const firstSegments = new Set(
    routes.map((route) => route.path.split("/")[1]).filter(Boolean),
  );
  const segmentCounts = new Map<string, number>();
  for (const route of routes) {
    const segment = route.path.split("/")[1] ?? "";
    segmentCounts.set(segment, (segmentCounts.get(segment) ?? 0) + 1);
  }

  const out: UncoveredRoute[] = [];
  for (const route of routes) {
    const path = disambiguatePath(route.path);
    if (input.bundledPaths.has(path)) continue;

    const segment = route.path.split("/")[1] ?? "";
    const prefix = [...firstSegments].find(
      (candidate) =>
        candidate !== segment &&
        segment.startsWith(candidate) &&
        segment.length > candidate.length,
    );
    const slashed = prefix
      ? disambiguatePath(
          `/${prefix}/${segment.slice(prefix.length)}${route.path.slice(segment.length + 1)}`,
        )
      : null;

    // An {xid} route is represented when its {id} twin is bundled, and also
    // when that twin is merely another route in the extraction: importing both
    // would put two paths differing only in a parameter name into the
    // document, which OpenAPI forbids and redocly's no-identical-paths rule is
    // configured to treat as a hard error.
    const idTwin = disambiguatePath(route.path.replaceAll("{xid}", "{id}"));
    const idTwinExists =
      input.bundledPaths.has(idTwin) ||
      routes.some((other) => disambiguatePath(other.path) === idTwin);

    // The concatenation is not always in the leading segment:
    // /device/{id}/buttongroupexpanded is the mangled spelling of
    // /device/{id}/buttongroup/expanded, which the refined tree already
    // carries hand-authored.
    const correctedElsewhere = slashedForms(path).find((form) =>
      input.bundledPaths.has(form),
    );

    let absence: Absence;
    if (route.path.includes("{xid}") && idTwinExists)
      absence = "represented-xid-twin";
    else if (correctedElsewhere) absence = "represented-corrected";
    else if (prefix && (segmentCounts.get(segment) ?? 0) === 1)
      // Only this one route uses the segment, so nothing corroborates that it
      // is a resource rather than a concatenation.
      absence = "uncovered-path-in-doubt";
    else absence = "uncovered";

    out.push({
      path,
      verbs: route.verbs,
      responseType: route.responseType ?? null,
      absence,
      slashedReading: absence === "uncovered-path-in-doubt" ? slashed : null,
      resource: segment,
    });
  }

  return out.sort((a, b) => a.path.localeCompare(b.path));
}

export type AbsenceSummary = Record<Absence, number>;

export function summarize(routes: UncoveredRoute[]): AbsenceSummary {
  const summary: AbsenceSummary = {
    "represented-corrected": 0,
    "represented-xid-twin": 0,
    uncovered: 0,
    "uncovered-path-in-doubt": 0,
  };
  for (const route of routes) summary[route.absence] += 1;
  return summary;
}
