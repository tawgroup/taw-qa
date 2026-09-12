import assert from "node:assert/strict";
import test from "node:test";
import { otherRepo, parsePrUrl, repoHash } from "./pr-url.ts";

test("accepts agribeacon/sutagrow-api pull URL", () => {
  const got = parsePrUrl("https://github.com/agribeacon/sutagrow-api/pull/42");
  assert.deepEqual(got, {
    owner: "agribeacon",
    repo: "sutagrow-api",
    number: 42,
    url: "https://github.com/agribeacon/sutagrow-api/pull/42",
  });
});

test("accepts agribeacon/sutagrow-web pull URL with trailing slash", () => {
  const got = parsePrUrl("https://github.com/agribeacon/sutagrow-web/pull/7/");
  assert.equal("error" in got, false);
  if ("error" in got) return;
  assert.equal(got.repo, "sutagrow-web");
  assert.equal(got.number, 7);
});

test("rejects a non-PR URL", () => {
  const got = parsePrUrl("https://github.com/agribeacon/sutagrow-api");
  assert.equal("error" in got, true);
  if (!("error" in got)) return;
  assert.match(got.error, /GitHub PR/);
});

test("rejects another org", () => {
  const got = parsePrUrl("https://github.com/octocat/sutagrow-api/pull/1");
  assert.equal("error" in got, true);
  if (!("error" in got)) return;
  assert.match(got.error, /agribeacon/);
});

test("rejects mobile repo", () => {
  const got = parsePrUrl("https://github.com/agribeacon/sutagrow-mobile/pull/1");
  assert.equal("error" in got, true);
  if (!("error" in got)) return;
  assert.match(got.error, /sutagrow-api hoặc sutagrow-web/);
});

test("repoHash and otherRepo", () => {
  const pr = parsePrUrl("https://github.com/agribeacon/sutagrow-api/pull/9");
  if ("error" in pr) throw new Error(pr.error);
  assert.equal(repoHash(pr), "agribeacon/sutagrow-api#9");
  assert.equal(otherRepo("sutagrow-api"), "sutagrow-web");
  assert.equal(otherRepo("sutagrow-web"), "sutagrow-api");
});
