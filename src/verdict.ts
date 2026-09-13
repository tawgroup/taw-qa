export type Verdict = "PASS" | "FAIL" | "BLOCKED";

export type BlockedReason =
  | "be-unhealthy"
  | "be-restarted"
  | "be-flaky"
  | "rate-limited"
  | "prod-guard"
  | "timeout";

/** Số Proxy gom trong suốt lần chạy, dùng để suy BLOCKED. */
export type RunSignals = {
  /** `data.uptime` của `GET {BE_URL}/health` trước khi chạy. null = không gọi được. */
  uptimeBefore: number | null;
  /** Sau khi chạy. null = không gọi được. */
  uptimeAfter: number | null;
  count429: number;
  count5xx: number;
  connectionErrors: number;
  prodGuardTripped: boolean;
  timedOut: boolean;
};

export const BLOCKED_TEXT: Record<BlockedReason, string> = {
  "be-unhealthy": "BE staging không xanh trước khi chạy (`/health` không 200).",
  "be-restarted":
    "BE staging restart giữa lúc chạy (`uptime` tụt). Nhiều khả năng `deploy-staging.yml` vừa deploy.",
  "be-flaky": "BE staging trả 5xx hoặc rớt kết nối giữa lúc chạy.",
  "rate-limited":
    "BE staging trả 429. Trần 2000 request / 900s dùng chung theo IP Runner.",
  "prod-guard": "Proxy từ chối start: `BE_URL` trỏ vào host production.",
  timeout: "Hết 45 phút cho một lần chạy.",
};

/**
 * Thứ tự ưu tiên cố định: lý do nào chắc chắn nhất về "không kết luận được"
 * thì thắng, để Report không đổi chữ giữa hai lần chạy giống nhau.
 */
export function blockedReason(s: RunSignals): BlockedReason | null {
  if (s.prodGuardTripped) return "prod-guard";
  if (s.uptimeBefore === null) return "be-unhealthy";
  if (s.timedOut) return "timeout";
  if (s.uptimeAfter !== null && s.uptimeAfter < s.uptimeBefore)
    return "be-restarted";
  // Không đọc được uptime sau, mà trước thì đọc được → BE đã đi đâu đó.
  if (s.uptimeAfter === null) return "be-flaky";
  if (s.count429 > 0) return "rate-limited";
  if (s.count5xx > 0 || s.connectionErrors > 0) return "be-flaky";
  return null;
}

export type ClaimOutcome = { text: string; green: boolean };

/**
 * BLOCKED thắng cả PASS lẫn FAIL: assertion đỏ vì BE restart không phải lỗi PR,
 * và assertion xanh trong lúc BE chập không đủ để nói PR đúng.
 */
export function decideVerdict(opts: {
  signals: RunSignals;
  claims: ClaimOutcome[];
}): { verdict: Verdict; reason?: BlockedReason; failReason?: string } {
  const blocked = blockedReason(opts.signals);
  if (blocked) return { verdict: "BLOCKED", reason: blocked };

  if (opts.claims.length === 0)
    return { verdict: "FAIL", failReason: "zero testable claim" };

  const red = opts.claims.filter((c) => !c.green);
  if (red.length > 0)
    return { verdict: "FAIL", failReason: `${red.length} claim đỏ` };

  return { verdict: "PASS" };
}
