// Unit tests for the bridge signing helper. No external imports and no network,
// so they run anywhere `deno test` runs — including a sandbox where jsr.io and
// deno.land are unreachable.
//
// CANONICAL SOURCE, like acaciaSign.ts beside it. An app copies this file next
// to its own `_acaciaSign.ts` and changes ONLY the import path on the next line.
// In flowfin it lives at `base44/functions/_acaciaSign.test.ts` — the functions
// ROOT, not inside a function directory, because every directory under
// `base44/functions/` becomes a deployed endpoint and a test file is not one.
//
// The vector below is the reason this file exists. Mission Control derives the
// same key in Node (`api/_lib/ingestSign.js`, asserted in its own
// `ingestSign.test.js`) and this derives it in Deno's WebCrypto. If the two
// implementations ever disagree the bridge does not error — it returns "bad
// signature" for every call, which reads as a secret problem and is not one.
import {
  ACCEPT_LEGACY_MASTER,
  canonicalMessage,
  deriveAppKey,
  signAs,
  stableStringify,
  verifyAs,
  verifyBearer,
} from "./acaciaControl/_acaciaSign.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("assertion failed: " + msg);
}
function assertEquals(actual: unknown, expected: unknown, msg = "") {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`assertEquals failed (${msg}): ${a} !== ${e}`);
}

const MASTER = "test-master";

Deno.test("deriveAppKey matches the cross-language vector", async () => {
  // Same two values Mission Control's Node test asserts. Hard-coded on purpose:
  // recomputing them with the same code they are meant to check would assert
  // nothing.
  assertEquals(
    await deriveAppKey(MASTER, "puntos"),
    "b22a11d857d2f7b72ad625d5dfbf08458699a7e972ecb5230285c8cfe40268ec",
  );
  assertEquals(
    await deriveAppKey(MASTER, "liuma"),
    "cdfd05669dd3d27ea3841af7bc0c2f19780a854e954fdc75640a5a681cab78d0",
  );
});

Deno.test("deriveAppKey separates apps — that is the whole point", async () => {
  const a = await deriveAppKey(MASTER, "puntos");
  const b = await deriveAppKey(MASTER, "liuma");
  assert(a !== b, "two apps must not share a key");
  // And the derivation is domain-separated from a signature over a body, so a
  // key can never collide with a message MAC.
  assert(a !== await signAs(MASTER, "puntos", "1", "ping", {}), "key vs sig");
});

Deno.test("stableStringify sorts keys recursively", () => {
  assertEquals(
    stableStringify({ b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } }),
    '{"a":{"c":[3,{"e":5,"f":4}],"d":2},"b":1}',
  );
  // Key ORDER must not change the signed string — two objects that differ only
  // in insertion order have to produce one message.
  assertEquals(stableStringify({ x: 1, y: 2 }), stableStringify({ y: 2, x: 1 }));
});

Deno.test("canonicalMessage treats missing params as {}", () => {
  assertEquals(canonicalMessage("7", "ping", undefined), "7.ping.{}");
  assertEquals(canonicalMessage("7", "ping", null), "7.ping.{}");
});

Deno.test("verifyAs accepts this app's own signature", async () => {
  const ts = Date.now();
  const params = { app: "puntos", record: { id: "x" } };
  const sig = await signAs(MASTER, "puntos", ts, "ticket.ingest", params);
  assert(
    await verifyAs(MASTER, "puntos", { ts, action: "ticket.ingest", params, sig }),
    "own signature must verify",
  );
});

Deno.test("verifyAs rejects another app's signature — the hole this closes", async () => {
  // liuma signs a body that claims to be puntos. Under the old shared-master
  // scheme this verified, because the key was the same everywhere.
  const ts = Date.now();
  const params = { app: "puntos", record: { id: "forged" } };
  const sig = await signAs(MASTER, "liuma", ts, "ticket.ingest", params);
  assert(
    !(await verifyAs(MASTER, "puntos", { ts, action: "ticket.ingest", params, sig })),
    "a signature from another app must not verify as puntos",
  );
});

Deno.test("verifyAs rejects a tampered body", async () => {
  const ts = Date.now();
  const sig = await signAs(MASTER, "puntos", ts, "ticket.ingest", { amount: 1 });
  assert(
    !(await verifyAs(MASTER, "puntos", {
      ts,
      action: "ticket.ingest",
      params: { amount: 999 },
      sig,
    })),
    "changed params must not verify",
  );
});

Deno.test("verifyAs rejects a stale or malformed timestamp", async () => {
  const params = { a: 1 };
  const old = Date.now() - 10 * 60 * 1000;
  const sig = await signAs(MASTER, "puntos", old, "ping", params);
  assert(
    !(await verifyAs(MASTER, "puntos", { ts: old, action: "ping", params, sig })),
    "a 10-minute-old request is outside the 5-minute window",
  );
  // Number("abc") is NaN and `NaN > maxSkew` is false, so a bare comparison
  // would let this through. The guard exists for exactly this input.
  const bad = await signAs(MASTER, "puntos", "abc", "ping", params);
  assert(
    !(await verifyAs(MASTER, "puntos", { ts: "abc", action: "ping", params, sig: bad })),
    "a non-numeric ts must be rejected, not treated as fresh",
  );
});

Deno.test("legacy master is accepted while the flag is on, and only then", async () => {
  const ts = Date.now();
  const params = { a: 1 };
  // A signature made with the bare master — what Mission Control still sends
  // during step 1 of the migration. Computed here from scratch rather than via
  // signAs(), which always derives.
  const msg = canonicalMessage(ts, "ping", params);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(MASTER),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  const masterSig = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  assertEquals(
    await verifyAs(MASTER, "puntos", { ts, action: "ping", params, sig: masterSig }),
    ACCEPT_LEGACY_MASTER,
    "master signature is accepted exactly while ACCEPT_LEGACY_MASTER is true",
  );

  // A missing slug follows the same flag rather than having a rule of its own.
  // With the flag off it fails, which is the desired end state; while it was on
  // it degraded to legacy, which is what kept the bridge alive for the apps
  // whose ACACIA_APP_SLUG had not landed yet. Asserting against the flag rather
  // than a literal is deliberate: this test stayed meaningful through the flip,
  // and cannot be satisfied by turning it off.
  assertEquals(
    await verifyAs(MASTER, "", { ts, action: "ping", params, sig: masterSig }),
    ACCEPT_LEGACY_MASTER,
    "no slug + master signature follows the same flag",
  );
});

Deno.test("verifyBearer derives the same key and rejects a foreign one", async () => {
  const own = await deriveAppKey(MASTER, "kitchops");
  const other = await deriveAppKey(MASTER, "ctrlhq");
  assert(await verifyBearer(MASTER, "kitchops", own), "own bearer must pass");
  assert(!(await verifyBearer(MASTER, "kitchops", other)), "another app's bearer must fail");
  assertEquals(
    await verifyBearer(MASTER, "kitchops", MASTER),
    ACCEPT_LEGACY_MASTER,
    "the bare master follows the migration flag",
  );
  assert(!(await verifyBearer(MASTER, "kitchops", null)), "no value must fail");
  assert(!(await verifyBearer("", "kitchops", own)), "no master must fail");
});
