import crypto from "node:crypto";

export type AppCreds = {
  app_id: string;
  installation_id: string;
  private_key_pem: string;
};

const b64 = (o: unknown) =>
  Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString(
    "base64url",
  );

/** JWT sống 9 phút; GitHub chặn quá 10. */
export function appJwt(appId: string, pem: string, now = Date.now()): string {
  const iat = Math.floor(now / 1000) - 60;
  const h = b64({ alg: "RS256", typ: "JWT" });
  const p = b64({ iat, exp: iat + 540, iss: appId });
  const sig = crypto
    .sign("RSA-SHA256", Buffer.from(`${h}.${p}`), pem)
    .toString("base64url");
  return `${h}.${p}.${sig}`;
}

/**
 * Token sống 1 giờ, mà timeout một lần chạy là 45 phút. Biên 15 phút, và thứ
 * chạy cuối cùng lại là đăng Report — nên đúc lại ngay trước khi đăng thay vì
 * dùng lại token từ lúc clone.
 */
export async function installationToken(c: AppCreds): Promise<string> {
  const r = await fetch(
    `https://api.github.com/app/installations/${c.installation_id}/access_tokens`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${appJwt(c.app_id, c.private_key_pem)}`,
        accept: "application/vnd.github+json",
      },
    },
  );
  if (!r.ok) throw new Error(`đúc token lỗi ${r.status}: ${await r.text()}`);
  return ((await r.json()) as { token: string }).token;
}

export type PrInfo = {
  number: number;
  title: string;
  body: string;
  headSha: string;
  headRef: string;
  htmlUrl: string;
};

export async function readPr(
  token: string,
  repo: string,
  number: number,
): Promise<PrInfo> {
  const r = await fetch(`https://api.github.com/repos/${repo}/pulls/${number}`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" },
  });
  if (!r.ok) throw new Error(`đọc PR lỗi ${r.status}: ${await r.text()}`);
  const d = (await r.json()) as {
    number: number;
    title: string;
    body: string | null;
    head: { sha: string; ref: string };
    html_url: string;
  };
  return {
    number: d.number,
    title: d.title,
    body: d.body ?? "",
    headSha: d.head.sha,
    headRef: d.head.ref,
    htmlUrl: d.html_url,
  };
}

/** Comment trên PR đi qua API issues — đây là lý do cần `Issues: Write`. */
export async function postComment(
  token: string,
  repo: string,
  number: number,
  body: string,
): Promise<string> {
  const r = await fetch(
    `https://api.github.com/repos/${repo}/issues/${number}/comments`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ body }),
    },
  );
  if (!r.ok) throw new Error(`đăng comment lỗi ${r.status}: ${await r.text()}`);
  return ((await r.json()) as { html_url: string }).html_url;
}

/** URL clone mang token; installation token dùng thẳng làm HTTP password. */
export function cloneUrl(token: string, repo: string): string {
  return `https://x-access-token:${token}@github.com/${repo}.git`;
}

/** Không bao giờ để token lọt vào log hay Report. */
export function redact(text: string, token: string): string {
  return token ? text.split(token).join("***") : text;
}
