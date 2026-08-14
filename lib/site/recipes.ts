export type RecipeStep = {
  url: string;
  communiqueType: string;
  /**
   * Set when `url` is not a bundled path -- either a concrete instance of a
   * template, or a route that only exists on the unauthenticated pairing
   * listener. The value says which, and is rendered.
   */
  outsideBundle?: string;
  prose: string;
  /** A frame log and ClientTag to pull real captured frames from, when they exist. */
  capturedFrom?: { log: string; clientTag: string };
};

export type Recipe = {
  slug: string;
  title: string;
  intent: string;
  steps: RecipeStep[];
};

/**
 * Every URL below is either bundled or marked as outside the bundle. The
 * status claims are from fixtures/ra3.json (/project, /area,
 * /area/{id}/associatedzone, /zone/status all answer 200 OK) and
 * fixtures/push-probe.json (the zone command and its 201 Created reply).
 */
export const RECIPES: Recipe[] = [
  {
    slug: "pair-and-connect",
    title: "Pair a client and connect",
    intent:
      "Get a client certificate the processor will accept, then open the one socket you keep for the session.",
    steps: [
      {
        url: "/certificate/root",
        communiqueType: "ReadRequest",
        outsideBundle: "unauthenticated pairing listener",
        prose:
          "Sent before the client has any certificate — the one route reachable unpaired. Returns the bridge's own self-signed CA, generated per bridge instance. Once paired, RA3 answers 400 here, because the connection is already authenticated by mutual TLS.",
      },
      {
        url: "/pair",
        communiqueType: "CreateRequest",
        outsideBundle: "unauthenticated pairing listener",
        prose:
          "Send a CSR for a freshly generated secp256r1 keypair; receive a signed client certificate. Store it and the root certificate for every future connection. TLS 1.2 only, SHA256withECDSA.",
      },
    ],
  },
  {
    slug: "discover-the-layout",
    title: "Discover the system layout",
    intent: "Walk from the project down to the zones in each area.",
    steps: [
      {
        url: "/project",
        communiqueType: "ReadRequest",
        prose: "The top of the tree. 200 OK on the probed RA3 processor.",
      },
      {
        url: "/area",
        communiqueType: "ReadRequest",
        prose:
          "Every area, each carrying a Parent href. RA3 navigates by walking this tree; Caseta exposes flat lists instead. The area page shows which links resolved against real captures.",
      },
      {
        url: "/area/{areaId}/associatedzone",
        communiqueType: "ReadRequest",
        prose:
          "The zones in one area. 200 OK on RA3 for every area the probe sweep reached.",
      },
    ],
  },
  {
    slug: "read-every-zone",
    title: "Read the state of every zone",
    intent: "One frame for the whole lighting state.",
    steps: [
      {
        url: "/zone/status",
        communiqueType: "ReadRequest",
        prose:
          'Answers with Body {"ZoneStatuses": [...]} — the collection status route, not a per-zone one. Confirmed 200 OK on both RA3 and Caseta. Note the plural body key: the firmware labels this route\'s MessageBodyType with the singular struct name, and the wire disagrees.',
      },
    ],
  },
  {
    slug: "turn-on-a-light",
    title: "Turn on a light",
    intent:
      "Send a command to a zone's command processor and read what it answers.",
    steps: [
      {
        url: "/zone/{zoneId}/commandprocessor",
        communiqueType: "CreateRequest",
        prose:
          'Body is {"Command": {"CommandType": "GoToDimmedLevel", "DimmedLevelParameters": {"Level": 50}}} — wrapped under Command like every other body. Which parameter field pairs with which CommandType is on the zone page\'s composer. This is the only command processor any capture in this project has exercised.',
        capturedFrom: { log: "push-probe", clientTag: "lt-20" },
      },
    ],
  },
  {
    slug: "watch-for-changes",
    title: "Watch for changes",
    intent:
      "Subscribe once, then read pushes off the same socket for the life of the session.",
    steps: [
      {
        url: "/zone/status",
        communiqueType: "SubscribeRequest",
        prose:
          "The SubscribeResponse carries the initial state. Later pushes arrive as ReadResponse — not SubscribeResponse — on this same ClientTag, carrying only the fields that changed rather than a snapshot. A change nobody commanded pushes too, so a subscription observes the system rather than echoing your writes.",
        capturedFrom: { log: "push-probe", clientTag: "lt-18" },
      },
    ],
  },
];
