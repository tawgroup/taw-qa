import assert from "node:assert/strict";
import test from "node:test";
import { blockedReason, decideVerdict, type RunSignals } from "./verdict.ts";

const clean: RunSignals = {
  uptimeBefore: 1000,
  uptimeAfter: 1200,
  count429: 0,
  count5xx: 0,
  connectionErrors: 0,
  prodGuardTripped: false,
  timedOut: false,
};

test("stack sạch, mọi claim xanh → PASS", () => {
  const got = decideVerdict({
    signals: clean,
    claims: [{ text: "a", green: true }],
  });
  assert.deepEqual(got, { verdict: "PASS" });
});

test("claim đỏ → FAIL", () => {
  const got = decideVerdict({
    signals: clean,
    claims: [{ text: "a", green: true }, { text: "b", green: false }],
  });
  assert.equal(got.verdict, "FAIL");
});

test("zero claim testable thì không PASS", () => {
  const got = decideVerdict({ signals: clean, claims: [] });
  assert.deepEqual(got, { verdict: "FAIL", failReason: "zero testable claim" });
});

test("uptime tụt → BLOCKED be-restarted, không phải FAIL", () => {
  const got = decideVerdict({
    signals: { ...clean, uptimeBefore: 9000, uptimeAfter: 12 },
    claims: [{ text: "a", green: false }],
  });
  assert.deepEqual(got, { verdict: "BLOCKED", reason: "be-restarted" });
});

test("BE restart vẫn BLOCKED kể cả khi mọi claim xanh", () => {
  const got = decideVerdict({
    signals: { ...clean, uptimeBefore: 9000, uptimeAfter: 12 },
    claims: [{ text: "a", green: true }],
  });
  assert.equal(got.verdict, "BLOCKED");
});

test("health pre-flight fail → be-unhealthy", () => {
  assert.equal(
    blockedReason({ ...clean, uptimeBefore: null }),
    "be-unhealthy",
  );
});

test("prod guard thắng mọi lý do khác", () => {
  assert.equal(
    blockedReason({
      ...clean,
      prodGuardTripped: true,
      uptimeBefore: null,
      timedOut: true,
    }),
    "prod-guard",
  );
});

test("429 → rate-limited; 5xx → be-flaky", () => {
  assert.equal(blockedReason({ ...clean, count429: 3 }), "rate-limited");
  assert.equal(blockedReason({ ...clean, count5xx: 1 }), "be-flaky");
  assert.equal(blockedReason({ ...clean, connectionErrors: 1 }), "be-flaky");
});

test("429 thắng 5xx khi có cả hai", () => {
  assert.equal(
    blockedReason({ ...clean, count429: 1, count5xx: 1 }),
    "rate-limited",
  );
});

test("đọc được uptime trước mà không đọc được sau → be-flaky", () => {
  assert.equal(blockedReason({ ...clean, uptimeAfter: null }), "be-flaky");
});

test("timeout → BLOCKED", () => {
  assert.equal(blockedReason({ ...clean, timedOut: true }), "timeout");
});

test("stack sạch → không có lý do BLOCKED nào", () => {
  assert.equal(blockedReason(clean), null);
});

test("test đỏ vì thiếu Chromium là BLOCKED, không phải FAIL", () => {
  // Lỗi thật gặp trên Runner: provisioning cài Chromium cho playwright 1.55.0
  // nhưng repo FE dùng version khác và cần bản khác.
  const out =
    "Error: browserType.launch: Executable doesn't exist at /root/.cache/ms-playwright/chromium_headless_shell-1223/...";
  const got = decideVerdict({
    signals: clean,
    claims: [{ text: "a", green: false }],
    runnerOutput: out,
  });
  assert.deepEqual(got, { verdict: "BLOCKED", reason: "runner-env" });
});

test("các dấu hiệu môi trường hỏng khác cũng thành BLOCKED", () => {
  for (const out of [
    "npx playwright install",
    "Error: Cannot find module 'next'",
    "listen EADDRINUSE: address already in use 127.0.0.1:3000",
    "Error: Timed out waiting 480000ms from config.webServer",
  ]) {
    const got = decideVerdict({
      signals: clean,
      claims: [{ text: "a", green: false }],
      runnerOutput: out,
    });
    assert.equal(got.verdict, "BLOCKED", out.slice(0, 30));
  }
});

test("test đỏ bình thường vẫn là FAIL", () => {
  const got = decideVerdict({
    signals: clean,
    claims: [{ text: "a", green: false }],
    runnerOutput:
      "Error: expect(locator).toBeVisible() failed\n  Locator: getByText('Email')\n  Expected: visible\n  Received: <element not found>",
  });
  assert.equal(got.verdict, "FAIL");
});
