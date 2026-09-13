import type { RunLock } from "./runner.ts";

const REGION = process.env.AWS_REGION ?? "ap-southeast-1";
const PARAM = process.env.LOCK_PARAM ?? "/taw-qa/current-run";

export function parseLock(raw: string): RunLock | null {
  try {
    const d = JSON.parse(raw) as Partial<RunLock>;
    if (
      typeof d.repo !== "string" ||
      typeof d.prNumber !== "number" ||
      typeof d.installationId !== "number"
    )
      return null;
    return {
      repo: d.repo,
      prNumber: d.prNumber,
      installationId: d.installationId,
      actor: d.actor ?? "unknown",
      claimedAt: d.claimedAt ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function readLock(): Promise<RunLock | null> {
  const { SSMClient, GetParameterCommand } = await import("@aws-sdk/client-ssm");
  try {
    const r = await new SSMClient({ region: REGION }).send(
      new GetParameterCommand({ Name: PARAM }),
    );
    return parseLock(r.Parameter?.Value ?? "");
  } catch {
    // Không có khoá = boot không phải do `/taw-qa` (ví dụ bro bật tay).
    return null;
  }
}
