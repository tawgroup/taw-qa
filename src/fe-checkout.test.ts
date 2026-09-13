import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";
import { workDir, writeFeEnv } from "./fe-checkout.ts";

test("workDir tách theo số PR nên hai run không giẫm nhau", () => {
  assert.notEqual(workDir(916), workDir(917));
  assert.match(workDir(916), /pr-916$/);
});

test("writeFeEnv ghi 0600 và bỏ NEXT_PUBLIC_API_URL", () => {
  const dir = mkdtempSync(`${tmpdir()}/tawqa-`);
  writeFeEnv(dir, {
    feEnv: {
      NEXT_PUBLIC_APP_ENV: "staging",
      NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3000",
      NEXT_PUBLIC_API_URL: "https://nham.example",
    },
  } as never);
  const body = readFileSync(`${dir}/.env`, "utf8");
  assert.match(body, /NEXT_PUBLIC_APP_ENV=staging/);
  // buildPrefix cua repo da bake gia tri nay; ghi vao day chi tao ao giac.
  assert.doesNotMatch(body, /NEXT_PUBLIC_API_URL/);
  assert.equal(statSync(`${dir}/.env`).mode & 0o777, 0o600);
});
