import crypto from "node:crypto";

export const COMMAND = /^\/taw-qa\b/;

/**
 * `MEMBER` phải nằm trong danh sách: payload thật từ PR #916 cho thấy chủ org
 * comment trên repo của chính mình vẫn được gắn `MEMBER`, không phải `OWNER`.
 * Chặn `MEMBER` là chặn luôn người vận hành.
 */
export const ALLOWED_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

export type WebhookPayload = {
  action?: string;
  issue?: { number?: number; pull_request?: unknown };
  comment?: { body?: string; author_association?: string };
  repository?: { full_name?: string };
  installation?: { id?: number };
  sender?: { login?: string };
};

export type Decision =
  | { run: true; repo: string; prNumber: number; installationId: number; actor: string }
  | { run: false; reason: DropReason };

export type DropReason =
  | "bad-signature"
  | "wrong-event"
  | "not-created"
  | "not-a-pr"
  | "wrong-repo"
  | "not-command"
  | "not-allowed"
  | "malformed";

/**
 * So sánh HMAC bằng timingSafeEqual. Chữ ký tính trên **raw body**, không phải
 * trên object đã parse — parse rồi stringify lại là đổi byte, chữ ký hỏng.
 */
export function verifySignature(
  secret: string,
  rawBody: string | Buffer,
  header: string | undefined,
): boolean {
  if (!header) return false;
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function decide(opts: {
  event: string | undefined;
  payload: WebhookPayload;
  repoAllowed: string;
}): Decision {
  const { event, payload, repoAllowed } = opts;

  if (event !== "issue_comment") return { run: false, reason: "wrong-event" };
  if (payload.action !== "created") return { run: false, reason: "not-created" };

  // Issue thường cũng bắn `issue_comment`; chỉ PR mới có trường này.
  if (!payload.issue?.pull_request) return { run: false, reason: "not-a-pr" };

  if (payload.repository?.full_name !== repoAllowed)
    return { run: false, reason: "wrong-repo" };

  const body = payload.comment?.body ?? "";
  if (!COMMAND.test(body.trim())) return { run: false, reason: "not-command" };

  if (!ALLOWED_ASSOCIATIONS.has(payload.comment?.author_association ?? ""))
    return { run: false, reason: "not-allowed" };

  const prNumber = payload.issue?.number;
  const installationId = payload.installation?.id;
  if (typeof prNumber !== "number" || typeof installationId !== "number")
    return { run: false, reason: "malformed" };

  return {
    run: true,
    repo: repoAllowed,
    prNumber,
    installationId,
    actor: payload.sender?.login ?? "unknown",
  };
}

export const DROP_IS_SILENT: Record<DropReason, boolean> = {
  "bad-signature": true,
  "wrong-event": true,
  "not-created": true,
  "not-a-pr": true,
  "wrong-repo": true,
  "not-command": true,
  // Người có quyền đọc repo gõ `/taw-qa` mà bị bỏ qua im lặng sẽ tưởng bot hỏng.
  "not-allowed": false,
  malformed: false,
};
