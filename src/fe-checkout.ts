import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { cloneUrl, redact } from "./gh-app.ts";
import { renderFeEnv, type ProjectConfig } from "./project-config.ts";

export const WORK_ROOT = process.env.TAW_QA_WORK ?? "/work";

export function workDir(prNumber: number): string {
  return `${WORK_ROOT}/pr-${prNumber}`;
}

function run(cmd: string, args: string[], cwd: string, token: string): string {
  try {
    return execFileSync(cmd, args, {
      cwd,
      encoding: "utf8",
      stdio: "pipe",
      // Repo có .husky; `npm ci` chạy prepare -> husky install và ném trong
      // checkout shallow. deploy-staging.yml của repo cũng set đúng biến này.
      env: {
        ...process.env,
        HUSKY: "0",
        PLAYWRIGHT_BROWSERS_PATH: BROWSERS_PATH,
      },
    });
  } catch (e) {
    const err = e as { stderr?: Buffer | string; message: string };
    const detail = String(err.stderr ?? err.message);
    // Token nằm trong remote URL; không được để nó vào log hay Report.
    throw new Error(redact(`${cmd} ${args[0]} lỗi: ${detail}`, token));
  }
}

/**
 * Fetch đúng head của PR và checkout commit đó. KHÔNG merge vào staging —
 * merge là test một cái cây mà không ai review.
 */
export function checkoutPr(opts: {
  token: string;
  repo: string;
  prNumber: number;
  headSha: string;
}): string {
  const dir = workDir(opts.prNumber);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const url = cloneUrl(opts.token, opts.repo);
  run("git", ["init", "-q"], dir, opts.token);
  run("git", ["remote", "add", "origin", url], dir, opts.token);
  run(
    "git",
    ["fetch", "-q", "--depth", "1", "origin", `pull/${opts.prNumber}/head`],
    dir,
    opts.token,
  );
  run("git", ["checkout", "-q", "FETCH_HEAD"], dir, opts.token);

  const sha = run("git", ["rev-parse", "HEAD"], dir, opts.token).trim();
  if (sha !== opts.headSha)
    throw new Error(
      `checkout ra ${sha.slice(0, 7)} nhưng PR head là ${opts.headSha.slice(0, 7)}`,
    );

  // Remote còn giữ token; xoá để token không sống trong .git/config suốt run.
  run("git", ["remote", "set-url", "origin", `https://github.com/${opts.repo}.git`], dir, opts.token);
  return dir;
}

/**
 * Checkout sạch không có `node_modules`. `playwright.config.ts` của repo gọi
 * `npm run build` rồi `npm run start`, và `npx playwright test` cần
 * `@playwright/test` — cả ba đều chết nếu bỏ bước này. Mất ~2-3 phút.
 */
export function installDeps(dir: string, token: string): void {
  run("npm", ["ci", "--no-audit", "--no-fund"], dir, token);
}

/**
 * Cài Chromium THEO version @playwright/test của repo, sau `npm ci`.
 *
 * Provisioning cài sẵn Chromium cho playwright 1.55.0, nhưng repo FE dùng
 * version khác và đòi bản build khác (`chromium_headless_shell-1223`). Không
 * biết trước lúc provision được — chỉ biết sau khi đọc lockfile của repo.
 *
 * PLAYWRIGHT_BROWSERS_PATH trỏ vào EBS nên lần chạy sau dùng lại, không tải lại
 * ~150MB mỗi run.
 */
export const BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/opt/pw-browsers";

export function installBrowser(dir: string, token: string): void {
  run("npx", ["playwright", "install", "chromium"], dir, token);
}

/**
 * Checkout sạch không có `.env` (nó nằm trong .gitignore), mà `buildPrefix` chỉ
 * set NEXT_PUBLIC_API_URL. Mọi NEXT_PUBLIC_* khác sẽ undefined lúc build.
 */
export function writeFeEnv(dir: string, cfg: ProjectConfig): string {
  const body = renderFeEnv(cfg);
  writeFileSync(`${dir}/.env`, body, { mode: 0o600 });
  return body;
}
