import { existsSync, readFileSync } from "node:fs";
import { parse } from "yaml";
import { type Coverage, computeCoverage } from "../../tools/check-coverage.ts";
import { FRAME_FIXTURES } from "../observed-census.ts";
import { templatePath } from "../platform-matrix.ts";
import { type CommandRow, parseCommandTable } from "./command-table.ts";
import {
  buildRequestFrame,
  type Frame,
  frameFromLog,
  frameFromProbe,
  responseCommuniqueType,
} from "./frames.ts";
import { type Edge, resolveEdges, type SchemaNode } from "./graph.ts";
import {
  classifyOperation,
  type Observation,
  type Provenance,
} from "./provenance.ts";

export type Operation = {
  url: string;
  communiqueType: string;
  /** Retained for cross-referencing dist/openapi.yaml. Demoted in the UI. */
  httpVerb: string;
  operationId: string;
  summary: string | null;
  description: string | null;
  bodyType: string | null;
  requestSchema: string | null;
  responseSchema: string | null;
  subscribable: boolean;
  eventSchema: string | null;
  request: Frame;
  responses: Frame[];
  provenance: Provenance;
};

export type Resource = { name: string; operations: Operation[]; edges: Edge[] };

export type SchemaEntry = { name: string; node: SchemaNode; usedBy: string[] };

export type DocPage = { slug: string; title: string; markdown: string };

export type FrameLog = { id: string; note: string; frames: Frame[] };

export type LeapModel = {
  resources: Resource[];
  schemas: SchemaEntry[];
  docs: DocPage[];
  commandTable: CommandRow[];
  frameLogs: FrameLog[];
  coverage: Coverage;
};

const HTTP_VERBS = ["get", "post", "put", "delete"] as const;

const DOC_TITLES: Record<string, string> = {
  protocol: "The wire protocol",
  mapping: "Mapping LEAP onto OpenAPI",
  subscriptions: "Subscriptions",
  platforms: "Platform divergence",
  discovery: "Discovery and pairing",
};

type Probe = { status: string; body?: unknown };

function refName(node: unknown): string | null {
  const ref = (node as SchemaNode | null)?.$ref;
  return typeof ref === "string" ? (ref.split("/").pop() as string) : null;
}

function okSchemaName(operation: SchemaNode): string | null {
  const responses = operation.responses as
    | Record<string, SchemaNode>
    | undefined;
  const content = responses?.["200"]?.content as
    | Record<string, SchemaNode>
    | undefined;
  return refName(content?.["application/json"]?.schema);
}

function requestSchemaName(operation: SchemaNode): string | null {
  const body = operation.requestBody as SchemaNode | undefined;
  const content = body?.content as Record<string, SchemaNode> | undefined;
  return refName(content?.["application/json"]?.schema);
}

function loadCorpora(): { corpus: string; probes: Record<string, Probe> }[] {
  const manifest: { label: string; to: string }[] = existsSync("captures.json")
    ? JSON.parse(readFileSync("captures.json", "utf8"))
    : [];
  return manifest
    .filter((entry) => existsSync(entry.to))
    .map((entry) => ({
      corpus: entry.label,
      probes: JSON.parse(readFileSync(entry.to, "utf8")),
    }));
}

/**
 * Frame-log fixtures, flattened to `{id, note, frames}` regardless of file
 * shape -- push-probe is one run at the top level, push-experiments is keyed
 * by run name, late-frames is a bare array.
 */
function loadFrameLogs(): FrameLog[] {
  const logs: FrameLog[] = [];
  for (const path of FRAME_FIXTURES) {
    if (!existsSync(path)) continue;
    const id = (path.split("/").pop() as string).replace(".json", "");
    const raw = JSON.parse(readFileSync(path, "utf8"));
    const runs: [string, unknown][] = Array.isArray(raw)
      ? [[id, { frames: raw }]]
      : Array.isArray((raw as { frames?: unknown }).frames)
        ? [[id, raw]]
        : Object.entries(raw as Record<string, unknown>);
    for (const [runId, run] of runs) {
      const entries = (run as { frames?: unknown[] }).frames;
      if (!Array.isArray(entries)) continue;
      logs.push({
        id: runId,
        note: String((run as { note?: unknown }).note ?? ""),
        frames: entries
          .filter(
            (
              e,
            ): e is {
              communiqueType: string;
              header: Record<string, unknown>;
            } =>
              typeof (e as { communiqueType?: unknown })?.communiqueType ===
                "string" && !!(e as { header?: unknown })?.header,
          )
          .map((e) => frameFromLog(e, path)),
      });
    }
  }
  return logs;
}

/**
 * Probes indexed once by templated path. Scanning every corpus per path
 * instead would be 211 paths x ~5,000 probe entries on every build.
 */
function indexProbes(
  corpora: { corpus: string; probes: Record<string, Probe> }[],
): Map<string, { corpus: string; probe: Probe }[]> {
  const index = new Map<string, { corpus: string; probe: Probe }[]>();
  for (const { corpus, probes } of corpora)
    for (const [concrete, probe] of Object.entries(probes)) {
      const path = templatePath(concrete);
      const hits = index.get(path);
      if (hits) hits.push({ corpus, probe });
      else index.set(path, [{ corpus, probe }]);
    }
  return index;
}

