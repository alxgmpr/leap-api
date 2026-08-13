import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { buildRequestFrame, renderNdjson } from "../lib/site/frames.ts";
import { composeFrame } from "../site-src/compose.js";
import { getTransport } from "../site-src/transport.js";

describe("client composer", () => {
  test("agrees byte for byte with the generator for a bodyless read", () => {
    assert.equal(
      composeFrame({
        url: "/zone/status",
        communiqueType: "ReadRequest",
        clientTag: "lt-1",
      }),
      renderNdjson(
        buildRequestFrame({
          url: "/zone/status",
          communiqueType: "ReadRequest",
        }),
      ),
    );
  });

  test("agrees byte for byte for a wrapped command payload", () => {
    const payload = {
      CommandType: "GoToDimmedLevel",
      DimmedLevelParameters: { Level: 50 },
    };
    assert.equal(
      composeFrame({
        url: "/zone/4664/commandprocessor",
        communiqueType: "CreateRequest",
        clientTag: "lt-1",
        wrapperKey: "Command",
        payload,
      }),
      renderNdjson(
        buildRequestFrame({
          url: "/zone/4664/commandprocessor",
          communiqueType: "CreateRequest",
          wrapperKey: "Command",
          payload,
        }),
      ),
    );
  });

  test("substitutes path parameters", () => {
    assert.match(
      composeFrame({
        url: "/zone/{zoneId}/commandprocessor",
        communiqueType: "CreateRequest",
        params: { zoneId: "4664" },
      }),
      /"Url":"\/zone\/4664\/commandprocessor"/,
    );
  });

  test("refuses a payload with no wrapper key, like the generator does", () => {
    assert.throws(
      () =>
        composeFrame({
          url: "/zone/1",
          communiqueType: "UpdateRequest",
          payload: { Name: "x" },
        }),
      /wrapper key/,
    );
  });

  test("no transport is available without a bridge", () => {
    assert.equal(getTransport(), null);
  });
});
