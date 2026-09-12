import assert from "node:assert/strict";
import test from "node:test";
import { GITHUB_COMMENT_MAX } from "./config.ts";
import { renderReport } from "./report.ts";

test("PASS template includes header, PR, all Plane URLs, tested bullets, and ts fence", () => {
  const md = renderReport({
    result: "PASS",
    prUrl: "https://github.com/agribeacon/sutagrow-api/pull/88",
    planeUrls: [
      "https://plane.agribeacon.tech/and-7",
      "https://plane.agribeacon.tech/and-9",
    ],
    tested: ["API: POST /x → 201", "e2e: login → tạo farm → thấy trên list"],
    skipped: ["MQTT payload"],
    script: "import { test } from '@playwright/test';\ntest('x', async () => {});",
    otherRepoAtStaging: "agribeacon/sutagrow-web",
  });
  assert.match(md, /^## taw-qa: PASS/m);
  assert.match(md, /\*\*PR:\*\* https:\/\/github.com\/agribeacon\/sutagrow-api\/pull\/88/);
  assert.match(
    md,
    /\*\*Plane:\*\* https:\/\/plane.agribeacon.tech\/and-7, https:\/\/plane.agribeacon.tech\/and-9/,
  );
  assert.match(md, /### Đã test/);
  assert.match(md, /API: POST \/x → 201/);
  assert.match(md, /### Không test/);
  assert.match(md, /MQTT payload/);
  assert.match(md, /### Script/);
  assert.match(md, /```ts/);
  assert.match(md, /staging/);
  assert.doesNotMatch(md, /chưa chốt/);
  assert.doesNotMatch(md, /### Screenshot/);
});

test("skip Plane omits the Plane line; GitHub still has the Report", () => {
  const md = renderReport({
    result: "PASS",
    prUrl: "https://github.com/agribeacon/sutagrow-web/pull/3",
    planeUrls: [],
    tested: ["e2e: login"],
    skipped: [],
    script: "test('login', async () => {});",
  });
  assert.match(md, /\*\*PR:\*\*/);
  assert.doesNotMatch(md, /\*\*Plane:\*\*/);
});

test("FAIL template adds Lỗi, optional screenshot, and chưa chốt script", () => {
  const md = renderReport({
    result: "FAIL",
    prUrl: "https://github.com/agribeacon/sutagrow-api/pull/88",
    planeUrls: ["https://plane.agribeacon.tech/and-7"],
    tested: ["API: POST /x → 500"],
    skipped: [],
    script: "test('x', async () => {});",
    error: "Expected 201, got 500\n{\"ok\":false}",
    screenshotUrl: "https://example.com/fail.png",
  });
  assert.match(md, /^## taw-qa: FAIL/m);
  assert.match(md, /### Lỗi/);
  assert.match(md, /Expected 201, got 500/);
  assert.match(md, /### Screenshot/);
  assert.match(md, /!\[fail\]\(https:\/\/example.com\/fail.png\)/);
  assert.match(md, /### Script \(chưa chốt\)/);
});

test("script over 65k is not inlined in a fence", () => {
  const huge = "x".repeat(GITHUB_COMMENT_MAX);
  const md = renderReport({
    result: "PASS",
    prUrl: "https://github.com/agribeacon/sutagrow-api/pull/1",
    planeUrls: [],
    tested: ["a"],
    skipped: [],
    script: huge,
  });
  assert.match(md, /65k/);
  assert.doesNotMatch(md, /```ts\nx+/);
});
