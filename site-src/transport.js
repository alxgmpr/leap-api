// The seam the local playground bridge plugs into.
//
// A page cannot open a TCP socket and cannot present a client certificate on
// one, so the browser can never speak LEAP directly. The published build has
// no bridge and Send stays disabled; a local bridge that serves this page
// same-origin sets `window.__LEAP_BRIDGE__` and Send lights up.

/** @typedef {{send: (line: string) => Promise<string>}} Transport */

/** @returns {Transport | null} */
export function getTransport() {
  const bridge = /** @type {any} */ (globalThis).__LEAP_BRIDGE__;
  return bridge && typeof bridge.send === "function" ? bridge : null;
}
