import assert from "node:assert/strict";
import test from "node:test";
import { prFieldsFromGhView } from "./github-pr.ts";

test("reads title body branch url and file paths from gh pr view JSON", () => {
  const got = prFieldsFromGhView({
    title: "Fix AND-42 login",
    body: "- POST /login trả về 200",
    headRefName: "fix/login",
    url: "https://github.com/agribeacon/sutagrow-api/pull/88",
    files: [{ path: "src/server.ts" }, { path: ".env.example" }],
  });
  assert.equal(got.title, "Fix AND-42 login");
  assert.equal(got.headRefName, "fix/login");
  assert.deepEqual(got.files, ["src/server.ts", ".env.example"]);
});
