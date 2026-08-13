// Pure frame composition, shared by the composer UI and tested in node against
// lib/site/frames.ts so the browser and the generator can never disagree about
// what a frame looks like.

/**
 * @param {{url: string, communiqueType: string, clientTag?: string,
 *          params?: Record<string, string>, wrapperKey?: string, payload?: unknown}} input
 * @returns {string} the exact line a client writes to the socket
 */
export function composeFrame(input) {
  let url = input.url;
  for (const [name, value] of Object.entries(input.params ?? {}))
    url = url.replace(`{${name}}`, value);

  /** @type {Record<string, unknown>} */
  const wire = {
    CommuniqueType: input.communiqueType,
    Header: { Url: url, ClientTag: input.clientTag ?? "lt-1" },
  };
  if (input.payload !== undefined) {
    if (!input.wrapperKey)
      throw new Error(
        `request payload for ${url} has no wrapper key -- a bare Body would misrepresent the wire`,
      );
    wire.Body = { [input.wrapperKey]: input.payload };
  }
  return JSON.stringify(wire);
}
