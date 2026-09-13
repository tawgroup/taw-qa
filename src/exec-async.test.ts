import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import http from "node:http";
import test from "node:test";
import { execAsync } from "./exec-async.ts";

test("chạy lệnh và trả stdout + exit code", async () => {
  const r = await execAsync("node", ["-e", "console.log('xin chao')"], { cwd: "." });
  assert.equal(r.code, 0);
  assert.match(r.stdout, /xin chao/);
});

test("lệnh lỗi trả code khác 0 chứ không ném", async () => {
  const r = await execAsync("node", ["-e", "process.exit(3)"], { cwd: "." });
  assert.equal(r.code, 3);
});

test("timeout thì kill và ném", async () => {
  await assert.rejects(
    execAsync("node", ["-e", "setTimeout(()=>{}, 60000)"], {
      cwd: ".",
      timeoutMs: 300,
    }),
    /quá 300ms/,
  );
});

test("KHÔNG chặn event loop — server cùng tiến trình vẫn trả lời được", async () => {
  // Đây là bản tái hiện deadlock thật: Proxy nghe trong cùng tiến trình, còn
  // Playwright chờ Proxy trả lời. execFileSync làm cả hai chờ nhau vĩnh viễn.
  const server = http.createServer((_q, s) => s.end("ok"));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as { port: number }).port;

  let served = false;
  const child = execAsync("node", ["-e", "setTimeout(()=>{}, 900)"], { cwd: "." });
  const res = await fetch(`http://127.0.0.1:${port}/`);
  served = res.ok;

  await child;
  server.close();
  assert.equal(served, true, "server phải trả lời được trong lúc lệnh con đang chạy");
});

test("runner.ts không được import execFileSync", () => {
  // Proxy sống trong tiến trình runner; một execFileSync lọt vào sau khi proxy
  // start là đủ để treo cả lần chạy. Cấm luôn ở tầng import.
  const src = readFileSync("src/runner.ts", "utf8");
  const imports = src
    .split("\n")
    .filter((l) => l.startsWith("import "))
    .join("\n");
  assert.doesNotMatch(imports, /execFileSync/);
});
