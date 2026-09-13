import assert from "node:assert/strict";
import test from "node:test";
import {
  assertNotProd,
  isProdHost,
  renderFeEnv,
  validateConfig,
} from "./project-config.ts";

const ok = {
  repo: "agribeacon/sutagrow-web",
  beUrl: "https://farm-dev-be.agribeacon.tech",
  beAllowedOrigin: "https://sutagrow-dev.agribeacon.tech",
  planeProject: "AND",
  testAccount: { email: "tawqa@agribeacon.tech", password: "x" },
  feEnv: {
    NEXT_PUBLIC_SOCKET_URL: "http://127.0.0.1:3018",
    NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3000",
    NEXT_PUBLIC_APP_ENV: "staging",
  },
};

test("staging BE hợp lệ", () => {
  assert.deepEqual(validateConfig(ok), []);
});

test("host prod bị chặn, kể cả subdomain", () => {
  assert.equal(isProdHost("saas-be.agribeacon.tech"), true);
  assert.equal(isProdHost("SAAS-BE.agribeacon.tech"), true);
  assert.equal(isProdHost("api.saas-be.agribeacon.tech"), true);
  assert.equal(isProdHost("sutagrow.agribeacon.tech"), true);
  assert.equal(isProdHost("farm-dev-be.agribeacon.tech"), false);
  assert.equal(isProdHost("sutagrow-dev.agribeacon.tech"), false);
});

test("assertNotProd ném khi trỏ prod", () => {
  assert.throws(
    () => assertNotProd("https://saas-be.agribeacon.tech/api"),
    /production/,
  );
  assert.doesNotThrow(() =>
    assertNotProd("https://farm-dev-be.agribeacon.tech/api"),
  );
});

test("BE_URL prod bị bắt ngay ở validate", () => {
  const errs = validateConfig({ ...ok, beUrl: "https://saas-be.agribeacon.tech" });
  assert.equal(errs.some((e) => e.field === "beUrl"), true);
});

test("thiếu tài khoản test là lỗi", () => {
  const errs = validateConfig({ ...ok, testAccount: undefined });
  assert.equal(errs.some((e) => e.field === "testAccount"), true);
});

test("thiếu biến NEXT_PUBLIC_* là lỗi — checkout sạch không có .env", () => {
  const errs = validateConfig({ ...ok, feEnv: {} });
  assert.deepEqual(
    errs.map((e) => e.field).filter((f) => f.startsWith("feEnv")),
    [
      "feEnv.NEXT_PUBLIC_SOCKET_URL",
      "feEnv.NEXT_PUBLIC_SITE_URL",
      "feEnv.NEXT_PUBLIC_APP_ENV",
    ],
  );
});

test("BE_URL rác không parse được", () => {
  const errs = validateConfig({ ...ok, beUrl: "hehe" });
  assert.equal(errs.some((e) => e.field === "beUrl"), true);
});

test("renderFeEnv bỏ NEXT_PUBLIC_API_URL vì buildPrefix đã bake", () => {
  const out = renderFeEnv({
    feEnv: { ...ok.feEnv, NEXT_PUBLIC_API_URL: "https://nham.example" },
  });
  assert.equal(out.includes("NEXT_PUBLIC_API_URL"), false);
  assert.match(out, /NEXT_PUBLIC_APP_ENV=staging/);
});
