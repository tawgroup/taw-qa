import { spawn } from "node:child_process";

export type ExecResult = { code: number; stdout: string; stderr: string };

/**
 * KHÔNG dùng execFileSync khi Proxy đang chạy trong cùng tiến trình.
 *
 * execFileSync chặn event loop của Node. Proxy nghe 127.0.0.1:3018 trong chính
 * tiến trình này, nên nó sẽ nhận kết nối mà không bao giờ trả lời được. Playwright
 * chờ `:3018/health`, Proxy không đáp, execFileSync không trả về vì Playwright
 * chưa xong — hai bên chờ nhau tới hết timeout 45 phút.
 *
 * Đã xảy ra thật: run treo 8 phút, port LISTEN nhưng curl trả 000.
 */
export function execAsync(
  cmd: string,
  args: string[],
  opts: { cwd: string; env?: NodeJS.ProcessEnv; timeoutMs?: number },
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));

    const t = opts.timeoutMs
      ? setTimeout(() => {
          p.kill("SIGKILL");
          reject(new Error(`${cmd} quá ${opts.timeoutMs}ms, đã kill`));
        }, opts.timeoutMs)
      : null;

    p.on("error", (e) => {
      if (t) clearTimeout(t);
      reject(e);
    });
    p.on("close", (code) => {
      if (t) clearTimeout(t);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}
