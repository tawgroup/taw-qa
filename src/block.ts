const START = "<taw-qa start>";
const END = "<taw-qa end>";

export type BlockResult =
  | { ok: true; lines: string[] }
  | { ok: false; reason: "no-block" | "unclosed" };

/**
 * Cắt mọi đoạn giữa `<taw-qa start>` và `<taw-qa end>`. Mỗi marker phải nằm
 * một mình trên dòng của nó; marker giữa dòng văn xuôi không tính, để nhắc tên
 * feature trong PR body không vô tình mở Block.
 */
export function extractBlocks(prBody: string): BlockResult {
  if (!prBody) return { ok: false, reason: "no-block" };

  const blocks: string[][] = [];
  let open: string[] | null = null;

  for (const raw of prBody.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === START) {
      // `start` lồng trong `start` là lỗi soạn thảo; giữ đoạn đang mở.
      if (open === null) open = [];
      continue;
    }
    if (line === END) {
      if (open !== null) {
        blocks.push(open);
        open = null;
      }
      continue;
    }
    if (open !== null) open.push(raw);
  }

  if (open !== null) return { ok: false, reason: "unclosed" };
  if (blocks.length === 0) return { ok: false, reason: "no-block" };

  const lines = blocks.flat();
  return { ok: true, lines };
}

const BULLET_RE = /^\s*(?:[-*]|\d+\.)\s+(.+)$/;

/** Dòng bullet trong Block là Claim ứng viên. Dòng khác là văn xuôi, bỏ. */
export function claimLinesFromBlock(lines: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of lines) {
    const m = raw.match(BULLET_RE);
    if (!m) continue;
    const text = m[1].trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

export const MISSING_BLOCK_COMMENT = [
  "## taw-qa: thiếu block",
  "",
  "PR body chưa có block `taw-qa`, nên không có Claim nào để verify. taw-qa không tự nghĩ ra kịch bản test.",
  "",
  "Thêm vào PR body rồi comment `/taw-qa` lại:",
  "",
  "```",
  START,
  "- POST /farms trả về 201",
  "- e2e: login → tạo farm → thấy trên list",
  END,
  "```",
  "",
  "Mỗi dòng bullet là một Claim. Dòng chỉ để đi tới màn hình không tính là Claim.",
].join("\n");

export function claimsFromPrBody(
  prBody: string,
): { ok: true; claims: string[] } | { ok: false; comment: string } {
  const block = extractBlocks(prBody);
  if (!block.ok) return { ok: false, comment: MISSING_BLOCK_COMMENT };
  return { ok: true, claims: claimLinesFromBlock(block.lines) };
}
