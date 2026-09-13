import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildClaudePrompt,
  extractSpecFromClaudeOutput,
} from "./claude-spec.ts";

test("extracts ESM spec from a markdown fence", () => {
  const raw = `Sure.

\`\`\`js
import { request as newRequest } from "/usr/lib/node_modules/playwright/index.mjs";
const api = await newRequest.newContext({ baseURL: "http://api:3005" });
\`\`\`
`;
  const spec = extractSpecFromClaudeOutput(raw);
  assert.ok(spec);
  assert.match(spec, /import /);
  assert.match(spec, /api:3005/);
  assert.doesNotMatch(spec, /```/);
});

test("rejects chatter without a playwright spec", () => {
  assert.equal(
    extractSpecFromClaudeOutput("Hello! What can I help you with?"),
    null,
  );
});

test("run prompt names qa-loop, MCP snapshot, and spec path — not print-only", () => {
  const prompt = buildClaudePrompt(
    "/tmp/claims.json",
    "/tmp/taw-qa.spec.mjs",
    "/usr/lib/node_modules/playwright/index.mjs",
  );
  assert.match(prompt, /qa-loop/);
  assert.match(prompt, /MCP snapshot/);
  assert.match(prompt, /taw-qa\.spec\.mjs/);
  assert.doesNotMatch(prompt, /Print ONLY/);
});

test("qa-loop skill gates spec behind claims then MCP snapshot", () => {
  const skill = readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      "../agent/skills/qa-loop/SKILL.md",
    ),
    "utf8",
  );
  assert.match(skill, /## 1\. Claims/);
  assert.match(skill, /## 2\. MCP/);
  assert.match(skill, /## 3\. Spec/);
  assert.match(skill, /snapshot taken this run/);
});
