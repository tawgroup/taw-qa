import { API_URL, WEB_URL } from "./config.ts";

export const STACK_HTTP_URLS = [API_URL, WEB_URL] as const;

export type MongoStatus =
  | { status: "healthy" }
  | { status: "missing-dump" }
  | { status: "exited"; reason: string }
  | { status: "waiting" };

function parseComposePs(psText: string): Record<string, unknown>[] {
  const t = psText.trim();
  if (!t) return [];
  try {
    const parsed = JSON.parse(t) as unknown;
    if (Array.isArray(parsed)) return parsed as Record<string, unknown>[];
    if (parsed && typeof parsed === "object") return [parsed as Record<string, unknown>];
  } catch {
    /* ndjson */
  }
  const rows: Record<string, unknown>[] = [];
  for (const line of t.split(/\n/)) {
    const s = line.trim();
    if (!s.startsWith("{")) continue;
    try {
      rows.push(JSON.parse(s) as Record<string, unknown>);
    } catch {
      /* skip */
    }
  }
  return rows;
}

export function interpretMongoPs(psText: string, logs: string): MongoStatus {
  if (/missing Mongo dump archive/i.test(logs)) {
    return { status: "missing-dump" };
  }
  const rows = parseComposePs(psText);
  const mongo =
    rows.find((r) => {
      const name = String(r.Service ?? r.Name ?? r.Name ?? "");
      return name.includes("mongo");
    }) ?? rows[0];
  if (!mongo) return { status: "waiting" };
  const health = String(mongo.Health ?? mongo.health ?? "").toLowerCase();
  const state = String(mongo.State ?? mongo.status ?? "").toLowerCase();
  if (health === "healthy") return { status: "healthy" };
  if (state.includes("exit") || state.includes("dead")) {
    return { status: "exited", reason: state };
  }
  return { status: "waiting" };
}

export async function waitForHttp(
  url: string,
  opts: {
    timeoutMs: number;
    intervalMs?: number;
    fetchImpl?: typeof fetch;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const interval = opts.intervalMs ?? 1000;
  const deadline = Date.now() + opts.timeoutMs;
  let last = "not started";
  while (Date.now() < deadline) {
    try {
      const res = await fetchImpl(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(3000),
      });
      void res.status;
      return { ok: true };
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  return { ok: false, error: `timeout waiting for ${url}: ${last}` };
}
