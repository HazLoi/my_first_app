"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  hashPassword,
  hashToken,
  newAccessToken,
  normalizePhone,
  readBearerToken,
  validPassword,
  verifyPassword,
} = require("./auth");

test("normalizes Vietnamese phone numbers and rejects malformed values", () => {
  assert.equal(normalizePhone("0912 345 678"), "+84912345678");
  assert.equal(normalizePhone("+84 (912) 345-678"), "+84912345678");
  assert.equal(normalizePhone("123"), null);
  assert.equal(normalizePhone(84912345678), null);
});

test("validates password length without trimming its value", () => {
  assert.equal(validPassword("12345678"), true);
  assert.equal(validPassword(" short "), false);
  assert.equal(validPassword("x".repeat(129)), false);
});

test("hashes passwords and creates opaque bearer tokens", async () => {
  const credentials = await hashPassword("secure-password");
  assert.equal(await verifyPassword("secure-password", credentials.salt, credentials.hash), true);
  assert.equal(await verifyPassword("wrong-password", credentials.salt, credentials.hash), false);
  assert.equal(await verifyPassword("secure-password", undefined, undefined), false);

  const token = newAccessToken();
  assert.match(token, /^[A-Za-z0-9_-]{40,64}$/);
  assert.equal(readBearerToken(`Bearer ${token}`), token);
  assert.equal(readBearerToken(`Basic ${token}`), null);
  assert.equal(hashToken(token).length, 64);
});
