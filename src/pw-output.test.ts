import assert from "node:assert/strict";
import test from "node:test";
import { failureExcerpt, parseResults, stripAnsi } from "./pw-output.ts";

/** Trích nguyên văn từ lần chạy thật trên PR #916, kèm mã màu ANSI. */
const REAL = "[WebServer] \u25cb  (Static)   prerendered as static content\n[WebServer]  \u001b[32m\u001b[1m\u2713\u001b[22m\u001b[39m Ready in 233ms\n[global-setup] mock API state reset\n\nRunning 2 tests using 1 worker\n\n  \u2713  1 [chromium] \u203a tests/e2e/taw-qa-pr-916.spec.ts:6:7 \u203a tawqa-pr916- /login page \u203a m\u1edf /login th\u1ea5y Email (1.3s)\n  \u2718  2 [chromium] \u203a tests/e2e/taw-qa-pr-916.spec.ts:11:7 \u203a tawqa-pr916- /login page \u203a m\u1edf /login th\u1ea5y \u0110\u0103ng nh\u1eadp (5.5s)\n\n  1) [chromium] \u203a tests/e2e/taw-qa-pr-916.spec.ts:11:7 \u203a m\u1edf /login th\u1ea5y \u0110\u0103ng nh\u1eadp\n\n    Error: expect(locator).toBeVisible() failed\n    Locator: getByText('\u0110\u0103ng nh\u1eadp', { exact: true }).first()\n    Error: element(s) not found";

test("đọc được từng test xanh/đỏ, không phải một con số chung", () => {
  assert.deepEqual(parseResults(REAL), [
    { title: "mở /login thấy Email", green: true },
    { title: "mở /login thấy Đăng nhập", green: false },
  ]);
});

test("test bị bỏ qua trong mode serial không tính là đỏ", () => {
  assert.deepEqual(parseResults("  -  2 [chromium] › a.spec.ts:1:1 › bị bỏ qua"), []);
});

test("bỏ mã màu ANSI", () => {
  assert.doesNotMatch(stripAnsi(REAL), /\x1b/);
  assert.match(stripAnsi(REAL), /✓ Ready in 233ms/);
});

test("cắt bỏ log build, giữ phần lỗi thật", () => {
  const e = failureExcerpt(REAL);
  assert.doesNotMatch(e, /WebServer/);
  assert.doesNotMatch(e, /prerendered/);
  assert.match(e, /element\(s\) not found/);
  assert.match(e, /exact: true/);
});

test("không có khối lỗi đánh số thì vẫn bỏ dòng WebServer", () => {
  const e = failureExcerpt("[WebServer] build xong\nError: ECONNREFUSED");
  assert.doesNotMatch(e, /WebServer/);
  assert.match(e, /ECONNREFUSED/);
});

test("cắt theo maxChars và báo rõ đã cắt", () => {
  const e = failureExcerpt("1) [chromium] › x\n" + "y".repeat(5000), 200);
  assert.ok(e.length < 300);
  assert.match(e, /cắt bớt/);
});
