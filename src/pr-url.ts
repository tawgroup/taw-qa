import { GITHUB_OWNER, REPOS, type SutagrowRepo } from "./config.ts";

export type ParsedPr = {
  owner: typeof GITHUB_OWNER;
  repo: SutagrowRepo;
  number: number;
  url: string;
};

export type ParsePrResult = ParsedPr | { error: string };

const PR_RE =
  /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?(?:[?#].*)?$/i;

export function parsePrUrl(input: string): ParsePrResult {
  const trimmed = input.trim();
  const m = trimmed.match(PR_RE);
  if (!m) {
    return {
      error:
        "URL không phải GitHub PR. Dùng dạng https://github.com/agribeacon/sutagrow-api/pull/123 hoặc sutagrow-web.",
    };
  }
  const owner = m[1].toLowerCase();
  const repo = m[2];
  const number = Number(m[3]);
  if (owner !== GITHUB_OWNER) {
    return {
      error: `PR phải thuộc ${GITHUB_OWNER}/sutagrow-api hoặc ${GITHUB_OWNER}/sutagrow-web, không phải ${owner}/${repo}.`,
    };
  }
  if (repo !== "sutagrow-api" && repo !== "sutagrow-web") {
    return {
      error: `Repo ${repo} không thuộc Feature 1. Chỉ sutagrow-api hoặc sutagrow-web.`,
    };
  }
  return {
    owner: GITHUB_OWNER,
    repo,
    number,
    url: `https://github.com/${GITHUB_OWNER}/${repo}/pull/${number}`,
  };
}

export function repoHash(pr: ParsedPr): string {
  return `${pr.owner}/${pr.repo}#${pr.number}`;
}

export function otherRepo(repo: SutagrowRepo): SutagrowRepo {
  return repo === "sutagrow-api" ? "sutagrow-web" : "sutagrow-api";
}
