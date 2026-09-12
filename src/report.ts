import { GITHUB_COMMENT_MAX } from "./config.ts";

export function planeUrlsForReport(
  skipPlane: boolean,
  matched: { url: string }[],
): string[] {
  return skipPlane ? [] : matched.map((m) => m.url);
}

export type ReportInput = {
  result: "PASS" | "FAIL";
  prUrl: string;
  planeUrls: string[];
  tested: string[];
  skipped: string[];
  script: string;
  error?: string;
  screenshotUrl?: string;
  otherRepoAtStaging?: string;
};

function planeLine(urls: string[]): string {
  if (urls.length === 0) return "";
  return `**Plane:** ${urls.join(", ")}\n`;
}

function bullets(items: string[]): string {
  return items.map((i) => `- ${i}`).join("\n");
}

function scriptFence(script: string, heading: string): string {
  if (script.length + heading.length > GITHUB_COMMENT_MAX) {
    return `${heading}\n\nScript quá 65k ký tự. Đăng gist rồi dán URL vào đây.\n`;
  }
  return `${heading}\n\n\`\`\`ts\n${script}\n\`\`\`\n`;
}

export function renderReport(input: ReportInput): string {
  const header = `## taw-qa: ${input.result}`;
  const pr = `**PR:** ${input.prUrl}`;
  const plane = planeLine(input.planeUrls);
  const staging = input.otherRepoAtStaging
    ? `\nRepo kia đang ở \`staging\` (${input.otherRepoAtStaging}).\n`
    : "";
  const tested =
    input.tested.length > 0
      ? `### Đã test\n\n${bullets(input.tested)}\n`
      : `### Đã test\n\n- (không có)\n`;
  const skipped =
    input.skipped.length > 0
      ? `### Không test\n\n${bullets(input.skipped)}\n`
      : "";

  if (input.result === "PASS") {
    return [
      header,
      "",
      pr,
      plane.trimEnd(),
      staging.trimEnd(),
      "",
      tested,
      skipped,
      scriptFence(input.script, "### Script"),
    ]
      .filter((s) => s !== "")
      .join("\n")
      .replace(/\n{3,}/g, "\n\n");
  }

  const error = `### Lỗi\n\n${input.error ?? "unknown"}\n`;
  const shot = input.screenshotUrl
    ? `### Screenshot\n\n![fail](${input.screenshotUrl})\n`
    : "";
  return [
    header,
    "",
    pr,
    plane.trimEnd(),
    staging.trimEnd(),
    "",
    tested,
    skipped,
    error,
    shot,
    scriptFence(input.script, "### Script (chưa chốt)"),
  ]
    .filter((s) => s !== "")
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}
