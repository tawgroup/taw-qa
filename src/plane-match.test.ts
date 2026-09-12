import assert from "node:assert/strict";
import test from "node:test";
import { autoMatchPlane, extractAndIdentifiers } from "./plane-match.ts";
import type { PlaneWorkItem } from "./plane-match.ts";

const and42: PlaneWorkItem = {
  id: "id-42",
  identifier: "AND-42",
  project: "AND",
  url: "https://plane.agribeacon.tech/and-42",
  status: "Done",
  comments: [],
  qaLines: [],
};

const and7comment: PlaneWorkItem = {
  id: "id-7",
  identifier: "AND-7",
  project: "AND",
  url: "https://plane.agribeacon.tech/and-7",
  status: "Canceled",
  comments: ["please see agribeacon/sutagrow-api#88"],
  qaLines: [],
};

const and9url: PlaneWorkItem = {
  id: "id-9",
  identifier: "AND-9",
  project: "AND",
  url: "https://plane.agribeacon.tech/and-9",
  status: "Todo",
  comments: ["https://github.com/agribeacon/sutagrow-api/pull/88"],
  qaLines: [],
};

const otherProject: PlaneWorkItem = {
  id: "id-ops",
  identifier: "AND-42",
  project: "OPS",
  url: "https://plane.example/ops-42",
  status: "Todo",
  comments: [],
  qaLines: [],
};

test("extracts AND-n from title body branch", () => {
  assert.deepEqual(
    extractAndIdentifiers("fix AND-12", "also AND-13 and and-12", "feat/AND-14-login"),
    ["AND-12", "AND-13", "AND-14"],
  );
});

test("matches AND-n on the PR when the item is Plane project AND, including Done", () => {
  const matched = autoMatchPlane({
    prTitle: "Fix login AND-42",
    prBody: "",
    prBranch: "fix/login",
    prUrl: "https://github.com/agribeacon/sutagrow-api/pull/88",
    repoHash: "agribeacon/sutagrow-api#88",
    items: [and42, otherProject],
  });
  assert.equal(matched.length, 1);
  assert.equal(matched[0].identifier, "AND-42");
  assert.equal(matched[0].status, "Done");
});

test("drops identifier whose Plane project is not AND", () => {
  const matched = autoMatchPlane({
    prTitle: "AND-42",
    prBody: "",
    prBranch: "",
    prUrl: "https://github.com/agribeacon/sutagrow-api/pull/88",
    repoHash: "agribeacon/sutagrow-api#88",
    items: [otherProject],
  });
  assert.deepEqual(matched, []);
});

test("matches Plane comments containing repo#N or PR URL; keeps Canceled", () => {
  const matched = autoMatchPlane({
    prTitle: "no ticket in title",
    prBody: "",
    prBranch: "",
    prUrl: "https://github.com/agribeacon/sutagrow-api/pull/88",
    repoHash: "agribeacon/sutagrow-api#88",
    items: [and7comment, and9url],
  });
  const ids = matched.map((i) => i.identifier).sort();
  assert.deepEqual(ids, ["AND-7", "AND-9"]);
});
