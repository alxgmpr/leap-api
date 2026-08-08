import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { redactTree, redactValue } from "../lib/redact.ts";

describe("redactValue", () => {
  test("redacts IPv4 addresses", () => {
    // Placeholder numbering depends on call order across the suite, so assert
    // the shape rather than a specific index.
    // 192.0.2.0/24 is IANA-reserved for documentation (RFC 5737) — not a
    // real device address.
    assert.match(String(redactValue("192.0.2.10")), /^<ipv4-\d+>$/);
  });

  test("redacts IPv6 addresses", () => {
    const out = String(redactValue("fd00:1234:5678::1"));
    assert.match(out, /^<ipv6-\d+>$/);
  });

  test("redacts a full 8-group IPv6 address", () => {
    // Shape of the one genuine IPv6 address in this project's corpus
    // (NetworkInterfaces[].IPv6Properties.UniqueLocalUnicastAddresses).
    const out = String(redactValue("fd00:1234:5678:9abc:def0:1234:5678:9abc"));
    assert.match(out, /^<ipv6-\d+>$/);
  });

  // Found during an adversarial leak sweep: the loose IPv6 pattern also
  // matched H:MM:SS / MM:SS duration and time-of-day shapes, since both are
  // digits-only and colon-delimited. CountdownTimer.Timeout values like
  // "1:00:00" were wrongly rewritten to <ipv6-N> before this fix.
  test("does not redact H:MM:SS or MM:SS duration shapes as IPv6", () => {
    assert.equal(redactValue("1:00:00"), "1:00:00");
    assert.equal(redactValue("15:00"), "15:00");
    assert.equal(redactValue("30:00"), "30:00");
    assert.equal(redactValue("4:00:00"), "4:00:00");
  });

  test("redacts MAC addresses", () => {
    const out = String(redactValue("a0:b1:c2:d3:e4:f5"));
    assert.match(out, /^<mac-\d+>$/);
  });

  test("redacts GUIDs", () => {
    const out = String(redactValue("ABCDEF0123456789ABCDEF0123456789ABCDEF01"));
    assert.match(out, /^<guid-\d+>$/);
  });

  test("is stable — the same input maps to the same placeholder", () => {
    const a = redactValue("192.0.2.10");
    const b = redactValue("192.0.2.10");
    assert.equal(a, b);
  });

  test("distinct inputs map to distinct placeholders", () => {
    assert.notEqual(redactValue("192.0.2.1"), redactValue("192.0.2.2"));
  });

  test("leaves hrefs and ordinary values untouched", () => {
    assert.equal(redactValue("/zone/518"), "/zone/518");
    assert.equal(redactValue("Dimmed"), "Dimmed");
    assert.equal(redactValue(75), 75);
    assert.equal(redactValue(true), true);
  });
});

