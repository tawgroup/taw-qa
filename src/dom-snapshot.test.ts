import assert from "node:assert/strict";
import test from "node:test";
import {
  parseSnapshotOutput,
  renderForPrompt,
  snapshotScript,
  type PageSnapshot,
} from "./dom-snapshot.ts";

test("script dùng @playwright/test của repo, không phải bản cài sẵn", () => {
  const s = snapshotScript("http://127.0.0.1:3000", ["/login"]);
  assert.match(s, /require\('@playwright\/test'\)/);
  assert.match(s, /"\/login"/);
});

test("đọc được JSON sau marker, bỏ qua log phía trước", () => {
  const out = parseSnapshotOutput(
    'linh tinh\nnhiễu\n###SNAPSHOT###[{"path":"/login","ok":true}]',
  );
  assert.deepEqual(out, [{ path: "/login", ok: true }]);
});

test("không có marker hoặc JSON hỏng thì trả rỗng, không ném", () => {
  assert.deepEqual(parseSnapshotOutput("không có gì"), []);
  assert.deepEqual(parseSnapshotOutput("###SNAPSHOT###{hỏng"), []);
});

test("prompt liệt kê phần tử có thật và dặn đừng đoán", () => {
  const s: PageSnapshot[] = [
    {
      path: "/login",
      ok: true,
      title: "SutaGrow",
      text: "Chào mừng trở lại",
      elements: [{ role: "button", name: "Đăng nhập →" }],
    },
  ];
  const p = renderForPrompt(s);
  // Đây là thứ ngăn model viết exact:true cho chuỗi không tồn tại nguyên vẹn.
  assert.match(p, /Đăng nhập →/);
  assert.match(p, /Đừng đoán/);
});

test("trang mở không được thì nói rõ, không im lặng bỏ qua", () => {
  const p = renderForPrompt([{ path: "/x", ok: false, error: "timeout" }]);
  assert.match(p, /MỞ KHÔNG ĐƯỢC: timeout/);
});

test("không có snapshot thì trả chuỗi rỗng, prompt không có phần thừa", () => {
  assert.equal(renderForPrompt([]), "");
});
