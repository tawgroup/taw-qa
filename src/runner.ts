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

/**
 * Runner LUÔN phải tự dọn, kể cả khi hỏng giữa chừng. Không dọn thì instance
 * chạy mãi ở $0.2394/giờ và khoá SSM kẹt 60 phút — mọi `/taw-qa` sau đó báo bận.
 * Vì vậy đây nằm ở `finally`, không nằm ở đường thành công.
 */
export async function releaseAndShutdown(): Promise<void> {
  const region = process.env.AWS_REGION ?? "ap-southeast-1";
  const param = process.env.LOCK_PARAM ?? "/taw-qa/current-run";
  try {
    const { SSMClient, DeleteParameterCommand } = await import("@aws-sdk/client-ssm");
    await new SSMClient({ region }).send(new DeleteParameterCommand({ Name: param }));
    console.log("[runner] đã nhả khoá", param);
  } catch (e) {
    console.error("[runner] nhả khoá lỗi:", (e as Error).message);
  }

  if (process.env.TAW_QA_NO_SHUTDOWN === "1") {
    console.log("[runner] TAW_QA_NO_SHUTDOWN=1 — không tắt máy");
    return;
  }
  try {
    const id = await fetch(
      "http://169.254.169.254/latest/meta-data/instance-id",
      { headers: { "X-aws-ec2-metadata-token": await imdsToken() } },
    ).then((r) => r.text());
    const { EC2Client, StopInstancesCommand } = await import("@aws-sdk/client-ec2");
    await new EC2Client({ region }).send(
      new StopInstancesCommand({ InstanceIds: [id] }),
    );
    console.log("[runner] đã yêu cầu tắt", id);
  } catch (e) {
    console.error("[runner] tắt máy lỗi:", (e as Error).message);
  }
}

async function imdsToken(): Promise<string> {
  // IMDSv2 bắt buộc (metadata_options.http_tokens = "required").
  const r = await fetch("http://169.254.169.254/latest/api/token", {
    method: "PUT",
    headers: { "X-aws-ec2-metadata-token-ttl-seconds": "60" },
  });
  return r.text();
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
  main()
    .catch((e) => {
      console.error("[runner] vỡ:", e);
      return 1;
    })
    .finally(releaseAndShutdown)
    .then((code) => process.exit(typeof code === "number" ? code : 1));
}
