"use strict";

const { promisify } = require("node:util");
const { createHash, randomBytes, scrypt: scryptCallback, timingSafeEqual } = require("node:crypto");

const scrypt = promisify(scryptCallback);

function normalizePhone(value) {
  if (typeof value !== "string") return null;
  const phone = value.trim().replace(/[\s().-]/g, "");
  if (/^0\d{9}$/.test(phone)) return `+84${phone.slice(1)}`;
  if (/^84\d{9}$/.test(phone)) return `+${phone}`;
  if (/^\+[1-9]\d{7,14}$/.test(phone)) return phone;
  return null;
}

function validPassword(value) {
  return typeof value === "string" && value.length >= 8 && value.length <= 128;
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return { salt, hash: hash.toString("hex") };
}

async function verifyPassword(password, salt, storedHash) {
  const expected = typeof storedHash === "string" && /^[a-f\d]{128}$/i.test(storedHash)
    ? Buffer.from(storedHash, "hex")
    : Buffer.alloc(64);
  const actual = await scrypt(password, salt || "zingplay-unknown-user", 64, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(actual, expected) && Boolean(salt && storedHash);
}

function newAccessToken() {
  return randomBytes(32).toString("base64url");
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function readBearerToken(value) {
  if (typeof value !== "string") return null;
  const match = /^Bearer ([A-Za-z0-9_-]{40,64})$/i.exec(value);
  return match ? match[1] : null;
}

module.exports = {
  hashPassword,
  hashToken,
  newAccessToken,
  normalizePhone,
  readBearerToken,
  validPassword,
  verifyPassword,
};
