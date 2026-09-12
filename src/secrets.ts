import { PATHS } from "./config.ts";

export type SecretInput = {
  ghToken: string | undefined;
  planeApiKey: string | undefined;
  apiEnvExists: boolean;
  webEnvExists: boolean;
  apiEnvPath?: string;
  webEnvPath?: string;
};

export function missingSecretMessages(input: SecretInput): string[] {
  const apiPath = input.apiEnvPath ?? PATHS.apiEnv;
  const webPath = input.webEnvPath ?? PATHS.webEnv;
  const msgs: string[] = [];
  if (!input.ghToken) {
    msgs.push(
      "Thiếu GH_TOKEN. Chạy gh auth login (account nghiahsgs) rồi thử lại. Không bịa token.",
    );
  }
  if (!input.planeApiKey) {
    msgs.push(
      "Thiếu PLANE_API_KEY. Đặt env PLANE_API_KEY hoặc thêm vào ~/.claude/settings.json (ô env). Không bịa key.",
    );
  }
  if (!input.apiEnvExists) {
    msgs.push(`Thiếu file .env api: ${apiPath}. Tạo file rồi chạy lại. Không bịa secret.`);
  }
  if (!input.webEnvExists) {
    msgs.push(`Thiếu file .env web: ${webPath}. Tạo file rồi chạy lại. Không bịa secret.`);
  }
  return msgs;
}

export function readPlaneKeyFromSettings(jsonText: string): string | undefined {
  try {
    const parsed = JSON.parse(jsonText) as { env?: { PLANE_API_KEY?: unknown } };
    const key = parsed.env?.PLANE_API_KEY;
    return typeof key === "string" && key.length > 0 ? key : undefined;
  } catch {
    return undefined;
  }
}
