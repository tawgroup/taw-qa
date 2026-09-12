import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { planeUrlsForReport } from "./report.ts";

const agentSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "agent.ts"),
  "utf8",
);

test("agent waits for mongo healthy via interpretMongoPs before starting api/web", () => {
  const mongoFn = agentSrc.indexOf("interpretMongoPs");
  const upApi = agentSrc.indexOf('compose(["up", "-d", "api", "web"])');
  assert.ok(mongoFn > 0 && upApi > mongoFn);
  assert.doesNotMatch(
    agentSrc.slice(upApi - 400, upApi),
    /ps\.includes\("running"\)/,
  );
});

test("agent waits for api and web HTTP before running the spec", () => {
  const wait = agentSrc.indexOf("waitForHttp");
  const urls = agentSrc.indexOf("STACK_HTTP_URLS");
  const specRun = agentSrc.indexOf("execFileSync(process.execPath, [specPath]");
  assert.ok(urls > 0 && wait > 0 && specRun > wait, "waitForHttp must run before node spec");
  assert.ok(specRun > agentSrc.indexOf("for (const url of STACK_HTTP_URLS)"));
});

test("timeout handler posts Plane using closed-over matched tickets", () => {
  const timer = agentSrc.indexOf("setTimeout");
  const block = agentSrc.slice(timer, timer + 1600);
  assert.match(block, /postPlaneComment/);
  assert.match(block, /planeUrlsForReport/);
  assert.match(block, /ctx\.matched/);
});

test("planeUrlsForReport omits Plane on skip and lists every match otherwise", () => {
  const items = [
    { url: "https://plane.agribeacon.tech/and-7" },
    { url: "https://plane.agribeacon.tech/and-9" },
  ];
  assert.deepEqual(planeUrlsForReport(true, items), []);
  assert.deepEqual(planeUrlsForReport(false, items), [
    "https://plane.agribeacon.tech/and-7",
    "https://plane.agribeacon.tech/and-9",
  ]);
});