export function buildModel(): LeapModel {
  const doc = parse(readFileSync("dist/openapi.yaml", "utf8")) as {
    paths: Record<string, SchemaNode>;
    components: { schemas: Record<string, SchemaNode> };
  };
  const schemas = doc.components.schemas;
  const corpora = loadCorpora();
  const probeIndex = indexProbes(corpora);

  /** Distinct corpus/status pairs observed for a path, for the provenance chip. */
  const observationsFor = (path: string): Observation[] => {
    const seen = new Set<string>();
    const observations: Observation[] = [];
    for (const { corpus, probe } of probeIndex.get(path) ?? []) {
      const key = `${corpus} ${probe.status}`;
      if (seen.has(key)) continue;
      seen.add(key);
      observations.push({ corpus, status: probe.status });
    }
    return observations;
  };

  /** One captured 200 per corpus, first instance wins. */
  const capturesFor = (path: string): { corpus: string; capture: Probe }[] => {
    const byCorpus = new Map<string, Probe>();
    for (const { corpus, probe } of probeIndex.get(path) ?? [])
      if (probe.status.startsWith("200") && !byCorpus.has(corpus))
        byCorpus.set(corpus, probe);
    return [...byCorpus.entries()].map(([corpus, capture]) => ({
      corpus,
      capture,
    }));
  };

  const responseSchemaByPath: Record<string, string> = {};
  const usedBy = new Map<string, string[]>();
  const byResource = new Map<string, Operation[]>();

  for (const [url, item] of Object.entries(doc.paths)) {
    const resource = url.split("/")[1] ?? "misc";
    const pathLevelSubscribable = item["x-leap-subscribable"] === true;
    let verbsFound = 0;

    for (const verb of HTTP_VERBS) {
      const operation = item[verb] as SchemaNode | undefined;
      if (!operation) continue;
      verbsFound += 1;

      const communiqueType = String(
        operation["x-leap-communique-type"] ?? "ReadRequest",
      );
      const responseSchema = okSchemaName(operation);
      const requestSchema = requestSchemaName(operation);
      if (verb === "get" && responseSchema)
        responseSchemaByPath[url] = responseSchema;
      for (const name of [responseSchema, requestSchema])
        if (name) usedBy.set(name, [...(usedBy.get(name) ?? []), url]);

      const bodyType =
        typeof operation["x-leap-body-type"] === "string"
          ? operation["x-leap-body-type"]
          : null;

      // Probe corpora only ever sent ReadRequest, so a captured body is
      // evidence for the GET on this URL and for nothing else -- attaching it
      // to a POST would label a write with a read's answer.
      const responses: Frame[] =
        verb === "get"
          ? capturesFor(url).map(({ corpus, capture }) =>
              frameFromProbe({
                url,
                communiqueType: responseCommuniqueType(communiqueType),
                bodyType: bodyType ?? undefined,
                capture,
                source: corpus,
              }),
            )
          : [];

      byResource.set(resource, [
        ...(byResource.get(resource) ?? []),
        {
          url,
          communiqueType,
          httpVerb: verb,
          operationId: String(operation.operationId ?? ""),
          summary: (operation.summary as string | undefined) ?? null,
          description: (operation.description as string | undefined) ?? null,
          bodyType,
          requestSchema,
          responseSchema,
          subscribable:
            operation["x-leap-subscribable"] === true || pathLevelSubscribable,
          eventSchema: refName(operation["x-leap-event-schema"]),
          request: buildRequestFrame({
            url,
            communiqueType,
            wrapperKey: requestSchema ?? undefined,
            payload: requestSchema ? {} : undefined,
          }),
          responses,
          provenance: classifyOperation({
            url,
            description: operation.description as string | undefined,
            observations: observationsFor(url),
          }),
        },
      ]);
    }

    // A subscribe-only route has no HTTP verb to hang an operation on --
    // /device/status/deviceheard is SUBSCRIBE and nothing else in the firmware
    // route table, so OpenAPI carries it as a bare path item. This site is not
    // organized by verb, so it is an operation here like any other.
    if (verbsFound === 0 && pathLevelSubscribable) {
      byResource.set(resource, [
        ...(byResource.get(resource) ?? []),
        {
          url,
          communiqueType: "SubscribeRequest",
          httpVerb: "",
          operationId: "",
          summary: (item.summary as string | undefined) ?? null,
          description: (item.description as string | undefined) ?? null,
          bodyType: null,
          requestSchema: null,
          responseSchema: null,
          subscribable: true,
          eventSchema: refName(item["x-leap-event-schema"]),
          request: buildRequestFrame({
            url,
            communiqueType: "SubscribeRequest",
          }),
          responses: [],
          provenance: classifyOperation({
            url,
            description: item.description as string | undefined,
            observations: observationsFor(url),
          }),
        },
      ]);
    }
  }

  const edges = resolveEdges({
    schemas,
    responseSchemaByPath,
    captures: corpora,
  });

  const resources: Resource[] = [...byResource.entries()]
    .map(([name, operations]) => ({
      name,
      operations: operations.sort((a, b) => a.url.localeCompare(b.url)),
      edges: edges.filter((edge) =>
        operations.some(
          (o) =>
            o.responseSchema === edge.schema || o.requestSchema === edge.schema,
        ),
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const docs: DocPage[] = Object.keys(DOC_TITLES)
    .filter((slug) => existsSync(`docs/${slug}.md`))
    .map((slug) => ({
      slug,
      title: DOC_TITLES[slug] as string,
      markdown: readFileSync(`docs/${slug}.md`, "utf8"),
    }));

  return {
    resources,
    schemas: Object.entries(schemas)
      .map(([name, node]) => ({ name, node, usedBy: usedBy.get(name) ?? [] }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    docs,
    commandTable: parseCommandTable(
      String((schemas.Command as SchemaNode | undefined)?.description ?? ""),
    ),
    frameLogs: loadFrameLogs(),
    coverage: computeCoverage(),
  };
}
