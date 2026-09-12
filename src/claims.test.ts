import assert from "node:assert/strict";
import test from "node:test";
import { assembleClaims, canPass, isSetupOnly } from "./claims.ts";

test("setup-only navigation is not a Claim", () => {
  assert.equal(isSetupOnly("đi tới màn hình login"), true);
  assert.equal(isSetupOnly("mở trang farm list"), true);
  assert.equal(isSetupOnly("đi tới màn hình login rồi thấy nút Tạo"), false);
});

test("assembles ER/repro bullets plus Plane QA; skips mobile MQTT prod as không test", () => {
  const got = assembleClaims({
    prTitle: "unused when bullets exist",
    prBody: [
      "- POST /farms trả về 201",
      "- đi tới màn hình login",
      "- e2e: login → tạo farm → thấy trên list",
      "- verify MQTT payload on device",
      "- mobile app shows the farm",
      "- check this on prod",
    ].join("\n"),
    planeQa: ["GET /farms/:id status 200"],
  });
  assert.deepEqual(
    got.testable.map((c) => c.text),
    [
      "POST /farms trả về 201",
      "e2e: login → tạo farm → thấy trên list",
      "GET /farms/:id status 200",
    ],
  );
  assert.ok(got.testable.every((c) => c.hasAssertion));
  assert.deepEqual(
    got.skipped.map((s) => s.text),
    [
      "verify MQTT payload on device",
      "mobile app shows the farm",
      "check this on prod",
    ],
  );
  assert.ok(got.skipped.every((s) => s.reason === "không test"));
  assert.equal(canPass(got), true);
});

test("zero testable Claims is not PASS", () => {
  const got = assembleClaims({
    prTitle: "",
    prBody: "- đi tới màn hình settings",
    planeQa: ["test on mobile"],
  });
  assert.equal(got.testable.length, 0);
  assert.equal(canPass(got), false);
});

test("a testable line without an assertion cannot PASS", () => {
  const got = assembleClaims({
    prTitle: "",
    prBody: "- farms list page",
    planeQa: [],
  });
  assert.equal(got.testable.length, 1);
  assert.equal(got.testable[0].hasAssertion, false);
  assert.equal(canPass(got), false);
});

test("falls back to PR title when body has no bullets", () => {
  const got = assembleClaims({
    prTitle: "POST /trees trả về 201",
    prBody: "narrative without list markers",
    planeQa: [],
  });
  assert.equal(got.testable[0].text, "POST /trees trả về 201");
  assert.equal(got.testable[0].layer, "api");
});
