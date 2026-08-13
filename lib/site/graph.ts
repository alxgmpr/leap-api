import { templatePath } from "../platform-matrix.ts";
import { bodyWrapperKey } from "./frames.ts";

export type SchemaNode = Record<string, unknown>;

export type Edge = {
  schema: string;
  property: string;
  /** Resource name the href points at, e.g. "area". Null when no capture ever populated it. */
  target: string | null;
  observedHref: string | null;
  corpus: string | null;
};

function refName(node: unknown): string | null {
  const ref = (node as SchemaNode | null)?.$ref;
  return typeof ref === "string" ? (ref.split("/").pop() as string) : null;
}

/** Property names on a schema that are HyperReference links. */
function linkProperties(schema: SchemaNode | undefined): string[] {
  const properties = schema?.properties as Record<string, unknown> | undefined;
  if (!properties) return [];
  return Object.entries(properties)
    .filter(([, node]) => refName(node) === "HyperReference")
    .map(([name]) => name);
}

/**
 * Resolve href relationships from captured data.
 *
 * Every HyperReference property becomes an edge. Targets come only from real
 * captured href values -- inferring `Zone.Device -> /device` from the property
 * name is a guess, and this project does not ship guesses. An edge no corpus
 * ever populated keeps a null target and renders as unresolved.
 */
export function resolveEdges(input: {
  schemas: Record<string, SchemaNode>;
  /** Bundled path -> the schema name its 200 response returns. */
  responseSchemaByPath: Record<string, string>;
  captures: {
    corpus: string;
    probes: Record<string, { status: string; body?: unknown }>;
  }[];
}): Edge[] {
  const edges = new Map<string, Edge>();
  for (const [schema, node] of Object.entries(input.schemas))
    for (const property of linkProperties(node))
      edges.set(`${schema}.${property}`, {
        schema,
        property,
        target: null,
        observedHref: null,
        corpus: null,
      });

  for (const { corpus, probes } of input.captures) {
    for (const [concrete, result] of Object.entries(probes)) {
      if (!result.status.startsWith("200") || !result.body) continue;
      const schemaName = input.responseSchemaByPath[templatePath(concrete)];
      if (!schemaName) continue;

      const declared = input.schemas[schemaName];
      const elementName =
        declared?.type === "array" ? refName(declared.items) : schemaName;
      if (!elementName) continue;
      const properties = linkProperties(input.schemas[elementName]);
      if (properties.length === 0) continue;

      const key = bodyWrapperKey(result.body);
      if (!key) continue;
      const payload = (result.body as Record<string, unknown>)[key];
      const instances = Array.isArray(payload) ? payload : [payload];

      for (const instance of instances) {
        if (!instance || typeof instance !== "object") continue;
        for (const property of properties) {
          const edge = edges.get(`${elementName}.${property}`);
          if (!edge || edge.target) continue; // first observation wins
          const href = (
            (instance as Record<string, unknown>)[property] as
              | Record<string, unknown>
              | undefined
          )?.href;
          if (typeof href !== "string") continue;
          const segment = href.split("/")[1];
          if (!segment) continue;
          edge.target = segment;
          edge.observedHref = href;
          edge.corpus = corpus;
        }
      }
    }
  }

  return [...edges.values()];
}
