import assert from "node:assert/strict";
import test from "node:test";
import { renderReport } from "./report.ts";

const base = {
  prUrl: "https://github.com/agribeacon/sutagrow-web/pull/42",
  planeUrls: ["https://plane.agribeacon.tech/agribeacon/browse/AND-553/"],
  tested: ["e2e: login → tạo farm → thấy trên list"],
  skipped: [] as string[],
  script: "test('x', async () => {});",
  commit: "a1b2c3d",
  beUrl: "https://farm-dev-be.agribeacon.tech",
};

test("BLOCKED: có Lý do, không có Screenshot, không có Script", () => {
  const md = renderReport({
    ...base,
    result: "BLOCKED",
    blockedReason: "be-restarted",
    screenshotUrl: "https://example.com/fail.png",
  });
  assert.match(md, /^## taw-qa: BLOCKED/m);
  assert.match(md, /### Lý do/);
  assert.match(md, /restart giữa lúc chạy/);
  assert.doesNotMatch(md, /### Screenshot/);
  assert.doesNotMatch(md, /### Script/);
  assert.doesNotMatch(md, /```ts/);
});

test("BLOCKED prod-guard nói rõ vì sao từ chối", () => {
  const md = renderReport({
    ...base,
    result: "BLOCKED",
    blockedReason: "prod-guard",
  });
  assert.match(md, /production/);
});

test("Commit và BE có trên cả ba verdict", () => {
  for (const result of ["PASS", "FAIL", "BLOCKED"] as const) {
    const md = renderReport({
      ...base,
      result,
      blockedReason: result === "BLOCKED" ? "timeout" : undefined,
      error: "boom",
    });
    assert.match(md, /\*\*Commit:\*\* `a1b2c3d`/, result);
    assert.match(md, /\*\*BE:\*\* https:\/\/farm-dev-be.agribeacon.tech/, result);
  }
});

test("Không dọn được xuất hiện mà không đổi verdict", () => {
  const md = renderReport({
    ...base,
    result: "PASS",
    notCleaned: ["farm tawqa-pr42-alpha", "task tawqa-pr42-beta"],
  });
  assert.match(md, /^## taw-qa: PASS/m);
  assert.match(md, /### Không dọn được/);
  assert.match(md, /tawqa-pr42-alpha/);
});

test("dọn sạch thì không in mục Không dọn được", () => {
  const md = renderReport({ ...base, result: "PASS", notCleaned: [] });
  assert.doesNotMatch(md, /Không dọn được/);
});

test("Feature 1 không truyền commit/BE thì không mọc dòng rỗng", () => {
  const md = renderReport({
    result: "PASS",
    prUrl: "https://github.com/agribeacon/sutagrow-api/pull/1",
    planeUrls: [],
    tested: ["a"],
    skipped: [],
    script: "test('x', async () => {});",
  });
  assert.doesNotMatch(md, /\*\*Commit:\*\*/);
  assert.doesNotMatch(md, /\*\*BE:\*\*/);
  assert.doesNotMatch(md, /\n\n\n/);
});

test("BLOCKED vẫn giữ bullet đã test để biết chạy tới đâu", () => {
  const md = renderReport({
    ...base,
    result: "BLOCKED",
    blockedReason: "rate-limited",
  });
  assert.match(md, /### Đã test/);
  assert.match(md, /login → tạo farm/);
});
