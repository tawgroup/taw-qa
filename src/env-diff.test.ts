import assert from "node:assert/strict";
import test from "node:test";
import { envAction, formatEnvDiff, prTouchesEnv } from "./env-diff.ts";

test("PR that does not touch env files uses the Mac file", () => {
  assert.equal(prTouchesEnv(["src/server.ts", "README.md"]), false);
  assert.equal(envAction(["src/server.ts"]), "use-mac");
});

test("PR that touches .env or .env.example asks the operator and does not overwrite", () => {
  assert.equal(prTouchesEnv(["sutagrow-api/.env"]), true);
  assert.equal(prTouchesEnv(["apps/web/.env.example"]), true);
  assert.equal(envAction([".env.example"]), "ask-operator");
  assert.equal(envAction([".env"]), "ask-operator");
});

test("formatEnvDiff shows Mac-only and PR-only lines", () => {
  const diff = formatEnvDiff("A=1\nB=2\n", "B=2\nC=3\n");
  assert.match(diff, /- A=1/);
  assert.match(diff, /\+ C=3/);
  assert.doesNotMatch(diff, /B=2/);
});
