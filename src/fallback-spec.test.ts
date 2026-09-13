import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  AGENT_PLAYWRIGHT_ENTRY,
  PLAYWRIGHT_IMPORT,
  buildFallbackSpec,
  expectedWebNeedles,
  playwrightImportLine,
} from "./fallback-spec.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = join(
  "/var/folders/np/ctblqj2173z9rrb99746x2880000gn/T/grok-goal-b734901e1f7d/implementer",
  "esm-playwright",
);

test("body hiện on API welcome is GET / with body needle, not web e2e", () => {
  const spec = buildFallbackSpec([
    {
      text: "body hiện Welcome to SutaGrow API",
      layer: "web",
      hasAssertion: true,
    },
  ]);
  assert.match(spec, /"method": "GET"/);
  assert.match(spec, /"path": "\/"/);
  assert.match(spec, /"e2e": false/);
  assert.match(spec, /Welcome to SutaGrow API/);
});

test("GET / is an API call to path / not an e2e case", () => {
  const spec = buildFallbackSpec([
    { text: "GET / trả về 200", layer: "api", hasAssertion: true },
  ]);
  assert.match(spec, /"path": "\/"/);
  assert.match(spec, /"method": "GET"/);
  assert.match(spec, /"e2e": false/);
  assert.match(spec, /"expectStatus": 200/);
});

test("web needles come from thấy/tạo, not an always-fail stub", () => {
  const needles = expectedWebNeedles(
    "e2e: login → tạo farm → thấy trên list",
  );
  assert.ok(needles.includes("list") || needles.some((n) => /list/i.test(n)));
  assert.ok(needles.some((n) => /farm/i.test(n)));
});

test("default fallback spec imports the agent global file, not the bare playwright specifier", () => {
  const spec = buildFallbackSpec([
    {
      text: "POST /farms trả về 201",
      layer: "api",
      hasAssertion: true,
    },
    {
      text: "e2e: login → tạo farm → thấy trên list",
      layer: "web",
      hasAssertion: true,
    },
  ]);
  assert.equal(PLAYWRIGHT_IMPORT, playwrightImportLine(AGENT_PLAYWRIGHT_ENTRY));
  assert.equal(spec.startsWith(PLAYWRIGHT_IMPORT), true);
  assert.match(
    spec,
    /\/usr\/(lib|local\/lib)\/node_modules\/playwright\/index\.mjs/,
  );
  assert.doesNotMatch(spec, /from "playwright"/);
  assert.match(spec, /http:\/\/api:3005/);
  assert.match(spec, /http:\/\/web:3002/);
  assert.match(spec, /recordVideo/);
  assert.match(spec, /\/login/);
  assert.match(spec, /expectStatus": 201/);
  assert.match(spec, /c\.expectStatus/);
  assert.match(spec, /needles/);
  assert.match(spec, /missing /);
  assert.doesNotMatch(spec, /needs an assertion/);
});

test("absolute agent-style import loads from a temp dir with empty node_modules and no NODE_PATH", () => {
  const agentNm = join(scratch, "usr", "local", "lib", "node_modules");
  const emptyRun = join(scratch, "empty-run");
  mkdirSync(join(emptyRun, "node_modules"), { recursive: true });
  mkdirSync(agentNm, { recursive: true });
  const pw = join(agentNm, "playwright");
  const pwCore = join(agentNm, "playwright-core");
  try {
    symlinkSync(join(root, "node_modules", "playwright"), pw);
  } catch {
    /* exists from a prior run */
  }
  try {
    symlinkSync(join(root, "node_modules", "playwright-core"), pwCore);
  } catch {
    /* exists */
  }
  const entry = join(pw, "index.mjs");
  const spec = buildFallbackSpec(
    [{ text: "POST /x → 201", layer: "api", hasAssertion: true }],
    entry,
  );
  const importOnly = `${playwrightImportLine(entry)}\nconsole.log(typeof chromium.launch, typeof newRequest.newContext);\n`;
  assert.equal(importOnly.split("\n")[0], spec.split("\n")[0]);
  assert.match(importOnly.split("\n")[0], /^import \{ chromium, request as newRequest \} from "/);
  assert.doesNotMatch(importOnly, /from "playwright"/);
  const file = join(emptyRun, "taw-qa.spec.mjs");
  writeFileSync(file, importOnly);
  const env = { ...process.env };
  delete env.NODE_PATH;
  const ran = spawnSync(process.execPath, [file], {
    encoding: "utf8",
    cwd: emptyRun,
    env,
  });
  assert.equal(ran.status, 0, ran.stderr + ran.stdout);
  assert.match(ran.stdout, /function function/);
  assert.ok(
    !file.startsWith(root + "/node_modules"),
    "spec must not live next to the host node_modules",
  );
  assert.ok(entry.startsWith(scratch), "playwright entry must be the agent-prefix fixture");
});
