import assert from "node:assert/strict";
import test from "node:test";
import type { TestableClaim } from "./claims.ts";
import { buildSpec, parseClaim } from "./online-spec.ts";

const claim = (text: string): TestableClaim => ({
  text,
  layer: "web",
  hasAssertion: true,
});

test("tách đường dẫn và chữ cần thấy", () => {
  assert.deepEqual(parseClaim("e2e: mở /login thấy Email"), {
    path: "/login",
    expects: ["Email"],
  });
});

test('"hoặc" thành nhiều ứng viên', () => {
  assert.deepEqual(
    parseClaim("e2e: trang /login hiện Login hoặc Register"),
    { path: "/login", expects: ["Login", "Register"] },
  );
});

test("chuỗi trong ngoặc kép được ưu tiên", () => {
  assert.deepEqual(parseClaim('mở /farms thấy "Tạo trang trại"'), {
    path: "/farms",
    expects: ["Tạo trang trại"],
  });
});

test("Claim không có đường dẫn thì không sinh được", () => {
  assert.equal(parseClaim("login rồi tạo farm"), null);
});

test("spec khai serial và import @playwright/test", () => {
  const s = buildSpec([claim("e2e: mở /login thấy Email")], 916);
  assert.match(s.text, /test\.describe\.configure\(\{ mode: 'serial' \}\)/);
  assert.match(s.text, /from '@playwright\/test'/);
  assert.equal(s.path, "tests/e2e/taw-qa-pr-916.spec.ts");
});

test("Claim của PR #916 sinh ra 2 case, không cái nào bị bỏ", () => {
  const s = buildSpec(
    [
      claim("e2e: mở /login thấy Email"),
      claim("e2e: trang login hiện Login hoặc Register"),
    ],
    916,
  );
  // Claim 2 không có đường dẫn dạng /xxx → không sinh được, phải báo rõ.
  assert.equal(s.unsupported.length, 1);
  assert.match(s.text, /claim 1/);
});

test("Claim không sinh được thì vào unsupported chứ không im lặng biến mất", () => {
  const s = buildSpec([claim("kiểm tra logic tính lương")], 1);
  assert.deepEqual(s.unsupported, ["kiểm tra logic tính lương"]);
  assert.doesNotMatch(s.text, /test\(/);
});
