import assert from "node:assert/strict";
import test from "node:test";
import { FORBIDDEN_BINDS, hostComposeRunArgs } from "./host-compose.ts";

test("host starts only the agent service with PR_URL and token env, no extra bind mounts", () => {
  const args = hostComposeRunArgs(
    "https://github.com/agribeacon/sutagrow-api/pull/88",
  );
  assert.deepEqual(args, [
    "compose",
    "run",
    "--rm",
    "--no-deps",
    "-e",
    "PR_URL=https://github.com/agribeacon/sutagrow-api/pull/88",
    "-e",
    "GH_TOKEN",
    "-e",
    "PLANE_API_KEY",
    "agent",
  ]);
  const joined = args.join(" ");
  for (const bad of FORBIDDEN_BINDS) {
    assert.equal(joined.includes(bad), false);
  }
});
