const START = "<taw-qa start>";
const END = "<taw-qa end>";

/**
 * Cú pháp KHUYÊN DÙNG: fenced block.
 *
 *     ```taw-qa
 *     - e2e: mở /login thấy Email
 *     ```
 *
 * Vì sao không dùng thẻ `<taw-qa>`: GitHub sanitize tag HTML lạ, nên marker
 * BIẾN MẤT khỏi mô tả PR — tác giả không thấy block của mình, người review
 * không biết bot sẽ test gì. Tệ hơn, ở trong ngữ cảnh HTML block thì markdown
 * bị tắt, nên các bullet dồn thành một dòng. Đã xảy ra thật trên PR #916.
 *
 * Fenced block hiện nguyên khối, không đụng sanitizer, và biên rõ ràng.
 */
const FENCE_RE = /^[ \t]*```[ \t]*taw-qa[ \t]*$/;
const FENCE_END_RE = /^[ \t]*```[ \t]*$/;

/** Cú pháp thay thế, dùng khi muốn Claim hiện như văn xuôi bình thường. */
const COMMENT_START_RE = /^[ \t]*<!--[ \t]*taw-qa:start[ \t]*-->[ \t]*$/;
const COMMENT_END_RE = /^[ \t]*<!--[ \t]*taw-qa:end[ \t]*-->[ \t]*$/;


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
  let closer: ((line: string) => boolean) | null = null;

  for (const raw of prBody.split(/\r?\n/)) {
    const line = raw.trim();

    if (open === null) {
      if (FENCE_RE.test(raw)) {
        open = [];
        closer = (l) => FENCE_END_RE.test(l);
      } else if (COMMENT_START_RE.test(raw)) {
        open = [];
        closer = (l) => COMMENT_END_RE.test(l);
      } else if (line === START) {
        // Cú pháp cũ, giữ để PR đã viết không gãy.
        open = [];
        closer = (l) => l.trim() === END;
      }
      continue;
    }

    if (closer!(raw)) {
      blocks.push(open);
      open = null;
      closer = null;
      continue;
    }
    open.push(raw);
  }

  if (open !== null) return { ok: false, reason: "unclosed" };
  if (blocks.length === 0) return { ok: false, reason: "no-block" };
  return { ok: true, lines: blocks.flat() };
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
  "Thêm khối này vào PR body rồi comment `/taw-qa` lại:",
  "",
  "````",
  "```taw-qa",
  "- POST /farms trả về 201",
  "- e2e: login → tạo farm → thấy trên list",
  "```",
  "````",
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
