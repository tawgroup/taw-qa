import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const compose = readFileSync(join(root, "docker-compose.yml"), "utf8");
const init = readFileSync(join(root, "docker/mongo-init.sh"), "utf8");

test("compose graph has agent, api, web, mongo", () => {
  for (const svc of ["  mongo:", "  api:", "  web:", "  agent:"]) {
    assert.ok(compose.includes(svc), `missing ${svc}`);
  }
});

test("api 3005 and web 3002 are not published to the Mac", () => {
  assert.doesNotMatch(compose, /ports:/);
  assert.doesNotMatch(compose, /3005:3005/);
  assert.doesNotMatch(compose, /3002:3002/);
  assert.match(compose, /expose:\n\s+- "3005"/);
  assert.match(compose, /expose:\n\s+- "3002"/);
  assert.match(compose, /PORT: "3005"/);
  assert.match(compose, /PORT: "3002"/);
  assert.match(compose, /http:\/\/api:3005/);
  assert.match(compose, /http:\/\/web:3002/);
});

test("mongo restore is wired to host dump dir and fails clearly when archive is absent", () => {
  assert.match(compose, /\/Users\/andie\/taw-qa\/mongo:\/dump:ro/);
  assert.match(compose, /\/Users\/andie\/Documents\/GitHub\/taw-qa\/docker\/mongo-init\.sh/);
  assert.match(init, /missing Mongo dump archive/);
  assert.match(init, /will not seed empty/);
});

test("host compose does not bind-mount Mac credential dirs", () => {
  assert.doesNotMatch(compose, /\.claude/);
  assert.doesNotMatch(compose, /\.ssh/);
  assert.doesNotMatch(compose, /\.config\/gh/);
  assert.match(compose, /docker\.sock/);
  assert.match(compose, /taw-qa-agent-claude/);
});
