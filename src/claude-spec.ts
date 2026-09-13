import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { TestableClaim } from "./claims.ts";
import { API_URL, WEB_URL } from "./config.ts";
import { resolvePlaywrightEntry } from "./fallback-spec.ts";

export const SPEC_PATH =
  "/Users/andie/Documents/GitHub/taw-qa/tmp/taw-qa.spec.mjs";
export const CLAIMS_PATH =
  "/Users/andie/Documents/GitHub/taw-qa/tmp/claims.json";
export const VIDEO_DIR =
  "/Users/andie/Documents/GitHub/taw-qa/tmp/videos";

export function extractSpecFromClaudeOutput(raw: string): string | null {
  let text = raw.trim();
  const fenced = text.match(
    /```(?:javascript|js|mjs|ts|typescript)?\s*([\s\S]*?)```/i,
  );
  if (fenced) text = fenced[1].trim();
  if (!/playwright/i.test(text)) return null;
  if (!/api:3005|WEB_URL|web:3002|newRequest|chromium/i.test(text)) return null;
  if (!/import\s+/.test(text)) return null;
  return text;
}

export function buildClaudePrompt(
  claimsPath: string,
  specPath: string,
  playwrightEntry: string,
): string {
  return [
    "Use the qa-loop skill.",
    `Claims JSON: ${claimsPath}`,
    `Write the spec to ${specPath} only after a Playwright MCP snapshot this run.`,
    `Import playwright from ${playwrightEntry}`,
    `API: ${API_URL}`,
    `Web: ${WEB_URL}`,
    `E2e video dir: ${VIDEO_DIR}`,
  ].join("\n");
}

export function runClaudeSpec(
  claims: TestableClaim[],
  opts: { cwd: string; specPath?: string },
): string | null {
  const specPath = opts.specPath ?? SPEC_PATH;
  mkdirSync("/Users/andie/Documents/GitHub/taw-qa/tmp", { recursive: true });
  writeFileSync(CLAIMS_PATH, JSON.stringify(claims, null, 2));
  const prompt = buildClaudePrompt(
    CLAIMS_PATH,
    specPath,
    resolvePlaywrightEntry(),
  );
  try {
    execFileSync(
      "claude",
      [
        "-p",
        prompt,
        "--output-format",
        "text",
        "--dangerously-skip-permissions",
      ],
      {
        encoding: "utf8",
        cwd: opts.cwd,
        timeout: 600_000,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          CLAUDE_CONFIG_DIR:
            process.env.CLAUDE_CONFIG_DIR || "/data/claude",
        },
      },
    );
  } catch {
    /* still try the file Claude may have written */
  }
  try {
    return extractSpecFromClaudeOutput(readFileSync(specPath, "utf8"));
  } catch {
    return null;
  }
}
