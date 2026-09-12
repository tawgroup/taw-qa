import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { once } from "node:events";
import test from "node:test";
import { STACK_HTTP_URLS, interpretMongoPs, waitForHttp } from "./health.ts";

test("STACK_HTTP_URLS are compose DNS api:3005 and web:3002", () => {
  assert.deepEqual([...STACK_HTTP_URLS], ["http://api:3005", "http://web:3002"]);
});

test("mongo State running without Health healthy is waiting, not ready", () => {
  const ps = JSON.stringify({
    Service: "mongo",
    State: "running",
    Health: "starting",
  });
  assert.equal(interpretMongoPs(ps, "").status, "waiting");
});

test("mongo running with empty Health is waiting (initdb still going)", () => {
  const ps = `${JSON.stringify({ Name: "taw-qa-mongo-1", State: "running", Health: "" })}\n`;
  assert.equal(interpretMongoPs(ps, "MongoDB starting").status, "waiting");
});

test("mongo Health healthy is ready", () => {
  const ps = JSON.stringify({
    Service: "mongo",
    State: "running",
    Health: "healthy",
  });
  assert.equal(interpretMongoPs(ps, "").status, "healthy");
});

test("missing dump log is missing-dump even if ps still says running", () => {
  const ps = JSON.stringify({
    Service: "mongo",
    State: "running",
    Health: "starting",
  });
  const logs =
    "taw-qa: missing Mongo dump archive in /dump (host /Users/andie/taw-qa/mongo/). Restore aborted; will not seed empty.";
  assert.equal(interpretMongoPs(ps, logs).status, "missing-dump");
});

test("exited mongo without dump message is exited", () => {
  const got = interpretMongoPs(
    JSON.stringify({ Service: "mongo", State: "exited (1)", Health: "" }),
    "some other crash",
  );
  assert.equal(got.status, "exited");
});

test("waitForHttp returns ok once a real server listens", async () => {
  const server = createServer((_req, res) => {
    res.writeHead(204);
    res.end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  try {
    const got = await waitForHttp(`http://127.0.0.1:${port}/`, {
      timeoutMs: 2000,
      intervalMs: 50,
    });
    assert.equal(got.ok, true);
  } finally {
    server.close();
  }
});

test("waitForHttp times out when nothing listens", async () => {
  const got = await waitForHttp("http://127.0.0.1:1/", {
    timeoutMs: 200,
    intervalMs: 50,
  });
  assert.equal(got.ok, false);
  if (got.ok) return;
  assert.match(got.error, /timeout waiting for http:\/\/127.0.0.1:1/);
});
