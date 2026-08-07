/**
 * Keys whose values are sensitive regardless of their shape.
 *
 * Beyond the baseline set, the following were added after an adversarial
 * sweep of real captured probe data turned up leaks the pattern-only checks
 * missed:
 *   - "Display": the installer contact record nests the real name under
 *     `Name: { Display: "..." }` — an object, so the plain `Name` string
 *     check never reaches it.
 *   - "Phone" / "Email": the actual LEAP key names used by contact records
 *     (the brief's baseline only listed "PhoneNumber" / "EmailAddress",
 *     which do not appear in this data).
 *   - "NetworkMasterKey" / "ExtendedPANID": Zigbee network credentials,
 *     base64-encoded, so they don't match any IP/MAC/GUID pattern.
 */
const SENSITIVE_STRING_KEYS = new Set([
  "Name",
  "Display",
  "ProjectName",
  "HouseholdName",
  "BonjourServiceName",
  "PhoneNumber",
  "Phone",
  "EmailAddress",
  "Email",
  "Organization",
  "ContactName",
  "TransferGUID",
  "XID",
  "NetworkMasterKey",
  "ExtendedPANID",
]);

/**
 * Placeholder "kind" tag to use for each sensitive string key, so the
 * redacted output reads meaningfully (e.g. `<email-1>` not `<name-7>`).
 * Keys not listed here fall back to "name".
 */
function kindForKey(key: string): string {
  switch (key) {
    case "XID":
      return "xid";
    case "TransferGUID":
      return "guid";
    case "PhoneNumber":
    case "Phone":
      return "phone";
    case "EmailAddress":
    case "Email":
      return "email";
    case "NetworkMasterKey":
      return "networkkey";
    case "ExtendedPANID":
      return "panid";
    default:
      return "name";
  }
}

const ZEROED_NUMERIC_KEYS = new Set(["SerialNumber", "Latitude", "Longitude"]);

/**
 * Keys whose values are arrays of sensitive strings. Found in real data:
 * `FullyQualifiedName: ["Guest Bedroom", "Tessera Sconce"]` duplicates the
 * same room/device names that the "Name" key redacts elsewhere in the tree,
 * so each element must be redacted individually — reusing the "name"
 * placeholder pool keeps cross-references (Name vs. FullyQualifiedName for
 * the same room) consistent.
 */
const SENSITIVE_STRING_ARRAY_KEYS = new Set(["FullyQualifiedName"]);

// Order matters: a MAC address also matches the loose IPv6 shape, so it must
// be tested first.
const PATTERNS: [RegExp, string][] = [
  [/^\d{1,3}(\.\d{1,3}){3}$/, "ipv4"],
  [/^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/, "mac"],
  [/^[0-9a-fA-F]{1,4}(:[0-9a-fA-F]{0,4}){2,7}$/, "ipv6"],
  [
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    "guid",
  ],
  [/^[0-9A-F]{32,}$/, "guid"],
  // Defense in depth: catch email-shaped values even under an unlisted key.
  [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "email"],
];

const counters = new Map<string, number>();
const memo = new Map<string, string>();

function placeholder(kind: string, original: string): string {
  const memoKey = `${kind}:${original}`;
  const existing = memo.get(memoKey);
  if (existing) return existing;

  const next = (counters.get(kind) ?? 0) + 1;
  counters.set(kind, next);
  const token = `<${kind}-${next}>`;
  memo.set(memoKey, token);
  return token;
}

/** Redact a scalar by pattern. Non-matching scalars pass through unchanged. */
export function redactValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  for (const [re, kind] of PATTERNS) {
    if (re.test(value)) return placeholder(kind, value);
  }
  return value;
}

/** Recursively redact a parsed JSON tree, preserving its exact structure. */
export function redactTree<T>(tree: T): T {
  if (Array.isArray(tree)) {
    return tree.map((v) => redactTree(v)) as unknown as T;
  }
  if (tree !== null && typeof tree === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(tree)) {
      if (ZEROED_NUMERIC_KEYS.has(key)) {
        if (typeof value === "number") {
          out[key] = 0;
        } else if (typeof value === "string") {
          // Found in real data: HomeKitProperties.BridgeAccessory.SerialNumber
          // is a short hex string ("10005000000E8") that doesn't match the
          // 32+ char GUID pattern, so pattern-only matching missed it. Any
          // non-numeric value under a zeroed-numeric key is still sensitive
          // and gets its own stable placeholder rather than passing through.
          out[key] = placeholder(
            key === "SerialNumber" ? "serial" : "coord",
            value,
          );
        } else {
          out[key] = redactTree(value);
        }
      } else if (SENSITIVE_STRING_KEYS.has(key) && typeof value === "string") {
        out[key] = placeholder(kindForKey(key), value);
      } else if (SENSITIVE_STRING_ARRAY_KEYS.has(key) && Array.isArray(value)) {
        out[key] = value.map((v) =>
          typeof v === "string" ? placeholder("name", v) : redactTree(v),
        );
      } else {
        out[key] = redactTree(value);
      }
    }
    return out as T;
  }
  return redactValue(tree) as T;
}
