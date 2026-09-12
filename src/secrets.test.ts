import assert from "node:assert/strict";
import test from "node:test";
import { missingSecretMessages, readPlaneKeyFromSettings } from "./secrets.ts";

test("missing GH_TOKEN, Plane key, and .env files each produce a prompt; no invented secrets", () => {
  const msgs = missingSecretMessages({
    ghToken: undefined,
    planeApiKey: undefined,
    apiEnvExists: false,
    webEnvExists: false,
    apiEnvPath: "/Users/andie/agribeacon-ws/sutagrow-api/.env",
    webEnvPath: "/Users/andie/agribeacon-ws/sutagrow-web/.env",
  });
  assert.equal(msgs.length, 4);
  assert.match(msgs[0], /GH_TOKEN/);
  assert.match(msgs[0], /Không bịa/);
  assert.match(msgs[1], /PLANE_API_KEY/);
  assert.match(msgs[2], /sutagrow-api\/.env/);
  assert.match(msgs[3], /sutagrow-web\/.env/);
});

test("all present yields no prompts", () => {
  const msgs = missingSecretMessages({
    ghToken: "gho_present",
    planeApiKey: "plane_present",
    apiEnvExists: true,
    webEnvExists: true,
  });
  assert.deepEqual(msgs, []);
});

test("reads PLANE_API_KEY from Claude settings env block", () => {
  const key = readPlaneKeyFromSettings(
    JSON.stringify({ env: { PLANE_API_KEY: "plane_from_settings" } }),
  );
  assert.equal(key, "plane_from_settings");
});

test("missing or empty settings key is undefined", () => {
  assert.equal(readPlaneKeyFromSettings("{"), undefined);
  assert.equal(readPlaneKeyFromSettings("{}"), undefined);
  assert.equal(
    readPlaneKeyFromSettings(JSON.stringify({ env: { PLANE_API_KEY: "" } })),
    undefined,
  );
});
