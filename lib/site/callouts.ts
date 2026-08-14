import { href, ROOT_NESTED } from "./href.ts";
import type { Operation } from "./model.ts";

/**
 * A short warning shown at the point of use, deep-linked to the narrative
 * section that explains it in full. The prose is never copied here -- the
 * callout states the consequence for a client author in one sentence and
 * sends them to the section that has the evidence. `href` names its target
 * page explicitly (docs still live on index.html, so every callout here
 * points there) rather than a bare in-page anchor: `calloutsFor` is only
 * ever rendered onto a resource page (Task 5), one directory below the docs
 * it links into, via `ROOT_NESTED`.
 */
export type Callout = { text: string; href: string };

/**
 * Deliberately few. A callout on every operation would be furniture; these
 * are the three facts that cost a client author a debugging session if they
 * meet them at runtime instead of here.
 */
export function calloutsFor(operation: Operation): Callout[] {
  const callouts: Callout[] = [];

  // A 102 arrives while the request is still pending and is followed by the
  // real answer ~1s later. A client that resolves on the first frame loses
  // the response permanently -- a bug the reference client actually shipped.
  if (
    operation.url.startsWith("/firmwareimage") &&
    operation.communiqueType === "ReadRequest"
  )
    callouts.push({
      text: "This route answered 102 Processing before the real response, about a second later on the same ClientTag. 102 is not terminal — do not resolve on it.",
      href: href.docHeading(
        ROOT_NESTED,
        "protocol",
        "102-processing-an-interim-acknowledgement-not-a-terminal-status",
      ),
    });

  // Caseta subscribes the client to this URL at connect without being asked,
  // and those pushes carry no ClientTag at all.
  if (operation.url === "/device/status/deviceheard")
    callouts.push({
      text: "Caseta auto-subscribes a client to this URL at connect. Those pushes arrive untagged, so a client keyed purely on ClientTag drops them.",
      href: href.doc(ROOT_NESTED, "subscriptions"),
    });

  // Pushes reuse the subscribing request's tag, which is no longer pending.
  if (operation.subscribable)
    callouts.push({
      text: "Pushes arrive on this subscription's own ClientTag, after that tag has already been resolved. Never recycle a ClientTag within a session.",
      href: href.docHeading(ROOT_NESTED, "protocol", "clienttag-correlation"),
    });

  return callouts;
}
