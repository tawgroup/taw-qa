import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import {
  corsHeaders,
  localRoute,
  newSignals,
  preflightHeaders,
  readUptime,
  recordStatus,
  scrubUpstreamHeaders,
  startProxy,
} from "./proxy.ts";

function fakeUpstream(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
): Promise<{ url: string; close: () => Promise<void>; seen: http.IncomingMessage[] }> {
  const seen: http.IncomingMessage[] = [];
  const s = http.createServer((req, res) => {
    seen.push(req);
    handler(req, res);
  });
  return new Promise((resolve) =>
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address() as { port: number };
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise<void>((r) => s.close(() => r())),
        seen,
      });
    }),
  );
}

test("route tại chỗ: health, reset, preflight, socket.io", () => {
  assert.equal(localRoute("GET", "/health"), "health");
  assert.equal(localRoute("POST", "/__test__/reset"), "reset");
  assert.equal(localRoute("OPTIONS", "/api/farms"), "preflight");
  assert.equal(localRoute("GET", "/socket.io/"), "socket");
  assert.equal(localRoute("GET", "/api/farms"), null);
});

test("header CORS trỏ đúng origin FE và expose ETag/Retry-After", () => {
  const h = corsHeaders();
  assert.equal(h["access-control-allow-origin"], "http://127.0.0.1:3000");
  assert.equal(h["access-control-allow-credentials"], "true");
  assert.match(h["access-control-expose-headers"], /ETag/);
  assert.match(h["access-control-expose-headers"], /Retry-After/);
  assert.match(preflightHeaders()["access-control-allow-headers"], /Authorization/);
});

test("vứt header CORS của upstream để không có hai bộ chỏi nhau", () => {
  const out = scrubUpstreamHeaders({
    "access-control-allow-origin": "https://sutagrow-dev.agribeacon.tech",
    "access-control-allow-credentials": "true",
    vary: "Origin",
    etag: 'W/"abc"',
    "content-type": "application/json",
  });
  assert.deepEqual(Object.keys(out).sort(), ["content-type", "etag"]);
});

test("đếm 429 và 5xx riêng", () => {
  const s = newSignals();
  recordStatus(s, 429);
  recordStatus(s, 503);
  recordStatus(s, 200);
  assert.equal(s.count429, 1);
  assert.equal(s.count5xx, 1);
});

test("readUptime lấy data.uptime, trả null khi health đỏ", async () => {
  const okFetch = (async () =>
    new Response(JSON.stringify({ data: { uptime: 4242 } }), {
      status: 200,
    })) as unknown as typeof fetch;
  assert.equal(await readUptime("https://x.test", okFetch), 4242);

  const badFetch = (async () =>
    new Response("{}", { status: 503 })) as unknown as typeof fetch;
  assert.equal(await readUptime("https://x.test", badFetch), null);

  const throwFetch = (async () => {
    throw new Error("ECONNREFUSED");
  }) as unknown as typeof fetch;
  assert.equal(await readUptime("https://x.test", throwFetch), null);
});

test("Proxy từ chối start khi BE_URL là prod, và bật cờ guard", async () => {
  const signals = newSignals();
  await assert.rejects(
    startProxy({
      beUrl: "https://saas-be.agribeacon.tech",
      beAllowedOrigin: "https://sutagrow-dev.agribeacon.tech",
      port: 0,
      signals,
    }),
    /production/,
  );
  assert.equal(signals.prodGuardTripped, true);
});

test("forward: ghi lại Origin và Host, chèn CORS cho FE", async () => {
  const up = await fakeUpstream((req, res) => {
    res.writeHead(200, {
      "content-type": "application/json",
      etag: 'W/"z"',
      "access-control-allow-origin": "https://sutagrow-dev.agribeacon.tech",
    });
    res.end(JSON.stringify({ ok: true }));
  });
  const proxy = await startProxy({
    beUrl: up.url,
    beAllowedOrigin: "https://sutagrow-dev.agribeacon.tech",
    port: 0,
  });
  const port = (proxy.server.address() as { port: number }).port;

  const res = await fetch(`http://127.0.0.1:${port}/api/auth/check-email`, {
    method: "POST",
    headers: { origin: "http://127.0.0.1:3000", "content-type": "application/json" },
    body: "{}",
  });

  assert.equal(res.status, 200);
  assert.equal(
    res.headers.get("access-control-allow-origin"),
    "http://127.0.0.1:3000",
  );
  assert.equal(res.headers.get("etag"), 'W/"z"');
  assert.equal(
    up.seen[0].headers.origin,
    "https://sutagrow-dev.agribeacon.tech",
  );
  await proxy.close();
  await up.close();
});

test("upstream 429 được đếm vào signals", async () => {
  const up = await fakeUpstream((_req, res) => {
    res.writeHead(429, { "content-type": "application/json" });
    res.end("{}");
  });
  const proxy = await startProxy({
    beUrl: up.url,
    beAllowedOrigin: "https://sutagrow-dev.agribeacon.tech",
    port: 0,
  });
  const port = (proxy.server.address() as { port: number }).port;
  await fetch(`http://127.0.0.1:${port}/api/farms`);
  assert.equal(proxy.signals.count429, 1);
  await proxy.close();
  await up.close();
});

test("upstream chết → 502 và đếm connectionErrors", async () => {
  const up = await fakeUpstream((_req, res) => res.end());
  const dead = up.url;
  await up.close();

  const proxy = await startProxy({
    beUrl: dead,
    beAllowedOrigin: "https://sutagrow-dev.agribeacon.tech",
    port: 0,
  });
  const port = (proxy.server.address() as { port: number }).port;
  const res = await fetch(`http://127.0.0.1:${port}/api/farms`);
  assert.equal(res.status, 502);
  assert.equal(proxy.signals.connectionErrors, 1);
  await proxy.close();
});

test("health, reset và socket.io trả tại chỗ, không chạm upstream", async () => {
  const up = await fakeUpstream((_req, res) => {
    res.writeHead(500);
    res.end();
  });
  const proxy = await startProxy({
    beUrl: up.url,
    beAllowedOrigin: "https://sutagrow-dev.agribeacon.tech",
    port: 0,
  });
  const port = (proxy.server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;

  assert.equal((await fetch(`${base}/health`)).status, 200);
  assert.equal(
    (await fetch(`${base}/__test__/reset`, { method: "POST" })).status,
    200,
  );
  assert.equal((await fetch(`${base}/socket.io/?EIO=4`)).status, 404);
  assert.equal(
    (await fetch(`${base}/api/farms`, { method: "OPTIONS" })).status,
    204,
  );
  assert.equal(up.seen.length, 0);
  assert.equal(proxy.signals.count5xx, 0);

  await proxy.close();
  await up.close();
});

test("readUptime gọi /api/health, không phải /health", async () => {
  // `{beUrl}/health` trả 404 trên sutagrow-api: health mount dưới /api.
  let called = "";
  const spy = (async (u: string) => {
    called = u;
    return new Response(JSON.stringify({ data: { uptime: 1 } }), { status: 200 });
  }) as unknown as typeof fetch;
  await readUptime("https://farm-dev-be.agribeacon.tech", spy);
  assert.equal(called, "https://farm-dev-be.agribeacon.tech/api/health");
});

test("readUptime bỏ dấu / thừa ở cuối beUrl", async () => {
  let called = "";
  const spy = (async (u: string) => {
    called = u;
    return new Response('{"data":{"uptime":1}}', { status: 200 });
  }) as unknown as typeof fetch;
  await readUptime("https://x.test/", spy);
  assert.equal(called, "https://x.test/api/health");
});
