import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { resolveEdges } from "../lib/site/graph.ts";

const HYPER = { $ref: "#/components/schemas/HyperReference" };

describe("href graph", () => {
  const schemas = {
    Area: {
      type: "object",
      properties: { href: { type: "string" }, Parent: HYPER },
    },
    Areas: { type: "array", items: { $ref: "#/components/schemas/Area" } },
    Zone: { type: "object", properties: { Device: HYPER } },
    HyperReference: {
      type: "object",
      properties: { href: { type: "string" } },
    },
  };

  test("resolves a target from a captured href", () => {
    const edges = resolveEdges({
      schemas,
      responseSchemaByPath: { "/area": "Areas" },
      captures: [
        {
          corpus: "ra3",
          probes: {
            "/area": {
              status: "200 OK",
              body: {
                Areas: [
                  { href: "/area/3" },
                  { href: "/area/32", Parent: { href: "/area/3" } },
                ],
              },
            },
          },
        },
      ],
    });
    const edge = edges.find(
      (e) => e.schema === "Area" && e.property === "Parent",
    );
    assert.equal(edge?.target, "area");
    assert.equal(edge?.observedHref, "/area/3");
    assert.equal(edge?.corpus, "ra3");
  });

  test("an unobserved link resolves to nothing, never to its property name", () => {
    const edges = resolveEdges({
      schemas,
      responseSchemaByPath: {},
      captures: [],
    });
    const edge = edges.find(
      (e) => e.schema === "Zone" && e.property === "Device",
    );
    assert.ok(
      edge,
      "the edge still exists, so the UI can show it as unresolved",
    );
    assert.equal(edge?.target, null);
    assert.equal(edge?.observedHref, null);
  });

  test("ignores non-200 captures", () => {
    const edges = resolveEdges({
      schemas,
      responseSchemaByPath: { "/area": "Areas" },
      captures: [
        {
          corpus: "ra3",
          probes: {
            "/area": {
              status: "400 BadRequest",
              body: { Areas: [{ Parent: { href: "/area/3" } }] },
            },
          },
        },
      ],
    });
    assert.equal(
      edges.find((e) => e.schema === "Area" && e.property === "Parent")?.target,
      null,
    );
  });

  test("templates concrete probe paths so instance captures join their route", () => {
    const edges = resolveEdges({
      schemas,
      responseSchemaByPath: { "/area/{areaId}": "Area" },
      captures: [
        {
          corpus: "ra3",
          probes: {
            "/area/32": {
              status: "200 OK",
              body: { Area: { Parent: { href: "/area/3" } } },
            },
          },
        },
      ],
    });
    assert.equal(
      edges.find((e) => e.schema === "Area" && e.property === "Parent")?.target,
      "area",
    );
  });
});
