import { execAsync } from "./exec-async.ts";

export type PageSnapshot = {
  path: string;
  ok: boolean;
  title?: string;
  /** Chữ nhìn thấy được, đã gộp khoảng trắng. */
  text?: string;
  /** Phần tử tương tác: role + tên. Đây là thứ locator nên bám vào. */
  elements?: { role: string; name: string }[];
  error?: string;
};

/**
 * Script chạy BÊN TRONG checkout để dùng đúng bản playwright của repo.
 * Không viết file vào repo người ta — truyền qua `node -e`.
 */
export function snapshotScript(base: string, paths: string[]): string {
  return `
const { chromium } = require('@playwright/test');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const out = [];
  for (const path of ${JSON.stringify(paths)}) {
    try {
      const r = await p.goto(${JSON.stringify(base)} + path, { waitUntil: 'networkidle', timeout: 30000 });
      const title = await p.title();
      const text = (await p.locator('body').innerText()).replace(/\\s+/g, ' ').slice(0, 3000);
      const elements = await p.evaluate(() => {
        const sel = 'button, a, input, [role=button], [role=tab], label, h1, h2';
        return [...document.querySelectorAll(sel)].slice(0, 60).map((e) => ({
          role: e.getAttribute('role') || e.tagName.toLowerCase(),
          name: (e.getAttribute('aria-label') || e.getAttribute('placeholder') || e.textContent || '')
            .replace(/\\s+/g, ' ').trim().slice(0, 80),
        })).filter((x) => x.name);
      });
      out.push({ path, ok: r ? r.status() < 400 : false, title, text, elements });
    } catch (e) {
      out.push({ path, ok: false, error: String(e && e.message || e).slice(0, 300) });
    }
  }
  await b.close();
  console.log('###SNAPSHOT###' + JSON.stringify(out));
})().catch((e) => { console.log('###SNAPSHOT###' + JSON.stringify([{ path: '?', ok: false, error: String(e) }])); });
`;
}

export function parseSnapshotOutput(stdout: string): PageSnapshot[] {
  const i = stdout.lastIndexOf("###SNAPSHOT###");
  if (i < 0) return [];
  try {
    return JSON.parse(stdout.slice(i + "###SNAPSHOT###".length).trim()) as PageSnapshot[];
  } catch {
    return [];
  }
}

export async function snapshotPages(opts: {
  dir: string;
  base: string;
  paths: string[];
  env: NodeJS.ProcessEnv;
}): Promise<PageSnapshot[]> {
  if (opts.paths.length === 0) return [];
  const r = await execAsync(
    "node",
    ["-e", snapshotScript(opts.base, opts.paths)],
    { cwd: opts.dir, env: opts.env, timeoutMs: 3 * 60 * 1000 },
  );
  return parseSnapshotOutput(r.stdout);
}

/** Đưa vào prompt để model chọn locator từ thứ CÓ THẬT, thay vì đoán. */
export function renderForPrompt(snaps: PageSnapshot[]): string {
  if (snaps.length === 0) return "";
  return [
    "",
    "DOM thật của các trang (đã mở bằng Chromium ngay trước khi bạn viết spec).",
    "CHỈ dùng locator khớp với những gì liệt kê dưới đây. Đừng đoán.",
    ...snaps.map((s) =>
      s.ok
        ? [
            ``,
            `## ${s.path} — "${s.title ?? ""}"`,
            `Phần tử tương tác (role | tên chính xác):`,
            ...(s.elements ?? []).map((e) => `  ${e.role} | ${e.name}`),
            `Chữ trên trang: ${(s.text ?? "").slice(0, 1200)}`,
          ].join("\n")
        : `\n## ${s.path} — MỞ KHÔNG ĐƯỢC: ${s.error ?? "unknown"}`,
    ),
  ].join("\n");
}
