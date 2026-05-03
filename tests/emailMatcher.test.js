import test from "node:test";
import assert from "node:assert/strict";

const loadMatcherModule = async () =>
  import("../src/emailMatcher.js").catch(() => ({}));

test("matches the target address from forwarding headers", async () => {
  const matcher = await loadMatcherModule();
  const headerSection = [
    "Delivered-To: admin@example.com",
    "X-Original-To: alias@demo.example",
    "X-Forwarded-To: alias@demo.example",
    "Subject: Verification code",
    ""
  ].join("\r\n");

  assert.equal(
    matcher.headerSectionContainsAddress?.(headerSection, "alias@demo.example"),
    true
  );
});

test("matches the target address from the message envelope", async () => {
  const matcher = await loadMatcherModule();
  const envelope = {
    to: [
      { address: "admin@example.com", name: "Admin" },
      { address: "alias@demo.example", name: "Alias" }
    ]
  };

  assert.equal(
    matcher.envelopeContainsAddress?.(envelope, "alias@demo.example"),
    true
  );
});

test("does not match unrelated addresses", async () => {
  const matcher = await loadMatcherModule();
  const headerSection = [
    "Delivered-To: admin@example.com",
    "X-Original-To: another@demo.example",
    "Subject: Verification code",
    ""
  ].join("\r\n");

  assert.equal(
    matcher.headerSectionContainsAddress?.(headerSection, "alias@demo.example"),
    false
  );
});
