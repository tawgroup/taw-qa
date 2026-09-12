import assert from "node:assert/strict";
import test from "node:test";
import { main, usage } from "./cli.ts";

test("usage names bin/taw-qa run", () => {
  assert.match(usage(), /bin\/taw-qa run/);
});

test("invalid URL exits 1 with a clear error and does not start compose", async () => {
  const err: string[] = [];
  let composed = false;
  const code = await main(["run", "https://example.com/not-a-pr"], {
    env: {},
    stdout: { write() {} },
    stderr: { write(s) { err.push(s); } },
    spawnCompose: async () => {
      composed = true;
      return 0;
    },
  });
  assert.equal(code, 1);
  assert.equal(composed, false);
  assert.match(err.join(""), /GitHub PR/);
});

test("valid URL with tokens starts only the agent via compose", async () => {
  let args: string[] = [];
  const code = await main(
    ["run", "https://github.com/agribeacon/sutagrow-web/pull/3"],
    {
      env: { GH_TOKEN: "gho_test", PLANE_API_KEY: "plane_test" },
      stdout: { write() {} },
      stderr: { write() {} },
      spawnCompose: async (a) => {
        args = a;
        return 0;
      },
    },
  );
  assert.equal(code, 0);
  assert.ok(args.includes("agent"));
  assert.ok(args.includes("--no-deps"));
  assert.ok(args.some((a) => a.includes("sutagrow-web/pull/3")));
});

test("missing command prints usage", async () => {
  const err: string[] = [];
  const code = await main([], {
    env: {},
    stdout: { write() {} },
    stderr: { write(s) { err.push(s); } },
  });
  assert.equal(code, 1);
  assert.match(err.join(""), /bin\/taw-qa run/);
});
