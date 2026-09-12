import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { PATHS } from "./config.ts";
import type { CheckoutPlan } from "./checkout.ts";

function git(args: string[], cwd: string, extraEnv: NodeJS.ProcessEnv) {
  execFileSync("git", args, {
    cwd,
    env: extraEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function httpsCloneUrl(repo: string, token: string): string {
  return `https://x-access-token:${token}@github.com/${repo}.git`;
}

export function runCheckout(
  plan: CheckoutPlan,
  token: string,
): { ok: true } | { ok: false; error: string } {
  if (plan.pr.dest.startsWith(plan.forbiddenRoot)) {
    return { ok: false, error: "checkout dest is agribeacon-ws; refused" };
  }
  mkdirSync(PATHS.checkouts, { recursive: true });
  const env = {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
    GH_TOKEN: token,
  };
  try {
    for (const side of [plan.pr, plan.other] as const) {
      const url = httpsCloneUrl(side.repo, token);
      if (!existsSync(`${side.dest}/.git`)) {
        mkdirSync(side.dest, { recursive: true });
        git(["clone", "--filter=blob:none", url, side.dest], PATHS.checkouts, env);
      }
      git(["remote", "set-url", "origin", url], side.dest, env);
      git(["fetch", "origin", side.ref], side.dest, env);
      if (side === plan.pr) {
        git(["checkout", "--detach", "FETCH_HEAD"], side.dest, env);
      } else {
        git(["checkout", "staging"], side.dest, env);
        git(["reset", "--hard", "origin/staging"], side.dest, env);
      }
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}
