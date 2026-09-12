import assert from "node:assert/strict";
import test from "node:test";
import {
  KEEP_VOLUMES,
  RUN_TIMEOUT_MS,
  onTimeout,
  teardownStopServices,
} from "./timeout.ts";

test("run timeout is 45 minutes", () => {
  assert.equal(RUN_TIMEOUT_MS, 45 * 60 * 1000);
});

test("timeout yields FAIL timeout, stops api and web, keeps mongo and claude volumes", () => {
  const got = onTimeout();
  assert.equal(got.result, "FAIL");
  assert.equal(got.error, "timeout");
  assert.deepEqual(got.stopServices, ["api", "web"]);
  assert.deepEqual([...got.keepVolumes], ["taw-qa-mongo", "taw-qa-agent-claude"]);
  assert.deepEqual(teardownStopServices(), ["api", "web"]);
  assert.ok(KEEP_VOLUMES.includes("taw-qa-mongo"));
  assert.ok(KEEP_VOLUMES.includes("taw-qa-agent-claude"));
});
