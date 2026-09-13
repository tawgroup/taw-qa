import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { decide, verifySignature, type WebhookPayload } from "./webhook.ts";

const REPO = "agribeacon/sutagrow-web";

/** Rút gọn từ delivery thật của PR #916 (issue_comment, 2026-09-13). */
const real: WebhookPayload = {
  action: "created",
  issue: {
    number: 916,
    pull_request: {
      url: "https://api.github.com/repos/agribeacon/sutagrow-web/pulls/916",
      html_url: "https://github.com/agribeacon/sutagrow-web/pull/916",
      diff_url: "https://github.com/agribeacon/sutagrow-web/pull/916.diff",
      patch_url: "https://github.com/agribeacon/sutagrow-web/pull/916.patch",
      merged_at: null,
    },
  },
  comment: { body: "/taw-qa", author_association: "MEMBER" },
  repository: { full_name: REPO },
  installation: { id: 161274772 },
  sender: { login: "nghiahsgs" },
};

const run = (p: WebhookPayload, event = "issue_comment") =>
  decide({ event, payload: p, repoAllowed: REPO });

test("payload thật của PR #916 được chạy", () => {
  assert.deepEqual(run(real), {
    run: true,
    repo: REPO,
    prNumber: 916,
    installationId: 161274772,
    actor: "nghiahsgs",
  });
});

test("MEMBER được chạy — chủ org comment trên repo mình vẫn là MEMBER", () => {
  for (const a of ["OWNER", "MEMBER", "COLLABORATOR"])
    assert.equal(
      run({ ...real, comment: { ...real.comment, author_association: a } }).run,
      true,
      a,
    );
});

test("người ngoài bị chặn", () => {
  for (const a of ["CONTRIBUTOR", "FIRST_TIME_CONTRIBUTOR", "NONE", "MANNEQUIN"]) {
    const got = run({ ...real, comment: { ...real.comment, author_association: a } });
    assert.deepEqual(got, { run: false, reason: "not-allowed" }, a);
  }
});

test("issue thường không phải PR thì bỏ", () => {
  assert.deepEqual(run({ ...real, issue: { number: 916 } }), {
    run: false,
    reason: "not-a-pr",
  });
});

test("repo khác thì bỏ", () => {
  assert.deepEqual(
    run({ ...real, repository: { full_name: "agribeacon/sutagrow-api" } }),
    { run: false, reason: "wrong-repo" },
  );
});

test("comment sửa hoặc xoá không kích hoạt", () => {
  for (const action of ["edited", "deleted"])
    assert.deepEqual(run({ ...real, action }), { run: false, reason: "not-created" });
});

test("event khác thì bỏ", () => {
  assert.deepEqual(run(real, "pull_request"), { run: false, reason: "wrong-event" });
});

test("chỉ khớp lệnh ở đầu comment", () => {
  const body = (b: string) => run({ ...real, comment: { ...real.comment, body: b } });
  assert.equal(body("/taw-qa").run, true);
  assert.equal(body("  /taw-qa  ").run, true);
  assert.equal(body("/taw-qa live").run, true);
  assert.equal(body("nhắc @nghiahsgs chạy /taw-qa nhé").run, false);
  assert.equal(body("/taw-qask").run, false);
  assert.equal(body("").run, false);
});

test("thiếu installation.id là malformed, không phải chạy liều", () => {
  const { installation, ...rest } = real;
  assert.deepEqual(run(rest), { run: false, reason: "malformed" });
});

test("HMAC: chữ ký đúng qua, sai thì trượt", () => {
  const secret = "test-secret-khong-phai-secret-that";
  const body = JSON.stringify(real);
  const sig =
    "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");

  assert.equal(verifySignature(secret, body, sig), true);
  assert.equal(verifySignature(secret, body, undefined), false);
  assert.equal(verifySignature("sai-secret", body, sig), false);
  assert.equal(verifySignature(secret, body + " ", sig), false);
  assert.equal(verifySignature(secret, body, "sha256=deadbeef"), false);
});

test("chữ ký tính trên raw body, parse rồi stringify lại là hỏng", () => {
  const secret = "s";
  const raw = '{"action":"created",  "x":1}';
  const sig = "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
  assert.equal(verifySignature(secret, raw, sig), true);
  assert.equal(
    verifySignature(secret, JSON.stringify(JSON.parse(raw)), sig),
    false,
  );
});
