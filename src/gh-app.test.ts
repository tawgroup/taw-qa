import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { appJwt, cloneUrl, redact } from "./gh-app.ts";

const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();

test("JWT có iss là app id và sống dưới 10 phút", () => {
  const now = 1_760_000_000_000;
  const [, p] = appJwt("4926638", pem, now).split(".");
  const c = JSON.parse(Buffer.from(p, "base64url").toString());
  assert.equal(c.iss, "4926638");
  assert.equal(c.exp - c.iat, 540);
  // iat lùi 60s: đồng hồ GitHub lệch vài giây là JWT bị từ chối.
  assert.equal(c.iat, Math.floor(now / 1000) - 60);
});

test("JWT ký RS256 verify được bằng public key", () => {
  const [h, p, s] = appJwt("1", pem).split(".");
  assert.equal(
    crypto.verify(
      "RSA-SHA256",
      Buffer.from(`${h}.${p}`),
      privateKey,
      Buffer.from(s, "base64url"),
    ),
    true,
  );
});

test("cloneUrl nhúng token làm HTTP password", () => {
  assert.equal(
    cloneUrl("ghs_abc", "agribeacon/sutagrow-web"),
    "https://x-access-token:ghs_abc@github.com/agribeacon/sutagrow-web.git",
  );
});

test("redact xoá token khỏi log, kể cả khi lặp nhiều lần", () => {
  assert.equal(redact("a ghs_x b ghs_x", "ghs_x"), "a *** b ***");
  assert.equal(redact("không có gì", ""), "không có gì");
});
