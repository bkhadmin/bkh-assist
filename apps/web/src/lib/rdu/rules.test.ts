// Run: node --test --experimental-strip-types apps/web/src/lib/rdu/rules.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { RDU_RULES, bind, normalizeDrugText } from "./rules.ts";

test("12 rules with unique RDU.* codes, a label and criteria", () => {
  assert.equal(RDU_RULES.length, 12);
  assert.equal(new Set(RDU_RULES.map((r) => r.code)).size, 12);
  for (const r of RDU_RULES) {
    assert.match(r.code, /^RDU\.[A-Z_]+$/);
    assert.ok(r.label && r.criteria, r.code);
  }
});

test("bind: every named param becomes ? with its value, in order", () => {
  for (const r of RDU_RULES) {
    const { sql, params } = bind(r.sql, { hn: "1", vn: "2", icode: "3" });
    assert.doesNotMatch(sql, /:(hn|vn|icode)\b/, r.code);
    assert.equal((sql.match(/\?/g) ?? []).length - (r.sql.match(/\?/g) ?? []).length, params.length, r.code);
    assert.ok(params.includes("2"), `${r.code} uses the visit`);
  }
  assert.deepEqual(bind("SELECT :vn, :hn, :icode, :vn", { hn: "h", vn: "v", icode: "i" }), {
    sql: "SELECT ?, ?, ?, ?",
    params: ["v", "h", "i", "v"],
  });
});

test("normalizeDrugText: trims, collapses spaces, caps length", () => {
  assert.equal(normalizeDrugText("  AMOXYCILLIN  CAP   500 mg. เม็ด \n"), "AMOXYCILLIN CAP 500 mg. เม็ด");
  assert.equal(normalizeDrugText("   "), "");
  assert.equal(normalizeDrugText("x".repeat(300)).length, 200);
});
