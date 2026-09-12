export type GhPrView = {
  title: string;
  body: string;
  headRefName: string;
  url: string;
  files: string[];
};

export function prFieldsFromGhView(json: unknown): GhPrView {
  const o = json as {
    title?: unknown;
    body?: unknown;
    headRefName?: unknown;
    url?: unknown;
    files?: unknown;
  };
  const files = Array.isArray(o.files)
    ? o.files.map((f) => {
        if (typeof f === "string") return f;
        if (f && typeof f === "object" && "path" in f) {
          return String((f as { path: unknown }).path);
        }
        return "";
      }).filter(Boolean)
    : [];
  return {
    title: typeof o.title === "string" ? o.title : "",
    body: typeof o.body === "string" ? o.body : "",
    headRefName: typeof o.headRefName === "string" ? o.headRefName : "",
    url: typeof o.url === "string" ? o.url : "",
    files,
  };
}
