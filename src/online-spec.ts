import type { TestableClaim } from "./claims.ts";

export const FE_BASE = "http://127.0.0.1:3000";

/**
 * Sinh spec tất định từ Claim, không cần Claude. Kém linh hoạt hơn agent, nhưng
 * chạy được ngay và không đòi thêm credential. Bản do agent viết là nâng cấp sau.
 *
 * Nguyên tắc giữ nguyên từ spec: assertion phải đỏ khi Claim sai. Không chấp
 * nhận "trang hiện ra" hay "status 2xx" làm bằng chứng.
 */
export type SpecPlan = {
  path: string;
  text: string;
  /** Claim không sinh được assertion — vào mục `Không test` của Report. */
  unsupported: string[];
};

const PATH_RE = /(^|\s)(\/[a-z0-9/_-]*)/i;
const QUOTED_RE = /["'“”']([^"'“”']{2,60})["'“”']/;

/** "mở /login thấy Email" → đường dẫn /login, chữ phải thấy: Email */
export function parseClaim(text: string): { path: string; expects: string[] } | null {
  const p = text.match(PATH_RE)?.[2];
  if (!p) return null;

  const quoted = text.match(QUOTED_RE)?.[1];
  if (quoted) return { path: p, expects: [quoted] };

  // "thấy X", "hiện X hoặc Y" — lấy phần sau động từ, tách theo "hoặc"/"or".
  const after = text.match(/(?:thấy|hiện|hiển thị|shows?|displays?)\s+(.+)$/i)?.[1];
  if (!after) return null;
  const expects = after
    .split(/\s+(?:hoặc|or|và|and)\s+/i)
    .map((s) => s.trim().replace(/[.,;]+$/, ""))
    .filter((s) => s.length >= 2 && s.length <= 60);
  return expects.length ? { path: p, expects } : null;
}

function caseFor(claim: TestableClaim, i: number): string | null {
  const parsed = parseClaim(claim.text);
  if (!parsed) return null;
  const { path, expects } = parsed;
  const anyOf = expects
    .map((e) => `page.getByText(${JSON.stringify(e)}, { exact: false }).first()`)
    .join(",\n      ");
  return `test(${JSON.stringify(`claim ${i + 1}: ${claim.text}`)}, async ({ page }) => {
  const res = await page.goto(${JSON.stringify(path)});
  expect(res?.status(), 'HTTP status cua ${path}').toBeLessThan(400);

  // Bang chung cua Claim la chu tren man hinh, khong phai "trang hien ra".
  const candidates = [
      ${anyOf}
  ];
  let seen = false;
  for (const c of candidates) {
    if (await c.count() > 0) { await expect(c).toBeVisible(); seen = true; break; }
  }
  expect(seen, ${JSON.stringify(`khong thay: ${expects.join(" | ")}`)}).toBe(true);
});`;
}

export function buildSpec(
  claims: TestableClaim[],
  prNumber: number,
): SpecPlan {
  const cases: string[] = [];
  const unsupported: string[] = [];
  claims.forEach((c, i) => {
    const body = caseFor(c, i);
    if (body) cases.push(body);
    else unsupported.push(c.text);
  });

  const text = `import { expect, test } from '@playwright/test';

// Repo dat fullyParallel: true. Mode online ghi vao staging dung chung nen
// khong khai serial la Claim doc state do Claim truoc tao ra se flaky.
test.describe.configure({ mode: 'serial' });

// taw-qa PR #${prNumber} — sinh tu Block trong PR body. Khong sua tay.

${cases.join("\n\n")}
`;

  return {
    path: `tests/e2e/taw-qa-pr-${prNumber}.spec.ts`,
    text,
    unsupported,
  };
}
