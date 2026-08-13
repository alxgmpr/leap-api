import assert from "node:assert/strict";
import test, { describe } from "node:test";
import {
  bodyWrapperKey,
  buildRequestFrame,
  frameFromLog,
  frameFromProbe,
  renderNdjson,
  responseCommuniqueType,
} from "../lib/site/frames.ts";

describe("frames", () => {
  test("maps a request CommuniqueType to its response", () => {
    assert.equal(responseCommuniqueType("ReadRequest"), "ReadResponse");
    assert.equal(
      responseCommuniqueType("SubscribeRequest"),
      "SubscribeResponse",
    );
    assert.throws(() => responseCommuniqueType("Nonsense"), /Nonsense/);
  });

  test("a bodyless request has no Body key at all", () => {
    const frame = buildRequestFrame({
      url: "/zone/status",
      communiqueType: "ReadRequest",
    });
    assert.equal(frame.Body, undefined);
    assert.equal(frame.fidelity, "constructed");
    assert.equal(
      renderNdjson(frame),
      '{"CommuniqueType":"ReadRequest","Header":{"Url":"/zone/status","ClientTag":"lt-1"}}',
    );
  });

  test("a request payload is wrapped under its wrapper key", () => {
    const frame = buildRequestFrame({
      url: "/zone/4664/commandprocessor",
      communiqueType: "CreateRequest",
      wrapperKey: "Command",
      payload: { CommandType: "GoToDimmedLevel" },
    });
    assert.deepEqual(frame.Body, {
      Command: { CommandType: "GoToDimmedLevel" },
    });
    assert.equal(bodyWrapperKey(frame.Body), "Command");
  });

  test("a payload with no wrapper key is a build error, not a bare Body", () => {
    assert.throws(
      () =>
        buildRequestFrame({
          url: "/zone/1",
          communiqueType: "UpdateRequest",
          payload: { Name: "x" },
        }),
      /wrapper key/,
    );
  });

  test("a probe body is already wrapped and is never re-wrapped", () => {
    const frame = frameFromProbe({
      url: "/zone/status",
      communiqueType: "ReadResponse",
      bodyType: "ZoneStatuses",
      capture: { status: "200 OK", body: { ZoneStatuses: [{ Level: 100 }] } },
      source: "ra3",
    });
    assert.deepEqual(frame.Body, { ZoneStatuses: [{ Level: 100 }] });
    assert.equal(frame.fidelity, "captured-body");
    assert.equal(frame.source, "ra3");
    assert.equal(frame.Header.StatusCode, "200 OK");
  });

  test("a 204 probe with no body renders no Body key", () => {
    const frame = frameFromProbe({
      url: "/area/occupancysettings",
      communiqueType: "ReadResponse",
      capture: { status: "204 NoContent" },
      source: "caseta",
    });
    assert.equal(frame.Body, undefined);
  });

  test("a frame log entry keeps every header verbatim", () => {
    const frame = frameFromLog(
      {
        communiqueType: "ReadResponse",
        header: {
          MessageBodyType: "MultipleZoneStatus",
          StatusCode: "200 OK",
          Url: "/zone/status",
          ClientTag: "lt-18",
        },
        body: { ZoneStatuses: [] },
      },
      "fixtures/push-probe.json",
    );
    assert.equal(frame.fidelity, "captured-frame");
    assert.equal(frame.Header.ClientTag, "lt-18");
    assert.equal(frame.Header.MessageBodyType, "MultipleZoneStatus");
  });

  test("NDJSON is one line, in wire key order", () => {
    const line = renderNdjson(
      frameFromLog(
        {
          communiqueType: "ReadResponse",
          header: { StatusCode: "200 OK", Url: "/zone/1", ClientTag: "lt-2" },
          body: { Zone: {} },
        },
        "fixtures/push-probe.json",
      ),
    );
    assert.ok(!line.includes("\n"));
    assert.match(
      line,
      /^\{"CommuniqueType":"ReadResponse","Header":\{.*\},"Body":/,
    );
  });

  test("bodyWrapperKey rejects a multi-key Body", () => {
    assert.equal(bodyWrapperKey({ A: 1, B: 2 }), null);
    assert.equal(bodyWrapperKey({}), null);
  });
});
