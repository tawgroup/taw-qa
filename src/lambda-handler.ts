import {
  DescribeInstancesCommand,
  EC2Client,
  StartInstancesCommand,
} from "@aws-sdk/client-ec2";
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import {
  GetParameterCommand,
  PutParameterCommand,
  SSMClient,
} from "@aws-sdk/client-ssm";
import { DROP_IS_SILENT, decide, verifySignature } from "./webhook.ts";

const ec2 = new EC2Client({});
const ssm = new SSMClient({});
const sm = new SecretsManagerClient({});

const SECRET_ID = process.env.SECRET_ID!;
const INSTANCE_ID = process.env.INSTANCE_ID!;
const LOCK_PARAM = process.env.LOCK_PARAM!;
const REPO_ALLOWED = process.env.REPO_ALLOWED!;

type Secret = {
  app_id: string;
  installation_id: string;
  webhook_secret: string;
  private_key_pem: string;
};

let cached: Secret | null = null;
async function secret(): Promise<Secret> {
  // Lambda giữ lại giữa các invocation; đỡ một round-trip cho lần warm.
  if (cached) return cached;
  const r = await sm.send(new GetSecretValueCommand({ SecretId: SECRET_ID }));
  cached = JSON.parse(r.SecretString!) as Secret;
  return cached;
}

const STALE_LOCK_MS = 60 * 60 * 1000;

async function lockIsStale(): Promise<boolean> {
  try {
    const r = await ssm.send(new GetParameterCommand({ Name: LOCK_PARAM }));
    const claimedAt = JSON.parse(r.Parameter?.Value ?? "{}").claimedAt;
    if (typeof claimedAt !== "string") return true; // không đọc được = rác
    return Date.now() - Date.parse(claimedAt) > STALE_LOCK_MS;
  } catch {
    return false; // đọc không được thì coi như đang bận, an toàn hơn
  }
}

const reply = (statusCode: number, body: string) => ({
  statusCode,
  headers: { "content-type": "text/plain" },
  body,
});

export async function handler(event: {
  body?: string;
  isBase64Encoded?: boolean;
  headers?: Record<string, string | undefined>;
}) {
  // Chữ ký tính trên raw body. API Gateway có thể base64 hoá — giải mã trước,
  // và tuyệt đối không parse rồi stringify lại, sẽ đổi byte và hỏng HMAC.
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body ?? "", "base64").toString("utf8")
    : (event.body ?? "");

  const h = Object.fromEntries(
    Object.entries(event.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
  );

  const { webhook_secret } = await secret();
  if (!verifySignature(webhook_secret, raw, h["x-hub-signature-256"])) {
    console.warn("bad signature");
    return reply(401, "bad signature");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return reply(400, "malformed json");
  }

  const d = decide({
    event: h["x-github-event"],
    payload: payload as never,
    repoAllowed: REPO_ALLOWED,
  });

  if (!d.run) {
    console.log("drop:", d.reason);
    // 200 kể cả khi bỏ qua: non-2xx làm GitHub đánh dấu delivery lỗi và retry,
    // trong khi "không phải việc của mình" không phải là lỗi.
    return reply(200, `ignored: ${d.reason}`);
  }

  const lockValue = JSON.stringify({
    repo: d.repo,
    prNumber: d.prNumber,
    installationId: d.installationId,
    actor: d.actor,
    claimedAt: new Date().toISOString(),
  });

  // Giành ổ khoá. Overwrite=false nên hai request cùng lúc chỉ một người thắng.
  try {
    await ssm.send(
      new PutParameterCommand({
        Name: LOCK_PARAM,
        Type: "String",
        Overwrite: false,
        Value: lockValue,
      }),
    );
  } catch (e) {
    if ((e as { name?: string }).name !== "ParameterAlreadyExists") throw e;

    // Runner chết trước khi kịp xoá khoá thì khoá kẹt vĩnh viễn và mọi
    // `/taw-qa` sau đó đều báo "busy". Timeout một lần chạy là 45 phút, nên
    // khoá quá 60 phút chắc chắn là rác — cướp lại.
    if (!(await lockIsStale())) {
      console.log("busy: run already claimed");
      return reply(200, "busy");
    }
    console.warn("stale lock, taking over");
    await ssm.send(
      new PutParameterCommand({
        Name: LOCK_PARAM,
        Type: "String",
        Overwrite: true,
        Value: lockValue,
      }),
    );
  }

  const state = await ec2.send(
    new DescribeInstancesCommand({ InstanceIds: [INSTANCE_ID] }),
  );
  const name =
    state.Reservations?.[0]?.Instances?.[0]?.State?.Name ?? "unknown";

  if (name === "stopped") {
    await ec2.send(new StartInstancesCommand({ InstanceIds: [INSTANCE_ID] }));
    console.log("runner starting for PR", d.prNumber);
  } else {
    // Giữ được khoá mà máy không ở `stopped`: đang tắt dở hoặc vừa boot.
    // Không start chồng; runner sẽ nhặt khoá ở lần boot tới.
    console.log("lock claimed, instance state:", name);
  }

  return reply(202, `queued pr#${d.prNumber}`);
}

export { DROP_IS_SILENT };
