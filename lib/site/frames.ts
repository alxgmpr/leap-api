/**
 * How much of a rendered frame is real.
 *
 * The probe corpora and the frame logs are not equally informative: a probe
 * corpus records `{status, body}` and nothing else, so a frame built from one
 * has real content in two header fields and convention in the rest. Marking
 * that difference is the point -- a reader must never mistake a constructed
 * example for observed behaviour.
 */
export type Fidelity =
  /** Whole frame captured, every header real (frame-log fixtures). */
  | "captured-frame"
  /** StatusCode and Body captured; other headers supplied by convention (probe corpora). */
  | "captured-body"
  /** Nothing captured; synthesized from the schema. */
  | "constructed";

export type FrameHeader = {
  MessageBodyType?: string;
  StatusCode?: string;
  Url: string;
  ClientTag: string;
};

export type Frame = {
  CommuniqueType: string;
  Header: FrameHeader;
  /** The wire `Body` -- the `{"<MessageBodyType>": payload}` wrapper, not the payload. */
  Body?: Record<string, unknown>;
  fidelity: Fidelity;
  /** Corpus label or fixture path. Null for constructed frames. */
  source: string | null;
  /** Frame-log frames only: milliseconds into the captured session. */
  atMs?: number;
  /**
   * Frame-log frames only: milliseconds after *this frame's own request*.
   * Distinct from `atMs` -- late-frames.json records a per-request delay, not
   * a position on a session clock, so the two must not be differenced.
   */
  delayMs?: number;
  /** Frame-log frames only: the log classified this as a push, not a reply. */
  pushed?: boolean;
};

const RESPONSE_TYPE: Record<string, string> = {
  ReadRequest: "ReadResponse",
  CreateRequest: "CreateResponse",
  UpdateRequest: "UpdateResponse",
  DeleteRequest: "DeleteResponse",
  SubscribeRequest: "SubscribeResponse",
  UnsubscribeRequest: "UnsubscribeResponse",
};

export function responseCommuniqueType(requestType: string): string {
  const type = RESPONSE_TYPE[requestType];
  if (!type)
    throw new Error(`no response CommuniqueType known for ${requestType}`);
  return type;
}

/** The single key a wire `Body` wraps its payload under, or null if it isn't a single-key wrapper. */
export function bodyWrapperKey(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const keys = Object.keys(body as Record<string, unknown>);
  return keys.length === 1 ? (keys[0] as string) : null;
}

export function buildRequestFrame(input: {
  url: string;
  communiqueType: string;
  clientTag?: string;
  /** The schema name the payload is wrapped under, e.g. `Command`. */
  wrapperKey?: string;
  payload?: unknown;
}): Frame {
  const frame: Frame = {
    CommuniqueType: input.communiqueType,
    Header: { Url: input.url, ClientTag: input.clientTag ?? "lt-1" },
    fidelity: "constructed",
    source: null,
  };
  if (input.payload !== undefined) {
    if (!input.wrapperKey)
      throw new Error(
        `request payload for ${input.url} has no wrapper key -- a bare Body would misrepresent the wire`,
      );
    frame.Body = { [input.wrapperKey]: input.payload };
  }
  return frame;
}

/**
 * A frame whose status and body come from a probe corpus. Those corpora record
 * `{status, body}` only, so CommuniqueType, MessageBodyType and ClientTag are
 * supplied here by convention -- hence `captured-body`, never `captured-frame`.
 * The stored body is already the wire wrapper and is passed through untouched.
 */
export function frameFromProbe(input: {
  url: string;
  communiqueType: string;
  bodyType?: string;
  clientTag?: string;
  capture: { status: string; body?: unknown };
  source: string;
}): Frame {
  const frame: Frame = {
    CommuniqueType: input.communiqueType,
    Header: {
      Url: input.url,
      ClientTag: input.clientTag ?? "lt-1",
      StatusCode: input.capture.status,
    },
    fidelity: "captured-body",
    source: input.source,
  };
  if (input.bodyType) frame.Header.MessageBodyType = input.bodyType;
  if (input.capture.body !== undefined && input.capture.body !== null)
    frame.Body = input.capture.body as Record<string, unknown>;
  return frame;
}

/** A frame from a frame-log fixture, where every header was captured. */
export function frameFromLog(
  entry: {
    communiqueType: string;
    header: Record<string, unknown>;
    body?: unknown;
    atMs?: unknown;
    receivedMsAfterSubscribe?: unknown;
    classification?: unknown;
  },
  source: string,
): Frame {
  const frame: Frame = {
    CommuniqueType: entry.communiqueType,
    Header: entry.header as unknown as FrameHeader,
    fidelity: "captured-frame",
    source,
  };
  if (entry.body !== undefined && entry.body !== null)
    frame.Body = entry.body as Record<string, unknown>;
  if (typeof entry.atMs === "number") frame.atMs = entry.atMs;
  // late-frames.json times its frames with receivedMsAfterSubscribe -- a
  // generic field name from the capture tool, not specific to subscriptions.
  // It is a delay after that frame's own request, so it is kept apart from
  // atMs: differencing them across frames produces nonsense.
  if (typeof entry.receivedMsAfterSubscribe === "number")
    frame.delayMs = entry.receivedMsAfterSubscribe;
  // The capture tool classifies a frame that arrived on an already-resolved
  // tag as a push; anything else is an ordinary reply.
  if (typeof entry.classification === "string")
    frame.pushed = entry.classification !== "response";
  return frame;
}

/** The exact line a client writes to, or reads from, the socket. */
export function renderNdjson(frame: Frame): string {
  const wire: Record<string, unknown> = {
    CommuniqueType: frame.CommuniqueType,
    Header: frame.Header,
  };
  if (frame.Body !== undefined) wire.Body = frame.Body;
  return JSON.stringify(wire);
}
