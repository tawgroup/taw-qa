import assert from "node:assert/strict";
import test from "node:test";
import type { TestableClaim } from "./claims.ts";
import { checkSpec, ensureSerial, extractCode, writeSpec } from "./opencode.ts";

const claims: TestableClaim[] = [
  { text: "e2e: mở /login thấy Email", layer: "web", hasAssertion: true },
];
const cfg = { base_url: "https://x.test/v1", api_key: "k", model: "kimi-k3" };

const good = `import { expect, test } from '@playwright/test';
test.describe.configure({ mode: 'serial' });
test('a', async ({ page }) => { await page.goto('/login'); await expect(page.getByText('Email')).toBeVisible(); });`;

const reply = (content: string) =>
  (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
    })) as unknown as typeof fetch;

test("gỡ fence markdown dù đã dặn model đừng dùng", () => {
  assert.equal(extractCode("```ts\nconst a = 1;\n```"), "const a = 1;");
  assert.equal(extractCode("  const a = 1;  "), "const a = 1;");
});

test("spec thiếu expect bị từ chối — assertion không thể đỏ", () => {
  const r = checkSpec(`import { test } from '@playwright/test';\ntest('a', async () => {});`);
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.why : "", /expect/);
});

test("từ chối waitForTimeout và URL tuyệt đối lạ", () => {
  assert.equal(checkSpec(`${good}\npage.waitForTimeout(1)`).ok, false);
  assert.equal(
    checkSpec(good.replace("'/login'", "'https://farm-dev-be.agribeacon.tech/login'")).ok,
    false,
  );
  // 127.0.0.1 vẫn được phép.
  assert.equal(checkSpec(good.replace("'/login'", "'http://127.0.0.1:3000/login'")).ok, true);
});

test("ensureSerial chèn khi model quên, giữ nguyên khi đã có", () => {
  assert.match(ensureSerial("const a = 1;"), /mode: 'serial'/);
  assert.equal(ensureSerial(good), good);
});

test("model trả spec đạt thì dùng, source = opencode", async () => {
  const r = await writeSpec({ cfg, claims, prNumber: 916, fetchImpl: reply(good) });
  assert.equal(r.source, "opencode");
  assert.equal(r.path, "tests/e2e/taw-qa-pr-916.spec.ts");
});

test("model trả rác thì rơi về bộ sinh tất định, không đẩy file hỏng đi", async () => {
  const r = await writeSpec({ cfg, claims, prNumber: 916, fetchImpl: reply("xin chào") });
  assert.equal(r.source, "fallback");
  assert.match(r.note ?? "", /opencode không dùng được/);
  assert.match(r.text, /@playwright\/test/);
});

test("opencode chết thì vẫn có spec, không làm vỡ lần chạy", async () => {
  const boom = (async () => {
    throw new Error("ECONNRESET");
  }) as unknown as typeof fetch;
  const r = await writeSpec({ cfg, claims, prNumber: 1, fetchImpl: boom });
  assert.equal(r.source, "fallback");
  assert.match(r.text, /test\(/);
});
