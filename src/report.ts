import { GITHUB_COMMENT_MAX } from "./config.ts";
import { BLOCKED_TEXT, type BlockedReason } from "./verdict.ts";

export function planeUrlsForReport(
  skipPlane: boolean,
  matched: { url: string }[],
): string[] {
  return skipPlane ? [] : matched.map((m) => m.url);
}

export type ReportInput = {
  result: "PASS" | "FAIL" | "BLOCKED";
  prUrl: string;
  planeUrls: string[];
  tested: string[];
  skipped: string[];
  script: string;
  error?: string;
  screenshotUrl?: string;
  otherRepoAtStaging?: string;
  /** Feature 2: SHA đã checkout. Feature 1 không có, bỏ trống thì không in dòng. */
  commit?: string;
  /** Feature 2: BE_URL đã test vào. */
  beUrl?: string;
  /** Feature 2: thực thể `tawqa-pr<n>-` dọn không được. Không đổi verdict. */
  notCleaned?: string[];
  /** Bắt buộc khi result là BLOCKED. */
  blockedReason?: BlockedReason;
};

function planeLine(urls: string[]): string {
  if (urls.length === 0) return "";
  return `**Plane:** ${urls.join(", ")}\n`;
}

function commitLine(commit?: string): string {
  return commit ? `**Commit:** \`${commit}\`\n` : "";
}

function beLine(beUrl?: string): string {
  return beUrl ? `**BE:** ${beUrl}\n` : "";
}

function notCleanedSection(items?: string[]): string {
  if (!items || items.length === 0) return "";
  return `### Không dọn được\n\n${bullets(items)}\n`;
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

  if (input.result === "BLOCKED") {
    const why = input.blockedReason
      ? BLOCKED_TEXT[input.blockedReason]
      : (input.error ?? "unknown");
    // Không kết luận được về PR, nên không có Screenshot và không có Script chốt.
    return [
      header,
      "",
      pr,
      plane.trimEnd(),
      commitLine(input.commit).trimEnd(),
      beLine(input.beUrl).trimEnd(),
      "",
      `### Lý do\n\n${why}\n`,
      tested,
      notCleanedSection(input.notCleaned),
    ]
      .filter((s) => s !== "")
      .join("\n")
      .replace(/\n{3,}/g, "\n\n");
  }

  if (input.result === "PASS") {
    return [
      header,
      "",
      pr,
      plane.trimEnd(),
      commitLine(input.commit).trimEnd(),
      beLine(input.beUrl).trimEnd(),
      staging.trimEnd(),
      "",
      tested,
      skipped,
      notCleanedSection(input.notCleaned),
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
    commitLine(input.commit).trimEnd(),
    beLine(input.beUrl).trimEnd(),
    staging.trimEnd(),
    "",
    tested,
    skipped,
    error,
    shot,
    notCleanedSection(input.notCleaned),
    scriptFence(input.script, "### Script (chưa chốt)"),
  ]
    .filter((s) => s !== "")
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}
