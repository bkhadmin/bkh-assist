// Run: node --test --experimental-strip-types apps/web/src/lib/opportunities/conditions.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { matches } from "./conditions.ts";

test("numeric operators", () => {
  assert.equal(matches({ op: "between", value: "30, 59" }, 30, true), true);
  assert.equal(matches({ op: "between", value: "30,59" }, 60, true), false);
  assert.equal(matches({ op: "gte", value: "60" }, "60", true), true); // mysql2 returns bigint columns as strings
  assert.equal(matches({ op: "lt", value: "3" }, 2, true), true);
  assert.equal(matches({ op: "in", value: "9,18,30" }, "18", true), true);
  assert.equal(matches({ op: "not_in", value: "9,18" }, 10, true), true);
});

test("empty means never done", () => {
  assert.equal(matches({ op: "gt_or_empty", value: "1825" }, null, true), true);
  assert.equal(matches({ op: "gt_or_empty", value: "1825" }, 2000, true), true);
  assert.equal(matches({ op: "gt_or_empty", value: "1825" }, 100, true), false);
  assert.equal(matches({ op: "empty" }, null, true), true);
  assert.equal(matches({ op: "gt", value: "5" }, null, true), false);
  assert.equal(matches({ op: "lte", value: "730" }, null, true), false);
});

test("text compare", () => {
  assert.equal(matches({ op: "eq", value: "2" }, "2", false), true);
  assert.equal(matches({ op: "ne", value: "2" }, "1", false), true);
  assert.equal(matches({ op: "in", value: "1, 2" }, "2", false), true);
});
