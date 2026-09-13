import type { TestableClaim } from "./claims.ts";
import { buildSpec, type SpecPlan } from "./online-spec.ts";

export type OpencodeConfig = {
  base_url: string;
  api_key: string;
  model: string;
  fallback_model?: string;
};

/**
 * Endpoint opencode Zen là OpenAI-compatible, nên gọi thẳng bằng fetch. Không
 * cài CLI `opencode` lên Runner: CLI cất credential ở
 * ~/.local/share/opencode/auth.json qua lệnh `/connect` trong TUI, không có
 * đường khai báo headless nào được document.
 */
export function buildPrompt(claims: TestableClaim[]): string {
  return [
    "You write Playwright specs. Output ONLY TypeScript code. No prose, no markdown fences.",
    "",
    "Claims to verify. Each needs an assertion that FAILS if the claim is false:",
    ...claims.map((c) => `- ${c.text}`),
    "",
    "Rules:",
    "- import { expect, test } from '@playwright/test'",
    "- Include test.describe.configure({ mode: 'serial' }) — the repo sets fullyParallel",
    "- baseURL is already http://127.0.0.1:3000; use relative paths like '/login'",
    "- No page.waitForTimeout. No screenshot calls.",
    "- The UI is Vietnamese: 'Đăng nhập' = Login, 'Đăng ký' = Register",
    "- Anything the test creates must be named with the prefix given below",
  ].join("\n");
}

/** Model hay bọc code trong fence dù đã dặn; gỡ trước khi kiểm. */
export function extractCode(raw: string): string {
  const t = raw.trim();
  const fenced = t.match(/```(?:ts|typescript|js|javascript)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : t).trim();
}

export type SpecCheck = { ok: true } | { ok: false; why: string };

/**
 * Không tin model. Spec không đạt thì rơi về bộ sinh tất định, chứ không đẩy
 * một file rác vào repo người ta rồi báo FAIL oan.
 */
export function checkSpec(code: string): SpecCheck {
  if (!/from\s+['"]@playwright\/test['"]/.test(code))
    return { ok: false, why: "thiếu import @playwright/test" };
  if (!/\btest\s*\(/.test(code)) return { ok: false, why: "không có test() nào" };
  if (!/\bexpect\s*\(/.test(code))
    return { ok: false, why: "không có expect() — assertion không thể đỏ" };
  if (/waitForTimeout/.test(code))
    return { ok: false, why: "dùng waitForTimeout" };
  if (/https?:\/\/(?!127\.0\.0\.1)/.test(code))
    return { ok: false, why: "gọi URL tuyệt đối ngoài 127.0.0.1" };
  return { ok: true };
}

/** Model quên dòng serial thì chèn, không vì thế mà vứt cả spec. */
export function ensureSerial(code: string): string {
  if (/describe\.configure\(\s*\{\s*mode:\s*['"]serial['"]/.test(code)) return code;
  return `import { test as __t } from '@playwright/test';\n__t.describe.configure({ mode: 'serial' });\n\n${code}`;
}

export async function writeSpec(opts: {
  cfg: OpencodeConfig;
  claims: TestableClaim[];
  prNumber: number;
  fetchImpl?: typeof fetch;
}): Promise<SpecPlan & { source: "opencode" | "fallback"; note?: string }> {
  const f = opts.fetchImpl ?? fetch;
  const prompt = `${buildPrompt(opts.claims)}\n- prefix: tawqa-pr${opts.prNumber}-`;

  try {
    const r = await f(`${opts.cfg.base_url}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${opts.cfg.api_key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: opts.cfg.model,
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!r.ok) throw new Error(`opencode ${r.status}`);
    const d = (await r.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const code = extractCode(d.choices?.[0]?.message?.content ?? "");
    const check = checkSpec(code);
    if (!check.ok) throw new Error(check.why);
    return {
      path: `tests/e2e/taw-qa-pr-${opts.prNumber}.spec.ts`,
      text: ensureSerial(code),
      unsupported: [],
      source: "opencode",
    };
  } catch (e) {
    const plan = buildSpec(opts.claims, opts.prNumber);
    return {
      ...plan,
      source: "fallback",
      note: `opencode không dùng được (${(e as Error).message}); dùng bộ sinh tất định`,
    };
  }
}
