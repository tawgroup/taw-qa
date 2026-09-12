import type { TestableClaim } from "./claims.ts";
import { API_URL, WEB_URL } from "./config.ts";

import { existsSync } from "node:fs";

/** `npm root -g` in the Playwright image is /usr/lib/node_modules, not /usr/local. */
export const AGENT_PLAYWRIGHT_ENTRIES = [
  "/usr/lib/node_modules/playwright/index.mjs",
  "/usr/local/lib/node_modules/playwright/index.mjs",
] as const;

export function resolvePlaywrightEntry(): string {
  for (const c of AGENT_PLAYWRIGHT_ENTRIES) {
    if (existsSync(c)) return c;
  }
  return AGENT_PLAYWRIGHT_ENTRIES[0];
}

export function playwrightImportLine(
  entry: string = resolvePlaywrightEntry(),
): string {
  return `import { chromium, request as newRequest } from ${JSON.stringify(entry)};`;
}

export const AGENT_PLAYWRIGHT_ENTRY = AGENT_PLAYWRIGHT_ENTRIES[0];
export const PLAYWRIGHT_IMPORT = playwrightImportLine(AGENT_PLAYWRIGHT_ENTRY);

export function expectedWebNeedles(claim: string): string[] {
  const needles = new Set<string>();
  const afterSee = claim.match(
    /(?:thấy|hiện|hiển thị|contains|shows)\s+(.+)/i,
  );
  if (afterSee) {
    const chunk = afterSee[1].replace(/^trên\s+/i, "").trim();
    if (chunk.length >= 2) needles.add(chunk);
  }
  for (const m of claim.matchAll(/["“]([^"”]+)["”]/g)) {
    if (m[1].length >= 2) needles.add(m[1]);
  }
  const created = claim.match(/(?:tạo|create)\s+(\S+)/i);
  if (created) {
    const token = created[1].replace(/[→,.].*$/g, "");
    if (token.length >= 2) needles.add(token);
  }
  if (needles.size === 0) {
    const parts = claim.split(/\s*→\s*/);
    const last = (parts[parts.length - 1] ?? claim)
      .replace(/^e2e:\s*/i, "")
      .trim();
    if (last.length >= 2) needles.add(last);
  }
  return [...needles];
}

export function buildFallbackSpec(
  claims: TestableClaim[],
  playwrightEntry: string = resolvePlaywrightEntry(),
): string {
  const cases = claims.map((c, i) => {
    const m = c.text.match(/(GET|POST|PUT|PATCH|DELETE)\s+(\/\S*)/i);
    const status = c.text.match(/\b(\d{3})\b/);
    const bodySee = c.text.match(/(?:body\s+)?(?:hiện|contains)\s+(.+)/i);
    const asApiBody = !m && Boolean(bodySee);
    const e2e = !asApiBody && (c.layer === "web" || !m);
    return {
      title: `claim ${i + 1}: ${c.text}`,
      method: m ? m[1].toUpperCase() : asApiBody ? "GET" : "",
      path: m ? m[2] : asApiBody ? "/" : "",
      expectStatus: status ? Number(status[1]) : 200,
      e2e,
      needles: e2e
        ? expectedWebNeedles(c.text)
        : bodySee
          ? [bodySee[1].trim()]
          : [],
      text: c.text,
    };
  });
  return `${playwrightImportLine(playwrightEntry)}

const apiBase = ${JSON.stringify(API_URL)};
const webBase = ${JSON.stringify(WEB_URL)};
const cases = ${JSON.stringify(cases, null, 2)};

(async () => {
  const failures = [];
  const api = await newRequest.newContext({ baseURL: apiBase });
  for (const c of cases) {
    if (!c.e2e) {
      const res = await api.fetch(c.path, { method: c.method });
      if (res.status() !== c.expectStatus) {
        failures.push(c.title + " Expected " + c.expectStatus + ", got " + res.status());
      }
      if (c.needles && c.needles.length) {
        const body = await res.text();
        for (const n of c.needles) {
          if (!body.toLowerCase().includes(String(n).toLowerCase())) {
            failures.push(c.title + " missing " + n);
          }
        }
      }
    } else {
      const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
      const page = await browser.newPage();
      await page.goto(webBase);
      const html = await page.content();
      for (const n of c.needles) {
        if (!html.toLowerCase().includes(String(n).toLowerCase())) {
          failures.push(c.title + " missing " + n);
        }
      }
      await browser.close();
    }
  }
  await api.dispose();
  if (failures.length) {
    console.error(failures.join("\\n"));
    process.exit(1);
  }
})();
`;
}
