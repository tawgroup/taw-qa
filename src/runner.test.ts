import assert from "node:assert/strict";
import test from "node:test";
import { IMPLEMENTED, STEPS, firstUnimplemented } from "./runner.ts";

test("mọi bước trong STEPS đều khai trạng thái implement", () => {
  for (const s of STEPS) assert.equal(typeof IMPLEMENTED[s], "boolean", s);
  assert.equal(Object.keys(IMPLEMENTED).length, STEPS.length);
});

test("bước duy nhất còn thiếu là cleanup", () => {
  assert.equal(firstUnimplemented(), "cleanup");
  assert.deepEqual(
    STEPS.filter((s) => !IMPLEMENTED[s]),
    ["cleanup"],
  );
});

test("STEPS đúng thứ tự pipeline, report trước shutdown", () => {
  // Tắt máy trước khi đăng Report là lần chạy coi như không xảy ra với người
  // đọc PR. Thứ tự này là ràng buộc, không phải trang trí.
  assert.ok(STEPS.indexOf("report") < STEPS.indexOf("shutdown"));
  assert.ok(STEPS.indexOf("checkout") < STEPS.indexOf("run-playwright"));
  assert.ok(STEPS.indexOf("start-proxy") < STEPS.indexOf("run-playwright"));
});