describe("redactTree", () => {
  test("redacts sensitive keys by name regardless of value shape", () => {
    const out = redactTree({
      Name: "Example Residence",
      SerialNumber: 12345678,
      Latitude: 12.34,
      Longitude: -56.78,
      Level: 75,
    }) as Record<string, unknown>;
    assert.equal(out.Name, "<name-1>");
    assert.equal(out.SerialNumber, 0);
    assert.equal(out.Latitude, 0);
    assert.equal(out.Longitude, 0);
    assert.equal(out.Level, 75, "non-sensitive numbers must survive");
  });

  test("recurses through arrays and nested objects", () => {
    const out = redactTree({
      Devices: [{ MACAddress: "a0:b1:c2:d3:e4:f5", href: "/device/435" }],
    }) as { Devices: { MACAddress: string; href: string }[] };
    assert.match(out.Devices[0].MACAddress, /^<mac-\d+>$/);
    assert.equal(out.Devices[0].href, "/device/435");
  });

  test("preserves structure — key sets are unchanged", () => {
    const input = { A: "192.0.2.5", B: { C: 1 } };
    const out = redactTree(input) as Record<string, unknown>;
    assert.deepEqual(Object.keys(out), ["A", "B"]);
    assert.deepEqual(Object.keys(out.B as object), ["C"]);
  });

  // Found during the adversarial leak sweep of real probe data: the
  // installer contact record nests the real name under Name.Display, which
  // the plain SENSITIVE_STRING_KEYS check on "Name" misses because the
  // value at that level is an object, not a string.
  // (Test input is a synthetic name, not the real value found in the data.)
  test("redacts a personal name nested under Name.Display", () => {
    const out = redactTree({
      Name: { Display: "Jane Doe" },
    }) as { Name: { Display: string } };
    assert.match(out.Name.Display, /^<name-\d+>$/);
  });

  // Found in real data: contact records use the keys "Phone" and "Email"
  // (not "PhoneNumber"/"EmailAddress" from the brief's baseline list).
  // (Test input is a synthetic email, not the real value found in the data.)
  test("redacts Phone and Email keys", () => {
    const out = redactTree({
      Phone: "5555555555",
      Email: "jane@example.com",
    }) as { Phone: string; Email: string };
    assert.match(out.Phone, /^<phone-\d+>$/);
    assert.match(out.Email, /^<email-\d+>$/);
  });

  // Found in real data: FullyQualifiedName is an array of room/device name
  // strings that duplicates information the "Name" key redacts elsewhere.
  // Each element must be redacted individually, using the same stable
  // "name" placeholder pool so cross-references with Name fields survive.
  test("redacts each string in a FullyQualifiedName array", () => {
    const viaName = redactTree({ Name: "Guest Bedroom" }) as { Name: string };
    const out = redactTree({
      FullyQualifiedName: ["Guest Bedroom", "Tessera Sconce"],
    }) as { FullyQualifiedName: string[] };
    assert.match(out.FullyQualifiedName[0] as string, /^<name-\d+>$/);
    assert.match(out.FullyQualifiedName[1] as string, /^<name-\d+>$/);
    assert.notEqual(out.FullyQualifiedName[0], out.FullyQualifiedName[1]);
    assert.equal(
      out.FullyQualifiedName[0],
      viaName.Name,
      "must reuse the same placeholder pool as bare Name values",
    );
  });

  // Found in real data: NetworkMasterKey and ExtendedPANID are Zigbee
  // network credentials (base64), not shaped like an IP/MAC/GUID, so the
  // pattern-only scalar check misses them entirely.
  // (Test inputs are synthetic base64 strings, not the real network
  // credentials found in the data — redaction here is by key name, not by
  // shape, so any string of the right type exercises the same path.)
  test("redacts NetworkMasterKey and ExtendedPANID", () => {
    const out = redactTree({
      NetworkMasterKey: "AAECAwQFBgcICQoLDA0ODw==",
      ExtendedPANID: "EBESExQVFhcY",
    }) as { NetworkMasterKey: string; ExtendedPANID: string };
    assert.match(out.NetworkMasterKey, /^<networkkey-\d+>$/);
    assert.match(out.ExtendedPANID, /^<panid-\d+>$/);
  });

  // Found in real data: HomeKitProperties.BridgeAccessory.SerialNumber is a
  // hex-ish string too short to match the 32+ char GUID pattern, so the
  // "zero out numbers, else pattern-match" rule let it through unredacted.
  // (Test input is a synthetic same-shaped serial, not the real device
  // serial found in the data.)
  test("redacts a non-numeric SerialNumber string", () => {
    const out = redactTree({
      SerialNumber: "AB12CD34EF56",
    }) as { SerialNumber: string };
    assert.match(out.SerialNumber, /^<serial-\d+>$/);
  });

  test("still zeroes numeric SerialNumber/Latitude/Longitude", () => {
    const out = redactTree({
      SerialNumber: 12345678,
      Latitude: 12.34,
      Longitude: -56.78,
    }) as Record<string, unknown>;
    assert.equal(out.SerialNumber, 0);
    assert.equal(out.Latitude, 0);
    assert.equal(out.Longitude, 0);
  });
});

describe("redactValue — email catch-all", () => {
  test("redacts an email-shaped string regardless of key", () => {
    const out = String(redactValue("someone@example.com"));
    assert.match(out, /^<email-\d+>$/);
  });
});
