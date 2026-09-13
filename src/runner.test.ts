import assert from "node:assert/strict";
import test from "node:test";
import { IMPLEMENTED, STEPS, firstUnimplemented, main } from "./runner.ts";

test("mọi bước trong STEPS đều khai trạng thái implement", () => {
  for (const s of STEPS) assert.equal(typeof IMPLEMENTED[s], "boolean", s);
  assert.equal(Object.keys(IMPLEMENTED).length, STEPS.length);
});

test("bước chặn hiện tại là read-lock", () => {
  assert.equal(firstUnimplemented(), "read-lock");
});

test("runner thoát mã 2 chứ không im lặng thành công", async () => {
  assert.equal(await main(), 2);
});
