import assert from "node:assert/strict";
import test from "node:test";
import {
  claimLinesFromBlock,
  claimsFromPrBody,
  extractBlocks,
} from "./block.ts";

test("cắt bullet trong block, bỏ văn xuôi ngoài block", () => {
  const body = [
    "Fix cái nút Tạo farm.",
    "- dòng này ngoài block, không tính",
    "<taw-qa start>",
    "Kịch bản:",
    "- POST /farms trả về 201",
    "- e2e: login → tạo farm → thấy trên list",
    "<taw-qa end>",
    "cc @dominic",
  ].join("\n");
  const got = claimsFromPrBody(body);
  assert.equal(got.ok, true);
  assert.deepEqual(got.ok && got.claims, [
    "POST /farms trả về 201",
    "e2e: login → tạo farm → thấy trên list",
  ]);
});

test("nhiều block thì union và dedup theo dòng", () => {
  const body = [
    "<taw-qa start>",
    "- POST /farms trả về 201",
    "<taw-qa end>",
    "giữa chừng",
    "<taw-qa start>",
    "- POST /farms trả về 201",
    "- GET /farms/:id trả về 200",
    "<taw-qa end>",
  ].join("\n");
  const got = claimsFromPrBody(body);
  assert.deepEqual(got.ok && got.claims, [
    "POST /farms trả về 201",
    "GET /farms/:id trả về 200",
  ]);
});

test("không có block thì trả comment nhắc, không đoán Claim", () => {
  const got = claimsFromPrBody("- POST /farms trả về 201");
  assert.equal(got.ok, false);
  assert.match(got.ok === false ? got.comment : "", /thiếu block/);
});

test("block mở mà không đóng thì coi như thiếu block", () => {
  const body = ["<taw-qa start>", "- POST /farms trả về 201"].join("\n");
  assert.deepEqual(extractBlocks(body), { ok: false, reason: "unclosed" });
  assert.equal(claimsFromPrBody(body).ok, false);
});

test("marker giữa dòng văn xuôi không mở block", () => {
  const body = "dùng <taw-qa start> để khai báo kịch bản nhé";
  assert.deepEqual(extractBlocks(body), { ok: false, reason: "no-block" });
});

test("body rỗng", () => {
  assert.deepEqual(extractBlocks(""), { ok: false, reason: "no-block" });
});

test("block rỗng vẫn ok nhưng zero Claim", () => {
  const got = claimsFromPrBody("<taw-qa start>\nchưa viết gì\n<taw-qa end>");
  assert.equal(got.ok, true);
  assert.deepEqual(got.ok && got.claims, []);
});

test("claimLinesFromBlock nhận cả -, * và 1.", () => {
  assert.deepEqual(
    claimLinesFromBlock(["- a", "* b", "1. c", "không phải bullet"]),
    ["a", "b", "c"],
  );
});

test("fenced block ```taw-qa là cú pháp khuyên dùng", () => {
  const body = [
    "Sửa nút Tạo farm.",
    "",
    "```taw-qa",
    "- POST /farms trả về 201",
    "- e2e: login → tạo farm → thấy trên list",
    "```",
    "",
    "cc @dominic",
  ].join("\n");
  const got = claimsFromPrBody(body);
  assert.deepEqual(got.ok && got.claims, [
    "POST /farms trả về 201",
    "e2e: login → tạo farm → thấy trên list",
  ]);
});

test("HTML comment cũng được, dùng khi muốn Claim hiện như văn xuôi", () => {
  const body = [
    "<!-- taw-qa:start -->",
    "- POST /farms trả về 201",
    "<!-- taw-qa:end -->",
  ].join("\n");
  assert.deepEqual(claimsFromPrBody(body).claims, ["POST /farms trả về 201"]);
});

test("cú pháp cũ <taw-qa start> vẫn chạy — PR đã viết không gãy", () => {
  const body = "<taw-qa start>\n- POST /farms trả về 201\n<taw-qa end>";
  assert.deepEqual(claimsFromPrBody(body).claims, ["POST /farms trả về 201"]);
});

test("trộn nhiều cú pháp trong một PR thì gộp hết", () => {
  const body = [
    "```taw-qa",
    "- a",
    "```",
    "<!-- taw-qa:start -->",
    "- b",
    "<!-- taw-qa:end -->",
  ].join("\n");
  assert.deepEqual(claimsFromPrBody(body).claims, ["a", "b"]);
});

test("fence mở mà không đóng thì báo unclosed, không nuốt hết PR body", () => {
  const body = "```taw-qa\n- a\n\nĐoạn văn phía sau";
  assert.deepEqual(extractBlocks(body), { ok: false, reason: "unclosed" });
});

test("fence ngôn ngữ khác không bị nhận nhầm", () => {
  const body = "```ts\nconst a = 1;\n```";
  assert.deepEqual(extractBlocks(body), { ok: false, reason: "no-block" });
});

test("comment nhắc dùng fenced block, không dùng thẻ HTML", () => {
  const c = claimsFromPrBody("không có gì");
  assert.equal(c.ok, false);
  const txt = c.ok === false ? c.comment : "";
  assert.match(txt, /```taw-qa/);
  // Thẻ <taw-qa> bị GitHub sanitize nên không được khuyên dùng nữa.
  assert.doesNotMatch(txt, /<taw-qa start>/);
});
