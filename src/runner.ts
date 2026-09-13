/**
 * Chạy trên EC2 Runner, do user-data gọi mỗi lần boot.
 *
 * Trạng thái: khung. Các bước đã có module thật thì gọi module; bước chưa có
 * thì dừng ở BLOCKED với lý do rõ, KHÔNG giả vờ chạy tiếp. Một Runner boot lên
 * rồi im lặng không làm gì là thứ khó debug nhất của hệ này.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { claimsFromPrBody } from "./block.ts";
import { assembleClaims } from "./claims.ts";
import { checkoutPr, writeFeEnv } from "./fe-checkout.ts";
import { installationToken, postComment, readPr, redact } from "./gh-app.ts";
import { buildSpec } from "./online-spec.ts";
import { assertNotProd, type ProjectConfig } from "./project-config.ts";
import { newSignals, readUptime, startProxy } from "./proxy.ts";
import { renderReport } from "./report.ts";
import { readLock } from "./run-lock.ts";
import { decideVerdict, type RunSignals } from "./verdict.ts";

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
  "read-lock": true, // src/run-lock.ts
  "read-pr": true, // src/gh-app.ts
  "parse-block": true, // src/block.ts
  checkout: true, // src/fe-checkout.ts
  "write-env": true, // src/fe-checkout.ts
  "start-proxy": true, // src/proxy.ts
  // Bộ sinh tất định (src/online-spec.ts). Bản do agent viết cần Claude API
  // key trên Runner — chưa có, nên chưa bật.
  "snapshot-and-spec": true,
  "run-playwright": true,
  // Mới có hợp đồng prefix; phần gọi API xoá thực thể cần biết endpoint của BE.
  cleanup: false,
  report: true, // src/report.ts + gh-app.postComment
  shutdown: true, // releaseAndShutdown
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

async function secretJson<T>(name: string): Promise<T> {
  const { SecretsManagerClient, GetSecretValueCommand } = await import(
    "@aws-sdk/client-secrets-manager"
  );
  const r = await new SecretsManagerClient({
    region: process.env.AWS_REGION ?? "ap-southeast-1",
  }).send(new GetSecretValueCommand({ SecretId: name }));
  return JSON.parse(r.SecretString ?? "{}") as T;
}

export async function main(): Promise<number> {
  console.log(`[runner] ${new Date().toISOString()}`);

  const lock = await readLock();
  if (!lock) {
    // Boot không phải do `/taw-qa` (bro bật tay chẳng hạn). Không có việc gì.
    console.log("[runner] không có khoá — không phải lần chạy nào. Thoát.");
    return 0;
  }
  console.log(`[runner] PR #${lock.prNumber} của ${lock.repo}, do ${lock.actor}`);

  const creds = await secretJson<{
    app_id: string;
    installation_id: string;
    private_key_pem: string;
  }>("taw-qa/github-app");
  const cfg = await secretJson<ProjectConfig & { orgScope?: string }>(
    "taw-qa/project/sutagrow-web",
  );

  let token = await installationToken(creds);
  const pr = await readPr(token, lock.repo, lock.prNumber);
  console.log(`[runner] head ${pr.headSha.slice(0, 7)} (${pr.headRef})`);

  // Block là nguồn Claim duy nhất. Không có Block thì nhắc rồi dừng, tuyệt đối
  // không rơi về heuristic đoán Claim của Feature 1.
  const block = claimsFromPrBody(pr.body);
  if (!block.ok) {
    await postComment(token, lock.repo, lock.prNumber, block.comment);
    console.log("[runner] thiếu Block — đã comment nhắc, dừng.");
    return 0;
  }

  const claims = assembleClaims({
    prTitle: pr.title,
    prBody: "",
    planeQa: block.claims,
  });
  console.log(`[runner] ${claims.testable.length} Claim testable`);

  const signals: RunSignals = newSignals();
  let verdictInput: { text: string; green: boolean }[] = [];
  let errorText: string | undefined;
  let proxy: Awaited<ReturnType<typeof startProxy>> | null = null;
  let specText = "";
  const notTested = claims.skipped.map((s) => s.text);

  try {
    assertNotProd(cfg.beUrl);
    signals.uptimeBefore = await readUptime(cfg.beUrl);
    if (signals.uptimeBefore === null) throw new Error("BE health pre-flight đỏ");

    const dir = checkoutPr({
      token,
      repo: lock.repo,
      prNumber: lock.prNumber,
      headSha: pr.headSha,
    });
    writeFeEnv(dir, cfg);

    proxy = await startProxy({
      beUrl: cfg.beUrl,
      beAllowedOrigin: cfg.beAllowedOrigin,
      signals,
    });
    console.log("[runner] proxy nghe 127.0.0.1:3018");

    const plan = buildSpec(claims.testable, lock.prNumber);
    notTested.push(...plan.unsupported.map((t) => `${t} (không sinh được assertion)`));
    specText = plan.text;
    mkdirSync(dirname(`${dir}/${plan.path}`), { recursive: true });
    writeFileSync(`${dir}/${plan.path}`, plan.text);

    if (plan.text.includes("test(")) {
      console.log(`[runner] chạy ${plan.path}`);
      try {
        // CI không set: reuseExistingServer=true nên Playwright dùng proxy có
        // sẵn ở :3018 thay vì cố start mock của repo.
        execFileSync(
          "npx",
          ["playwright", "test", plan.path, "--workers=1", "--reporter=list"],
          { cwd: dir, encoding: "utf8", stdio: "pipe", env: { ...process.env, CI: "" } },
        );
        verdictInput = claims.testable.map((c) => ({ text: c.text, green: true }));
      } catch (e) {
        const out = String((e as { stdout?: string }).stdout ?? (e as Error).message);
        errorText = redact(out.slice(-3000), token);
        verdictInput = claims.testable.map((c) => ({ text: c.text, green: false }));
      }
    }

    signals.uptimeAfter = await readUptime(cfg.beUrl);
  } catch (e) {
    errorText = redact((e as Error).message, token);
    console.error("[runner] lỗi:", errorText);
  } finally {
    await proxy?.close();
  }

  const v = decideVerdict({ signals, claims: verdictInput });
  console.log(`[runner] verdict ${v.verdict}${v.reason ? ` (${v.reason})` : ""}`);

  // Token sống 1h, run tối đa 45 phút — biên mỏng, mà đây là thứ chạy cuối.
  token = await installationToken(creds);
  const md = renderReport({
    result: v.verdict,
    prUrl: pr.htmlUrl,
    planeUrls: [],
    tested: verdictInput.filter((c) => c.green).map((c) => c.text),
    skipped: notTested,
    script: specText,
    error: errorText,
    blockedReason: v.reason,
    commit: pr.headSha.slice(0, 7),
    beUrl: cfg.beUrl,
  });
  const url = await postComment(token, lock.repo, lock.prNumber, md);
  console.log(`[runner] Report: ${url}`);
  return v.verdict === "PASS" ? 0 : 1;
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
