import assert from "node:assert/strict";
import test from "node:test";
import { checkoutPlan } from "./checkout.ts";
import { parsePrUrl } from "./pr-url.ts";

test("PR of api checks out PR head there and staging for web; never agribeacon-ws; never merge", () => {
  const pr = parsePrUrl("https://github.com/agribeacon/sutagrow-api/pull/88");
  if ("error" in pr) throw new Error(pr.error);
  const plan = checkoutPlan(pr);
  assert.equal(plan.pr.repo, "agribeacon/sutagrow-api");
  assert.equal(plan.pr.dest, "/Users/andie/taw-qa/checkouts/sutagrow-api");
  assert.equal(plan.pr.ref, "pull/88/head");
  assert.equal(plan.other.repo, "agribeacon/sutagrow-web");
  assert.equal(plan.other.dest, "/Users/andie/taw-qa/checkouts/sutagrow-web");
  assert.equal(plan.other.ref, "staging");
  assert.equal(plan.forbiddenRoot, "/Users/andie/agribeacon-ws");
  assert.equal(plan.mergeIntoStaging, false);
  assert.equal(plan.startApiWebOnFailure, false);
});

test("PR of web swaps which repo is staging", () => {
  const pr = parsePrUrl("https://github.com/agribeacon/sutagrow-web/pull/3");
  if ("error" in pr) throw new Error(pr.error);
  const plan = checkoutPlan(pr);
  assert.equal(plan.pr.repo, "agribeacon/sutagrow-web");
  assert.equal(plan.other.repo, "agribeacon/sutagrow-api");
  assert.equal(plan.other.ref, "staging");
});
