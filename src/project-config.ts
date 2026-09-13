/**
 * Host không bao giờ được làm BE_URL. Mode này ghi data thật; trỏ nhầm là ghi
 * vào prod. Chặn cả subdomain để `api.saas-be.agribeacon.tech` không lọt.
 */
export const PROD_HOSTS = [
  "saas-be.agribeacon.tech",
  "sutagrow.agribeacon.tech",
] as const;

export type ProjectConfig = {
  repo: string;
  beUrl: string;
  /** Origin mà BE allowlist. Proxy ghi `Origin` thành cái này khi gọi lên. */
  beAllowedOrigin: string;
  planeProject: string;
  testAccount: { email: string; password: string };
  /** Nội dung `.env` ghi vào checkout trước khi build. */
  feEnv: Record<string, string>;
};

export type ConfigError = { field: string; message: string };

export function isProdHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return PROD_HOSTS.some((p) => h === p || h.endsWith(`.${p}`));
}

/** Guard bước 5. Gọi trước khi Proxy bind port, không phải sau. */
export function assertNotProd(beUrl: string): void {
  let host: string;
  try {
    host = new URL(beUrl).hostname;
  } catch {
    throw new Error(`BE_URL không parse được: ${beUrl}`);
  }
  if (isProdHost(host)) {
    throw new Error(
      `BE_URL trỏ vào production (${host}). Proxy từ chối start — mode này ghi data thật.`,
    );
  }
}

/**
 * `NEXT_PUBLIC_SOCKET_URL` bắt buộc chỉ để build không thấy undefined. Trỏ nó
 * vào `:3018` là ĐÚNG Ý: Proxy trả 404 cho `/socket.io/*`, socket.io retry im
 * lặng, Claim realtime đã ghi `không test`. Đừng "sửa" nó thành BE thật —
 * WS upgrade không được proxy nên trình duyệt chặn CORS, vẫn chết mà khó đọc hơn.
 */
const REQUIRED_FE_ENV = [
  "NEXT_PUBLIC_SOCKET_URL",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_APP_ENV",
];

/**
 * Không suy gì từ `.env` của máy nào. `.env` của sutagrow-web trên Mac operator
 * đang trỏ prod trong khi `.env.example` cùng repo ghi staging — file đó không
 * phải nguồn tin cậy.
 */
export function validateConfig(raw: Partial<ProjectConfig>): ConfigError[] {
  const errors: ConfigError[] = [];
  const need = (field: keyof ProjectConfig, v: unknown) => {
    if (!v || (typeof v === "string" && !v.trim()))
      errors.push({ field, message: "thiếu, phải khai lúc setup" });
  };

  need("repo", raw.repo);
  need("beUrl", raw.beUrl);
  need("beAllowedOrigin", raw.beAllowedOrigin);
  need("planeProject", raw.planeProject);

  if (raw.beUrl) {
    let host: string | null = null;
    try {
      host = new URL(raw.beUrl).hostname;
    } catch {
      errors.push({ field: "beUrl", message: `không parse được: ${raw.beUrl}` });
    }
    if (host && isProdHost(host))
      errors.push({ field: "beUrl", message: `trỏ vào production (${host})` });
  }

  if (!raw.testAccount?.email || !raw.testAccount?.password)
    errors.push({
      field: "testAccount",
      message: "thiếu tài khoản test. Không dùng tài khoản người thật",
    });

  const feEnv = raw.feEnv ?? {};
  for (const k of REQUIRED_FE_ENV)
    if (!feEnv[k])
      errors.push({ field: `feEnv.${k}`, message: "thiếu — checkout sạch không có .env" });

  return errors;
}

/**
 * `NEXT_PUBLIC_API_URL` cố tình không nằm ở đây: `buildPrefix` trong
 * playwright.config.ts của repo đã bake nó thành http://127.0.0.1:3018/api.
 * Ghi vào đây chỉ tạo ảo giác là nó có tác dụng.
 */
export function renderFeEnv(cfg: Pick<ProjectConfig, "feEnv">): string {
  return Object.entries(cfg.feEnv)
    .filter(([k]) => k !== "NEXT_PUBLIC_API_URL")
    .map(([k, v]) => `${k}=${v}`)
    .join("\n") + "\n";
}
