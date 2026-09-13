import http from "node:http";
import https from "node:https";
import { assertNotProd } from "./project-config.ts";
import type { RunSignals } from "./verdict.ts";

export const PROXY_PORT = 3018;
export const FE_ORIGIN = "http://127.0.0.1:3000";

/**
 * ETag và Retry-After không nằm trong CORS safelist, mà FE đọc cả hai
 * (lib/api/multipart-upload.ts:104, lib/api/retry.ts:110). Thiếu dòng này thì
 * upload multipart và retry gãy âm thầm, không có lỗi nào hiện ra.
 */
export const EXPOSE_HEADERS = "ETag, Retry-After";

export function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": FE_ORIGIN,
    "access-control-allow-credentials": "true",
    "access-control-expose-headers": EXPOSE_HEADERS,
    vary: "Origin",
  };
}

/** Upstream từ chối preflight từ origin lạ, nên trả tại chỗ chứ không forward. */
export function preflightHeaders(): Record<string, string> {
  return {
    ...corsHeaders(),
    "access-control-allow-headers": "Authorization, Content-Type",
    "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "access-control-max-age": "600",
  };
}

/** Header CORS của upstream phải bị vứt, nếu không sẽ có hai bộ chỏi nhau. */
export function scrubUpstreamHeaders(
  h: Record<string, string | string[] | undefined>,
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(h)) {
    if (v === undefined) continue;
    const lower = k.toLowerCase();
    if (lower.startsWith("access-control-")) continue;
    if (lower === "vary") continue;
    // Upstream nói cách đóng gói của nó; ta gửi lại theo cách của ta.
    if (lower === "transfer-encoding" || lower === "connection") continue;
    out[lower] = v;
  }
  return out;
}

export type LocalRoute = "health" | "reset" | "preflight" | "socket" | null;

/**
 * Bốn đường trả tại chỗ. `/__test__/reset` bắt buộc: không trả thì
 * tests/e2e/global-setup.ts retry 30 lần × 1s rồi mới warn — mất 30 giây mỗi run.
 */
export function localRoute(method: string, path: string): LocalRoute {
  if (method === "OPTIONS") return "preflight";
  if (method === "GET" && path === "/health") return "health";
  if (method === "POST" && path === "/__test__/reset") return "reset";
  if (path === "/socket.io" || path.startsWith("/socket.io/")) return "socket";
  return null;
}

export function newSignals(): RunSignals {
  return {
    uptimeBefore: null,
    uptimeAfter: null,
    count429: 0,
    count5xx: 0,
    connectionErrors: 0,
    prodGuardTripped: false,
    timedOut: false,
  };
}

export function recordStatus(signals: RunSignals, status: number): void {
  if (status === 429) signals.count429 += 1;
  else if (status >= 500) signals.count5xx += 1;
}

/**
 * Health của sutagrow-api mount dưới `/api` (routes/index.ts: router.use
 * ("/health", ...) bên trong api router), nên `{beUrl}/health` trả 404 — đúng
 * lỗi làm lần chạy thật đầu tiên thành BLOCKED be-unhealthy oan.
 */
export const DEFAULT_HEALTH_PATH = "/api/health";

/** `data.uptime` từ GET {beUrl}{healthPath}. null = không kết luận được. */
export async function readUptime(
  beUrl: string,
  fetchImpl: typeof fetch = fetch,
  healthPath: string = DEFAULT_HEALTH_PATH,
): Promise<number | null> {
  try {
    const res = await fetchImpl(`${beUrl.replace(/\/$/, "")}${healthPath}`);
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: { uptime?: unknown } };
    const up = body?.data?.uptime;
    return typeof up === "number" ? up : null;
  } catch {
    return null;
  }
}

export type ProxyHandle = {
  server: http.Server;
  signals: RunSignals;
  close: () => Promise<void>;
};

export function startProxy(opts: {
  beUrl: string;
  beAllowedOrigin: string;
  port?: number;
  signals?: RunSignals;
}): Promise<ProxyHandle> {
  const signals = opts.signals ?? newSignals();

  // Guard trước khi bind port, không phải sau.
  try {
    assertNotProd(opts.beUrl);
  } catch (e) {
    signals.prodGuardTripped = true;
    return Promise.reject(e);
  }

  const upstream = new URL(opts.beUrl);
  const port = opts.port ?? PROXY_PORT;

  const server = http.createServer((req, res) => {
    const method = req.method ?? "GET";
    const path = (req.url ?? "/").split("?")[0];

    switch (localRoute(method, path)) {
      case "preflight":
        res.writeHead(204, preflightHeaders());
        return res.end();
      case "health":
        res.writeHead(200, { ...corsHeaders(), "content-type": "application/json" });
        return res.end(JSON.stringify({ ok: true, proxy: "taw-qa" }));
      case "reset":
        res.writeHead(200, { ...corsHeaders(), "content-type": "application/json" });
        return res.end(JSON.stringify({ ok: true, noop: true }));
      case "socket":
        // Không proxy WebSocket. Claim realtime đã ghi `không test`; socket.io
        // tự retry im lặng, đúng bằng hành vi e2e sẵn có của repo.
        res.writeHead(404, corsHeaders());
        return res.end();
    }

    forward(req, res);
  });

  function forward(req: http.IncomingMessage, res: http.ServerResponse) {
    const target = new URL(req.url ?? "/", upstream);
    target.protocol = upstream.protocol;
    target.host = upstream.host;

    const headers: Record<string, string | string[]> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      const lower = k.toLowerCase();
      if (lower === "host" || lower === "origin" || lower === "referer") continue;
      if (v !== undefined) headers[lower] = v;
    }
    headers.host = upstream.host;
    headers.origin = opts.beAllowedOrigin;

    const client = upstream.protocol === "https:" ? https : http;
    const up = client.request(
      target,
      { method: req.method, headers },
      (upRes: http.IncomingMessage) => {
        const status = upRes.statusCode ?? 502;
        recordStatus(signals, status);
        res.writeHead(status, {
          ...scrubUpstreamHeaders(upRes.headers),
          ...corsHeaders(),
        });
        upRes.pipe(res);
      },
    );

    up.on("error", () => {
      signals.connectionErrors += 1;
      if (!res.headersSent) res.writeHead(502, corsHeaders());
      res.end();
    });

    // Client bỏ giữa chừng thì socket lên upstream phải chết theo. Một run 45
    // phút rò socket sẽ đụng EMFILE hoặc treo teardown, và cái đó nổi lên thành
    // BLOCKED giả — đúng thứ verdict này đang cố giữ cho đáng tin.
    req.on("error", () => up.destroy());
    res.on("close", () => {
      if (!res.writableEnded) up.destroy();
    });

    req.pipe(up);
  }

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () =>
      resolve({
        server,
        signals,
        close: () => new Promise<void>((r) => server.close(() => r())),
      }),
    );
  });
}
