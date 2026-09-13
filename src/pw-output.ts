/** Bỏ mã màu ANSI. Playwright tô màu cả khi stdout không phải TTY. */
export function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

export type TestResult = { title: string; green: boolean };

const LINE_RE =
  /^\s*(✓|✘|-)\s+\d+\s+\[[^\]]+\]\s+›\s+(.*?)(?:\s+\(\d+(?:\.\d+)?m?s\))?\s*$/;

/**
 * Đọc kết quả TỪNG test từ reporter `list`.
 *
 * Trước đây tôi gán một `green` chung cho mọi Claim theo exit code, nên Report
 * ghi "Đã test: (không có)" ngay cả khi một nửa số test đã xanh. Người đọc PR
 * cần biết cái nào xanh cái nào đỏ, không phải một con số 0/1.
 */
export function parseResults(raw: string): TestResult[] {
  const out: TestResult[] = [];
  for (const line of stripAnsi(raw).split(/\r?\n/)) {
    const m = line.match(LINE_RE);
    if (!m) continue;
    // `-` la test bi bo qua vi test truoc da do trong mode serial.
    if (m[1] === "-") continue;
    const title = m[2].split("›").pop()?.trim() ?? m[2].trim();
    if (!title) continue;
    out.push({ title, green: m[1] === "✓" });
  }
  return out;
}

/**
 * Cắt phần lỗi thật, bỏ log build.
 *
 * `next build` in ra hàng trăm dòng bảng route; nhồi hết vào Report thì lỗi thật
 * bị chôn và không ai đọc.
 */
export function failureExcerpt(raw: string, maxChars = 2500): string {
  const clean = stripAnsi(raw);
  const lines = clean.split(/\r?\n/);
  const start = lines.findIndex((l) => /^\s*\d+\)\s+\[/.test(l));
  const body =
    start >= 0
      ? lines.slice(start)
      : lines.filter((l) => !l.trimStart().startsWith("[WebServer]"));
  const text = body.join("\n").trim();
  return text.length > maxChars ? text.slice(0, maxChars) + "\n… (cắt bớt)" : text;
}
