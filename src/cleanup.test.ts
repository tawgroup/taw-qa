import assert from "node:assert/strict";
import test from "node:test";
import {
  isOwnedByRun,
  nameFor,
  notCleanedLines,
  ownedByAnyRun,
  planCleanup,
  prefixFor,
} from "./cleanup.ts";

test("prefix và tên theo số PR", () => {
  assert.equal(prefixFor(42), "tawqa-pr42-");
  assert.equal(nameFor(42, "farm-a"), "tawqa-pr42-farm-a");
});

test("chỉ nhận thực thể của đúng run này", () => {
  assert.equal(isOwnedByRun("tawqa-pr42-farm-a", 42), true);
  assert.equal(isOwnedByRun("tawqa-pr7-farm-a", 42), false);
  assert.equal(isOwnedByRun("Vườn nho nhà bác Tám", 42), false);
});

test("pr4 không nuốt nhầm pr42", () => {
  assert.equal(isOwnedByRun("tawqa-pr42-farm", 4), false);
  assert.equal(ownedByAnyRun("tawqa-pr42-farm"), 42);
});

test("plan tách của mình, của run khác, và data thật", () => {
  const got = planCleanup(
    [
      { kind: "farm", id: "1", name: "tawqa-pr42-alpha" },
      { kind: "farm", id: "2", name: "tawqa-pr7-beta" },
      { kind: "farm", id: "3", name: "Vườn thật của khách" },
    ],
    42,
  );
  assert.deepEqual(got.mine.map((e) => e.id), ["1"]);
  assert.deepEqual(got.strays.map((e) => e.id), ["2"]);
});

test("data thật không bao giờ vào danh sách xoá", () => {
  const got = planCleanup(
    [{ kind: "farm", id: "9", name: "Nông trại Hiệp Hoà" }],
    42,
  );
  assert.deepEqual(got.mine, []);
  assert.deepEqual(got.strays, []);
});

test("dòng báo cáo cho mục Không dọn được", () => {
  assert.deepEqual(
    notCleanedLines([{ kind: "farm", id: "1", name: "tawqa-pr42-alpha" }]),
    ["farm `tawqa-pr42-alpha` (id `1`)"],
  );
});
