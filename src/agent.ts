import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as procStdin, stdout as procStdout } from "node:process";
import { assembleClaims, canPass, type AssembledClaims } from "./claims.ts";
import { checkoutPlan } from "./checkout.ts";
import { runCheckout } from "./checkout-run.ts";
import { envAction, formatEnvDiff } from "./env-diff.ts";
import { buildFallbackSpec } from "./fallback-spec.ts";
import { prFieldsFromGhView } from "./github-pr.ts";
import {
  STACK_HTTP_URLS,
  interpretMongoPs,
  waitForHttp,
} from "./health.ts";
import { fetchPlaneItemsByIds, postPlaneComment } from "./plane-client.ts";
import { extractAndIdentifiers } from "./plane-match.ts";
import { autoMatchPlane, type PlaneWorkItem } from "./plane-match.ts";
import { parsePrUrl, repoHash, otherRepo } from "./pr-url.ts";
import { planeUrlsForReport, renderReport } from "./report.ts";
import { RUN_TIMEOUT_MS, onTimeout, teardownStopServices } from "./timeout.ts";

const COMPOSE = ["docker", "compose"];

function sh(cmd: string, args: string[], opts?: { cwd?: string }) {
  return execFileSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    cwd: opts?.cwd,
  });
}

const HOST_REPO = "/Users/andie/Documents/GitHub/taw-qa";

function compose(args: string[]) {
  return sh(
    COMPOSE[0],
    [...COMPOSE.slice(1), "--project-directory", HOST_REPO, ...args],
    { cwd: HOST_REPO },
  );
}

function ghJson(prUrl: string): unknown {
  const raw = sh("gh", [
    "pr",
    "view",
    prUrl,
    "--json",
    "title,body,headRefName,url,files",
  ]);
  return JSON.parse(raw);
}

async function askPlane(
  stdin: NodeJS.ReadStream,
  stdout: NodeJS.WritableStream,
  prUrl: string,
): Promise<{ skip: boolean; extras: string[] }> {
  stdout.write(
    `Không khớp ticket Plane từ ${prUrl}. Nhập identifier hoặc URL Plane (cách nhau bởi dấu phẩy), hoặc 'bỏ' để skip Plane.\n`,
  );
  if (!stdin.isTTY) {
    stdout.write("stdin không TTY: bỏ Plane.\n");
    return { skip: true, extras: [] };
  }
  const rl = createInterface({ input: stdin, output: stdout });
  const answer = (await rl.question("> ")).trim();
  rl.close();
  if (!answer || /^b[oỏ]$/i.test(answer) || /^skip$/i.test(answer) || /^không$/i.test(answer)) {
    return { skip: true, extras: [] };
  }
  return {
    skip: false,
    extras: answer.split(/[\s,]+/).filter(Boolean),
  };
}

function postGithub(prUrl: string, body: string) {
  mkdirSync(`${HOST_REPO}/tmp`, { recursive: true });
  const file = `${HOST_REPO}/tmp/taw-qa-report.md`;
  writeFileSync(file, body);
  sh("gh", ["pr", "comment", prUrl, "--body-file", file]);
}

function stopApiWeb() {
  try {
    compose(["stop", ...teardownStopServices()]);
  } catch {
    // already stopped
  }
}

