import assert from "node:assert/strict";
import test from "node:test";
import { qaLinesFromHtml } from "./plane-client.ts";

test("qaLinesFromHtml extracts list items from Plane description", () => {
  const html =
    "<p>QA cần verify:</p><ul><li>GET / trả về 200</li><li>body hiện Welcome to SutaGrow API</li></ul>";
  assert.deepEqual(qaLinesFromHtml(html), [
    "GET / trả về 200",
    "body hiện Welcome to SutaGrow API",
  ]);
});
