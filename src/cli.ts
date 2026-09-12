import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PATHS } from "./config.ts";
import { hostComposeRunArgs } from "./host-compose.ts";
import { parsePrUrl } from "./pr-url.ts";
import { missingSecretMessages, readPlaneKeyFromSettings } from "./secrets.ts";

export function resolveGhToken(env: NodeJS.ProcessEnv): string | undefined {
  const fromEnv = env.GH_TOKEN || env.GITHUB_TOKEN;
  if (fromEnv) return fromEnv;
  try {
    const t = execFileSync("gh", ["auth", "token"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return t || undefined;
  } catch {
    return undefined;
  }
}

export function resolvePlaneKey(env: NodeJS.ProcessEnv): string | undefined {
  if (env.PLANE_API_KEY) return env.PLANE_API_KEY;
  try {
    if (!existsSync(PATHS.claudeSettings)) return undefined;
    return readPlaneKeyFromSettings(readFileSync(PATHS.claudeSettings, "utf8"));
  } catch {
    return undefined;
  }
}

export function usage(): string {
  return "Cách dùng: bin/taw-qa run <github-pr-url>";
}

export async function main(
  argv: string[],
  io: {
    env: NodeJS.ProcessEnv;
    stdout: { write: (s: string) => void };
    stderr: { write: (s: string) => void };
    spawnCompose?: (args: string[], env: NodeJS.ProcessEnv) => Promise<number>;
  },
): Promise<number> {
  const [cmd, url] = argv;
  if (cmd !== "run" || !url) {
    io.stderr.write(`${usage()}\n`);
    return 1;
  }
  const parsed = parsePrUrl(url);
  if ("error" in parsed) {
    io.stderr.write(`${parsed.error}\n`);
    return 1;
  }
  const ghToken = resolveGhToken(io.env);
  const planeKey = resolvePlaneKey(io.env);
  const missing = missingSecretMessages({
    ghToken,
    planeApiKey: planeKey,
    apiEnvExists: existsSync(PATHS.apiEnv),
    webEnvExists: existsSync(PATHS.webEnv),
  });
  if (missing.length > 0) {
    for (const m of missing) io.stderr.write(`${m}\n`);
    return 2;
  }
  mkdirSync(PATHS.checkouts, { recursive: true });
  mkdirSync(PATHS.mongoDump, { recursive: true });
  const args = hostComposeRunArgs(parsed.url);
  const env = {
    ...io.env,
    GH_TOKEN: ghToken,
    PLANE_API_KEY: planeKey,
    PR_URL: parsed.url,
  };
  if (io.spawnCompose) return io.spawnCompose(args, env);
  io.stdout.write(`taw-qa: start agent for ${parsed.url}\n`);
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const child = spawn("docker", args, {
    stdio: "inherit",
    env,
    cwd: root,
  });
  return await new Promise((resolve) => {
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

const isEntry =
  process.argv[1] &&
  (process.argv[1].endsWith("cli.ts") || process.argv[1].endsWith("taw-qa"));

if (isEntry) {
  main(process.argv.slice(2), {
    env: process.env,
    stdout: process.stdout,
    stderr: process.stderr,
  }).then((code) => process.exit(code));
}