export async function runAgent(env: NodeJS.ProcessEnv): Promise<number> {
  const started = Date.now();
  const prUrl = env.PR_URL ?? "";
  const parsed = parsePrUrl(prUrl);
  if ("error" in parsed) {
    process.stderr.write(`${parsed.error}\n`);
    return 1;
  }
  const token = env.GH_TOKEN;
  if (!token) {
    process.stderr.write("Thiếu GH_TOKEN trong agent.\n");
    return 2;
  }

  const ctx: {
    skipPlane: boolean;
    matched: PlaneWorkItem[];
    claims: AssembledClaims | null;
    script: string;
  } = { skipPlane: false, matched: [], claims: null, script: "" };

  const timer = setTimeout(() => {
    void (async () => {
      const t = onTimeout();
      const md = renderReport({
        result: t.result,
        prUrl: parsed.url,
        planeUrls: planeUrlsForReport(ctx.skipPlane, ctx.matched),
        tested: ctx.claims?.testable.map((c) => c.text) ?? [],
        skipped: ctx.claims?.skipped.map((s) => s.text) ?? [],
        script: ctx.script,
        error: t.error,
      });
      try {
        postGithub(parsed.url, md);
      } catch {
        /* still Plane + teardown */
      }
      if (!ctx.skipPlane && env.PLANE_API_KEY) {
        for (const m of ctx.matched) {
          try {
            await postPlaneComment(env.PLANE_API_KEY, m.id, md);
          } catch {
            /* keep going */
          }
        }
      }
      stopApiWeb();
      process.exit(3);
    })();
  }, RUN_TIMEOUT_MS);
  timer.unref();

  let pr;
  try {
    pr = prFieldsFromGhView(ghJson(parsed.url));
  } catch (err) {
    process.stderr.write(`Không đọc được PR: ${String(err)}\n`);
    clearTimeout(timer);
    return 1;
  }

  const ids = extractAndIdentifiers(pr.title, pr.body, pr.headRefName);
  let planeItems: PlaneWorkItem[] = [];
  try {
    if (env.PLANE_API_KEY && ids.length > 0) {
      planeItems = await fetchPlaneItemsByIds(env.PLANE_API_KEY, ids);
    }
  } catch (err) {
    process.stderr.write(`Plane lookup failed: ${String(err)}\n`);
  }

  let matched = autoMatchPlane({
    prTitle: pr.title,
    prBody: pr.body,
    prBranch: pr.headRefName,
    prUrl: parsed.url,
    repoHash: repoHash(parsed),
    items: planeItems,
  });

  let skipPlane = false;
  if (matched.length === 0) {
    const ans = await askPlane(procStdin, procStdout, parsed.url);
    if (ans.skip) skipPlane = true;
    else {
      const extraIds = ans.extras.filter((e) => /^AND-\d+$/i.test(e));
      if (env.PLANE_API_KEY && extraIds.length) {
        try {
          planeItems = [
            ...planeItems,
            ...(await fetchPlaneItemsByIds(env.PLANE_API_KEY, extraIds)),
          ];
        } catch {
          /* keep existing */
        }
      }
      matched = planeItems.filter((i) =>
        ans.extras.some(
          (e) =>
            i.identifier.toUpperCase() === e.toUpperCase() || i.url === e,
        ),
      );
      if (matched.length === 0) skipPlane = true;
    }
  }
  ctx.matched = matched;
  ctx.skipPlane = skipPlane;

  const planeQa = [
    ...matched.flatMap((i) => i.qaLines),
    ...matched.flatMap((i) =>
      i.comments.filter(
        (c) =>
          /QA|verify|phải/i.test(c) && !/taw-qa:\s*(PASS|FAIL)/i.test(c),
      ),
    ),
  ];
  const claims = assembleClaims({
    prTitle: pr.title,
    prBody: pr.body,
    planeQa,
  });
  ctx.claims = claims;

  const action = envAction(pr.files);
  if (action === "ask-operator") {
    const macPath = parsed.repo === "sutagrow-api"
      ? "/Users/andie/agribeacon-ws/sutagrow-api/.env"
      : "/Users/andie/agribeacon-ws/sutagrow-web/.env";
    const mac = existsSync(macPath) ? readFileSync(macPath, "utf8") : "";
    process.stdout.write(
      `PR đụng .env / .env.example. Diff:\n${formatEnvDiff(mac, "")}\nGiữ file Mac. Không ghi đè im lặng.\n`,
    );
  }

  const plan = checkoutPlan(parsed);
  const checked = runCheckout(plan, token);
  if (!checked.ok) {
    const md = renderReport({
      result: "FAIL",
      prUrl: parsed.url,
      planeUrls: planeUrlsForReport(skipPlane, matched),
      tested: [],
      skipped: claims.skipped.map((s) => s.text),
      script: "",
      error: `checkout: ${checked.error}`,
      otherRepoAtStaging: `agribeacon/${otherRepo(parsed.repo)}`,
    });
    try {
      postGithub(parsed.url, md);
      if (!skipPlane && env.PLANE_API_KEY) {
        for (const m of matched) {
          await postPlaneComment(env.PLANE_API_KEY, m.id, md);
        }
      }
    } catch {
      /* reported locally */
    }
    clearTimeout(timer);
    return 1;
  }

  try {
    compose(["up", "-d", "mongo"]);
  } catch (err) {
    process.stderr.write(`mongo up failed: ${String(err)}\n`);
    clearTimeout(timer);
    return 1;
  }

  let mongoStatus = interpretMongoPs("", "");
  for (let i = 0; i < 60; i++) {
    let ps = "";
    let logs = "";
    try {
      ps = compose(["ps", "mongo", "--format", "json"]);
    } catch {
      ps = "";
    }
    try {
      logs = compose(["logs", "mongo", "--no-color"]);
    } catch {
      logs = "";
    }
    mongoStatus = interpretMongoPs(ps, logs);
    if (mongoStatus.status === "healthy") break;
    if (
      mongoStatus.status === "missing-dump" ||
      mongoStatus.status === "exited"
    ) {
      break;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (mongoStatus.status !== "healthy") {
    const md = renderReport({
      result: "FAIL",
      prUrl: parsed.url,
      planeUrls: planeUrlsForReport(skipPlane, matched),
      tested: [],
      skipped: claims.skipped.map((s) => s.text),
      script: "",
      error:
        mongoStatus.status === "missing-dump"
          ? "missing Mongo dump archive; will not seed empty"
          : `mongo failed to become healthy (${mongoStatus.status})`,
    });
    try {
      postGithub(parsed.url, md);
      if (!skipPlane && env.PLANE_API_KEY) {
        for (const m of matched) {
          await postPlaneComment(env.PLANE_API_KEY, m.id, md);
        }
      }
    } catch {
      /* */
    }
    clearTimeout(timer);
    return 1;
  }

  compose(["up", "-d", "api", "web"]);
  for (const url of STACK_HTTP_URLS) {
    const waited = await waitForHttp(url, {
      timeoutMs: 10 * 60 * 1000,
      intervalMs: 2000,
    });
    if (!waited.ok) {
      const md = renderReport({
        result: "FAIL",
        prUrl: parsed.url,
        planeUrls: planeUrlsForReport(skipPlane, matched),
        tested: [],
        skipped: claims.skipped.map((s) => s.text),
        script: "",
        error: waited.error,
      });
      try {
        postGithub(parsed.url, md);
        if (!skipPlane && env.PLANE_API_KEY) {
          for (const m of matched) {
            await postPlaneComment(env.PLANE_API_KEY, m.id, md);
          }
        }
      } catch {
        /* */
      }
      stopApiWeb();
      clearTimeout(timer);
      return 1;
    }
  }

  mkdirSync(`${HOST_REPO}/tmp`, { recursive: true });
  const specPath = `${HOST_REPO}/tmp/taw-qa.spec.mjs`;
  const script = buildFallbackSpec(claims.testable);
  ctx.script = script;
  writeFileSync(specPath, script);

  let result: "PASS" | "FAIL" = "FAIL";
  let error = "";
  if (!canPass(claims)) {
    error = "Zero Claim testable thì không PASS";
  } else {
    try {
      execFileSync(process.execPath, [specPath], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        cwd: HOST_REPO,
      });
      result = "PASS";
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      result = "FAIL";
    }
  }

  const elapsed = Date.now() - started;
  if (elapsed > RUN_TIMEOUT_MS) {
    const t = onTimeout();
    result = t.result;
    error = t.error;
  }

  const md = renderReport({
    result,
    prUrl: parsed.url,
    planeUrls: planeUrlsForReport(skipPlane, matched),
    tested: claims.testable.map((c) => c.text),
    skipped: claims.skipped.map((s) => `${s.text} (${s.reason})`),
    script,
    error: result === "FAIL" ? error : undefined,
    otherRepoAtStaging: `agribeacon/${otherRepo(parsed.repo)}`,
  });
  try {
    postGithub(parsed.url, md);
    if (!skipPlane && env.PLANE_API_KEY) {
      for (const m of matched) {
        await postPlaneComment(env.PLANE_API_KEY, m.id, md);
      }
    }
  } catch (err) {
    process.stderr.write(`Report post failed: ${String(err)}\n`);
  }

  stopApiWeb();
  clearTimeout(timer);
  return result === "PASS" ? 0 : 1;
}

const isEntry = process.argv[1] && process.argv[1].endsWith("agent.ts");
if (isEntry) {
  runAgent(process.env).then((code) => process.exit(code));
}
