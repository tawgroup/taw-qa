import { PLANE_PROJECT } from "./config.ts";

export type PlaneWorkItem = {
  id: string;
  identifier: string;
  project: string;
  url: string;
  status: string;
  comments: string[];
  qaLines: string[];
};

const AND_ID_RE = /\bAND-(\d+)\b/gi;

export function extractAndIdentifiers(...texts: string[]): string[] {
  const found = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    AND_ID_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = AND_ID_RE.exec(text)) !== null) {
      found.add(`AND-${m[1]}`);
    }
  }
  return [...found];
}

function commentsHit(
  item: PlaneWorkItem,
  prUrl: string,
  repoHash: string,
): boolean {
  const url = prUrl.replace(/\/$/, "");
  return item.comments.some((c) => {
    const body = c ?? "";
    return body.includes(url) || body.includes(repoHash);
  });
}

export function autoMatchPlane(opts: {
  prTitle: string;
  prBody: string;
  prBranch: string;
  prUrl: string;
  repoHash: string;
  items: PlaneWorkItem[];
}): PlaneWorkItem[] {
  const ids = new Set(
    extractAndIdentifiers(opts.prTitle, opts.prBody, opts.prBranch),
  );
  const byId = new Map<string, PlaneWorkItem>();
  for (const item of opts.items) {
    if (item.project !== PLANE_PROJECT) continue;
    const ident = item.identifier.toUpperCase();
    const fromPr = ids.has(ident);
    const fromComment = commentsHit(item, opts.prUrl, opts.repoHash);
    if (fromPr || fromComment) byId.set(ident, item);
  }
  return [...byId.values()];
}
