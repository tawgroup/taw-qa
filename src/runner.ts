/**
 * Chạy trên EC2 Runner, do user-data gọi mỗi lần boot.
 *
 * Trạng thái: khung. Các bước đã có module thật thì gọi module; bước chưa có
 * thì dừng ở BLOCKED với lý do rõ, KHÔNG giả vờ chạy tiếp. Một Runner boot lên
 * rồi im lặng không làm gì là thứ khó debug nhất của hệ này.
 */
import { claimsFromPrBody } from "./block.ts";
import { assembleClaims } from "./claims.ts";
import { newSignals, readUptime, startProxy } from "./proxy.ts";
import { assertNotProd } from "./project-config.ts";
import { decideVerdict } from "./verdict.ts";

export type RunLock = {
  repo: string;
  prNumber: number;
  installationId: number;
  actor: string;
  claimedAt: string;
};

export type Step =
  | "read-lock"
  | "read-pr"
  | "parse-block"
  | "checkout"
  | "write-env"
  | "start-proxy"
  | "snapshot-and-spec"
  | "run-playwright"
  | "cleanup"
  | "report"
  | "shutdown";

export const STEPS: Step[] = [
  "read-lock",
  "read-pr",
  "parse-block",
  "checkout",
  "write-env",
  "start-proxy",
  "snapshot-and-spec",
  "run-playwright",
  "cleanup",
  "report",
  "shutdown",
];

/** Bước đã có module thật đứng sau. Phần còn lại chưa implement. */
export const IMPLEMENTED: Record<Step, boolean> = {
  "read-lock": false,
  "read-pr": false,
  "parse-block": true, // src/block.ts
  checkout: false,
  "write-env": false, // src/project-config.ts có renderFeEnv, thiếu phần ghi file
  "start-proxy": true, // src/proxy.ts
  "snapshot-and-spec": false, // skill qa-loop, cần Claude API key
  "run-playwright": false,
  cleanup: false, // src/cleanup.ts mới có hợp đồng prefix
  report: false, // src/report.ts render được, thiếu phần đăng lên GitHub
  shutdown: false,
};

export function firstUnimplemented(): Step | null {
  return STEPS.find((s) => !IMPLEMENTED[s]) ?? null;
}

export async function main(): Promise<number> {
  const blocked = firstUnimplemented();
  console.log(`[runner] ${new Date().toISOString()}`);
  console.log(`[runner] các bước đã có module: ${STEPS.filter((s) => IMPLEMENTED[s]).join(", ")}`);

  if (blocked) {
    console.error(
      `[runner] DỪNG ở bước "${blocked}" — chưa implement.\n` +
        `[runner] Không chạy tiếp để tránh Report sai hoặc ghi nhầm vào staging.`,
    );
    return 2;
  }

  // Khi mọi bước xong, chỗ này thành pipeline thật. Các import phía trên là
  // hợp đồng: đổi chữ ký hàm nào thì file này phải gãy lúc typecheck.
  void claimsFromPrBody;
  void assembleClaims;
  void assertNotProd;
  void startProxy;
  void readUptime;
  void newSignals;
  void decideVerdict;
  return 0;
}

if (process.argv[1]?.endsWith("runner.ts")) {
  main().then((code) => process.exit(code));
}
