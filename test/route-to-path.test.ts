import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { describe } from "node:test";
import {
  disambiguatePath,
  type Route,
  routeToPathItem,
} from "../lib/route-to-path.ts";

describe("disambiguatePath", () => {
  test("names a single param after its preceding segment", () => {
    assert.equal(disambiguatePath("/zone/{id}"), "/zone/{zoneId}");
    assert.equal(disambiguatePath("/area/{xid}"), "/area/{areaXid}");
  });

  test("disambiguates repeated params", () => {
    assert.equal(
      disambiguatePath("/device/{id}/linknode/{id}"),
      "/device/{deviceId}/linknode/{linknodeId}",
    );
    assert.equal(
      disambiguatePath("/service/sonoshousehold/{id}/favorite/{id}/status"),
      "/service/sonoshousehold/{sonoshouseholdId}/favorite/{favoriteId}/status",
    );
  });

  test("leaves param-free paths untouched", () => {
    assert.equal(disambiguatePath("/zone/status"), "/zone/status");
  });
});

describe("routeToPathItem", () => {
  test("maps verbs to methods and records the communique type", () => {
    const { item } = routeToPathItem({
      ident: "ZoneID",
      path: "/zone/{id}",
      verbs: ["GET", "UPDATE"],
      handlers: {},
      responseType: "Zone",
    });
    assert.ok("get" in item);
    assert.ok("put" in item);
    assert.ok(!("post" in item));
    const get = item.get as Record<string, unknown>;
    assert.equal(get["x-leap-communique-type"], "ReadRequest");
    assert.equal(
      (item.put as Record<string, unknown>)["x-leap-communique-type"],
      "UpdateRequest",
    );
  });

  test("SUBSCRIBE flags the get operation instead of creating one", () => {
    const { item } = routeToPathItem({
      ident: "ZoneStatus",
      path: "/zone/status",
      verbs: ["GET", "SUBSCRIBE"],
      handlers: {},
      responseType: "ZoneStatuses",
    });
    assert.equal(Object.keys(item).filter((k) => k !== "parameters").length, 1);
    assert.equal(
      (item.get as Record<string, unknown>)["x-leap-subscribable"],
      true,
    );
  });

  test("SUBSCRIBE without GET does not invent an operation", () => {
    const { item } = routeToPathItem({
      ident: "Weird",
      path: "/weird",
      verbs: ["SUBSCRIBE"],
      handlers: {},
    });
    assert.deepEqual(Object.keys(item), []);
  });

  test("responseType becomes a 200 ref plus x-leap-body-type", () => {
    const { item } = routeToPathItem({
      ident: "ZoneID",
      path: "/zone/{id}",
      verbs: ["GET"],
      handlers: {},
      responseType: "Zone",
    });
    const get = item.get as Record<string, unknown>;
    assert.equal(get["x-leap-body-type"], "Zone");
    const response = (get.responses as Record<string, unknown>)[
      "200"
    ] as Record<string, unknown>;
    const content = (response.content as Record<string, unknown>)[
      "application/json"
    ] as Record<string, unknown>;
    const schema = content.schema as Record<string, unknown>;
    assert.equal(schema.$ref, "#/components/schemas/Zone");
  });

  test("a route with no responseType carries a TODO marker", () => {
    const { item } = routeToPathItem({
      ident: "Mystery",
      path: "/mystery",
      verbs: ["GET"],
      handlers: {},
    });
    const get = item.get as Record<string, unknown>;
    assert.match(String(get.description), /TODO\(response\)/);
  });

  test("emits a path parameter per placeholder", () => {
    const { item } = routeToPathItem({
      ident: "LinkNode",
      path: "/device/{id}/linknode/{id}",
      verbs: ["GET"],
      handlers: {},
    });
    const params = item.parameters as {
      name: string;
      in: string;
      required: boolean;
    }[];
    assert.deepEqual(
      params.map((p) => p.name),
      ["deviceId", "linknodeId"],
    );
    assert.ok(params.every((p) => p.in === "path" && p.required === true));
  });
});

describe("the real route corpus", () => {
  const routes: Route[] = JSON.parse(
    readFileSync("vendor/leap-routes.json", "utf8"),
  );

  test("every route maps without throwing, and paths stay unique", () => {
    const seen = new Set<string>();
    for (const r of routes) {
      const { path } = routeToPathItem(r);
      assert.ok(
        !seen.has(path),
        `duplicate path after disambiguation: ${path}`,
      );
      seen.add(path);
    }
    assert.equal(seen.size, routes.length);
  });

  test("no disambiguated path repeats a parameter name", () => {
    for (const r of routes) {
      const { path } = routeToPathItem(r);
      const names = [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      assert.equal(new Set(names).size, names.length, `dup param in ${path}`);
    }
  });
});
