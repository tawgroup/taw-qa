import {
  PLANE_BASE_URL,
  PLANE_PROJECT,
  PLANE_PROJECT_ID,
  PLANE_WORKSPACE,
} from "./config.ts";
import type { PlaneWorkItem } from "./plane-match.ts";

type PlaneIssue = {
  id?: string;
  identifier?: string;
  sequence_id?: number;
  project?: string | { identifier?: string };
  project_detail?: { identifier?: string };
  state?: string | { name?: string };
  url?: string;
  description_html?: string;
  name?: string;
};

function identifierOf(issue: PlaneIssue): string {
  if (typeof issue.identifier === "string" && issue.identifier.length > 0) {
    return issue.identifier.toUpperCase();
  }
  if (typeof issue.sequence_id === "number") {
    return `${PLANE_PROJECT}-${issue.sequence_id}`;
  }
  return "";
}

function projectOf(issue: PlaneIssue): string {
  if (issue.project === PLANE_PROJECT_ID) return PLANE_PROJECT;
  if (typeof issue.project === "string" && issue.project === PLANE_PROJECT) {
    return PLANE_PROJECT;
  }
  return (
    (typeof issue.project === "object" && issue.project?.identifier) ||
    issue.project_detail?.identifier ||
    ""
  );
}

function statusOf(issue: PlaneIssue): string {
  if (typeof issue.state === "string") return issue.state;
  return issue.state?.name || "";
}

export function qaLinesFromHtml(html: string): string[] {
  if (!html) return [];
  return [...html.matchAll(/<li>(.*?)<\/li>/gis)]
    .map((m) => m[1].replace(/<[^>]+>/g, "").trim())
    .filter(Boolean);
}

async function fetchComments(apiKey: string, issueUuid: string): Promise<string[]> {
  const url = `${PLANE_BASE_URL}/api/v1/workspaces/${PLANE_WORKSPACE}/projects/${PLANE_PROJECT_ID}/issues/${issueUuid}/comments/`;
  const res = await fetch(url, { headers: { "X-API-Key": apiKey } });
  if (!res.ok) return [];
  const body = (await res.json()) as {
    results?: { comment_html?: string; comment_stripped?: string }[];
  };
  return (body.results ?? [])
    .map((c) => c.comment_stripped || c.comment_html || "")
    .filter(Boolean);
}

function toItem(issue: PlaneIssue, comments: string[]): PlaneWorkItem | null {
  const identifier = identifierOf(issue);
  if (!identifier || !issue.id) return null;
  return {
    id: issue.id,
    identifier,
    project: projectOf(issue),
    url: issue.url || `${PLANE_BASE_URL}/${identifier}`,
    status: statusOf(issue),
    comments,
    qaLines: qaLinesFromHtml(issue.description_html ?? ""),
  };
}

export async function fetchPlaneItemsByIds(
  apiKey: string,
  identifiers: string[],
): Promise<PlaneWorkItem[]> {
  const items: PlaneWorkItem[] = [];
  for (const ident of identifiers) {
    const url = `${PLANE_BASE_URL}/api/v1/workspaces/${PLANE_WORKSPACE}/issues/${ident}/`;
    const res = await fetch(url, { headers: { "X-API-Key": apiKey } });
    if (!res.ok) continue;
    const issue = (await res.json()) as PlaneIssue;
    const comments = issue.id ? await fetchComments(apiKey, issue.id) : [];
    const item = toItem(issue, comments);
    if (item) items.push(item);
  }
  return items;
}

export async function fetchPlaneItems(apiKey: string): Promise<PlaneWorkItem[]> {
  return fetchPlaneItemsByIds(apiKey, []);
}

export async function postPlaneComment(
  apiKey: string,
  issueUuid: string,
  markdown: string,
): Promise<void> {
  const url = `${PLANE_BASE_URL}/api/v1/workspaces/${PLANE_WORKSPACE}/projects/${PLANE_PROJECT_ID}/issues/${issueUuid}/comments/`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ comment_html: `<pre>${escapeHtml(markdown)}</pre>` }),
  });
  if (!res.ok) throw new Error(`Plane comment HTTP ${res.status}`);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
