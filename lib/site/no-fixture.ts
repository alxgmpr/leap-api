// Why a bundled path has no 200 capture. Every path in
// `coverage.specWithoutFixture` falls into exactly one reason below; the first
// matching rule wins, so order matters. Two meta-kinds:
//
//   structural  — a GET on this URL can never answer 200, by route design
//                 (it is a write verb, a paging projection, a push route, or a
//                 setup-listener route). No capture will ever move it off the
//                 list; documenting the reason is the endpoint.
//   conditional — the URL is a real GET-able resource that answered non-200
//                 only because nothing of that kind is configured on the
//                 processors probed. A home that had one would capture a 200.
//
// This is the machine-checked companion to the coverage page's prose: the
// counts and the partition are asserted in test/no-fixture.test.ts.

export type NoFixtureKind = "structural" | "conditional";

export type NoFixtureReason = {
  key: string;
  label: string;
  kind: NoFixtureKind;
  blurb: string;
};

export const NO_FIXTURE_REASONS: NoFixtureReason[] = [
  {
    key: "paging",
    label: "Paging pseudo-route",
    kind: "structural",
    blurb:
      "A .../with/explicit/paging or .../with/implicit/paging projection of a " +
      "collection, not a resource of its own — the paged form is reached " +
      "through the base collection, so the pseudo-route never answers a bare GET.",
  },
  {
    key: "commandprocessor",
    label: "Command processor",
    kind: "structural",
    blurb:
      "A .../commandprocessor write endpoint. It takes a CreateRequest " +
      "carrying a Command; a GET has no meaning and never returns 200.",
  },
  {
    key: "query-action",
    label: "Query / action route",
    kind: "structural",
    blurb:
      "A .../query search endpoint or a /system/action/… execute route — a " +
      "verb that takes a request body, not a readable collection.",
  },
  {
    key: "pairing",
    label: "Pairing-listener route",
    kind: "structural",
    blurb:
      "A /server/leap/…pairing route that lives on the unauthenticated setup " +
      "listener. The probes ran on the authenticated LEAP session, which does " +
      "not serve it — see docs/discovery.md.",
  },
  {
    key: "subscribe-only",
    label: "Subscribe-only route",
    kind: "structural",
    blurb:
      "A push route with no GET at all: the processor only ever emits it to a " +
      "subscriber. /device/status/deviceheard sits here permanently.",
  },
  {
    key: "preset-assignment",
    label: "Preset assignment sub-resource",
    kind: "conditional",
    blurb:
      "A /preset/{id}/…assignment sub-collection. A preset only carries the " +
      "assignment flavors it actually uses, so most are empty (non-200) unless " +
      "a preset of that kind is configured.",
  },
  {
    key: "service-integration",
    label: "Integration service not provisioned",
    kind: "conditional",
    blurb:
      "A /service/… endpoint for an external integration (Sonos, Alexa, " +
      "Google Home, IFTTT, HomeKit, BACnet, OpenADR). Absent until that " +
      "integration is set up on the processor.",
  },
  {
    key: "feature-not-configured",
    label: "Feature not configured",
    kind: "conditional",
    blurb:
      "A real GET-able resource that answered non-200 only because nothing of " +
      "that kind exists on the probed home — no timeclock events, no zone " +
      "scenes, no temperature sensors, no emergency settings, and so on.",
  },
];

const PRESET_ASSIGNMENT = /^\/preset\/\{[^}]+\}\/[a-z]+assignment$/;

export function classifyNoFixture(path: string): NoFixtureReason["key"] {
  if (/\/with\/(explicit|implicit)\/paging$/.test(path)) return "paging";
  if (/\/commandprocessor$/.test(path)) return "commandprocessor";
  if (/\/query$/.test(path) || /^\/system\/action\//.test(path))
    return "query-action";
  if (/^\/server\/leap\/.*pairing/.test(path)) return "pairing";
  if (path === "/device/status/deviceheard") return "subscribe-only";
  if (PRESET_ASSIGNMENT.test(path) || path === "/presetassignment/deprecated")
    return "preset-assignment";
  if (/^\/service\//.test(path)) return "service-integration";
  return "feature-not-configured";
}

export function groupNoFixture(
  paths: string[],
): { reason: NoFixtureReason; paths: string[] }[] {
  return NO_FIXTURE_REASONS.map((reason) => ({
    reason,
    paths: paths.filter((p) => classifyNoFixture(p) === reason.key).sort(),
  })).filter((g) => g.paths.length > 0);
}
