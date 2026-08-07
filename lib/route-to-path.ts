export type Route = {
  ident: string;
  path: string;
  verbs: string[];
  handlers: Record<string, string>;
  responseType?: string;
};

const VERB_TO_METHOD: Record<string, string> = {
  GET: "get",
  CREATE: "post",
  UPDATE: "put",
  DELETE: "delete",
};

const VERB_TO_COMMUNIQUE: Record<string, string> = {
  GET: "ReadRequest",
  CREATE: "CreateRequest",
  UPDATE: "UpdateRequest",
  DELETE: "DeleteRequest",
};

/**
 * OpenAPI forbids two path parameters with the same name in one path, but the
 * firmware routes reuse `{id}` — for example `/device/{id}/linknode/{id}`.
 * Rename each placeholder after the segment preceding it.
 */
export function disambiguatePath(path: string): string {
  const segments = path.split("/");
  return segments
    .map((seg, i) => {
      const m = /^\{(id|xid)\}$/.exec(seg);
      if (!m) return seg;
      const owner = segments[i - 1] ?? "resource";
      const suffix = m[1] === "id" ? "Id" : "Xid";
      return `{${owner}${suffix}}`;
    })
    .join("/");
}

function pathParameters(path: string) {
  return [...path.matchAll(/\{(\w+)\}/g)].map((m) => ({
    name: m[1],
    in: "path",
    required: true,
    schema: { type: "string" },
  }));
}

export function routeToPathItem(route: Route): {
  path: string;
  item: Record<string, unknown>;
} {
  const path = disambiguatePath(route.path);
  const item: Record<string, unknown> = {};

  for (const verb of route.verbs) {
    const method = VERB_TO_METHOD[verb];
    if (!method) continue; // SUBSCRIBE is handled below, not as an operation.

    const op: Record<string, unknown> = {
      operationId: `${verb.toLowerCase()}${route.ident}`,
      tags: [path.split("/")[1] ?? "misc"],
      "x-leap-communique-type": VERB_TO_COMMUNIQUE[verb],
    };

    if (route.responseType) {
      op["x-leap-body-type"] = route.responseType;
      op.responses = {
        "200": {
          description: "Success",
          content: {
            "application/json": {
              schema: { $ref: `#/components/schemas/${route.responseType}` },
            },
          },
        },
      };
    } else {
      op.description =
        "TODO(response): no responseType recovered from the firmware extraction";
      op.responses = { "200": { description: "Success" } };
    }

    item[method] = op;
  }

  // SUBSCRIBE annotates the get operation when present; otherwise the path item.
  //
  // When a route has no GET operation, subscribable markers go on the path item
  // as siblings of any other operations (e.g., POST, PUT, DELETE). This handles
  // two cases: SUBSCRIBE-only routes (pure notification channels where a
  // ReadRequest does not work), and routes like /area (CREATE+SUBSCRIBE) where
  // a non-read operation exists but there's still no GET. Either way, subscribers
  // receive bodies of responseType and that fact is recorded in the document.
  if (route.verbs.includes("SUBSCRIBE")) {
    const target = (item.get ?? item) as Record<string, unknown>;
    target["x-leap-subscribable"] = true;
    if (route.responseType) {
      target["x-leap-event-schema"] = {
        $ref: `#/components/schemas/${route.responseType}`,
      };
    }
  }

  const params = pathParameters(path);
  // Only emit parameters if there is at least one real HTTP operation
  const hasOperation =
    "get" in item || "post" in item || "put" in item || "delete" in item;
  if (params.length > 0 && hasOperation) {
    item.parameters = params;
  }

  return { path, item };
}
