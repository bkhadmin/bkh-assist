// Run: node --test --experimental-strip-types apps/web/src/lib/opportunities/sources.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { SOURCES } from "./sources.ts";

test("every source binds one param per placeholder", () => {
  for (const src of SOURCES) {
    for (const codes of [["1"], ["1", "2", "3"]]) {
      const { sql, params } = src.build(src.param ? codes : [], "690101000001");
      const marks = (sql.replace(/'[^']*'/g, "''").match(/\?/g) ?? []).length; // a "?" inside a string literal is not a param
      assert.equal(marks, params.length, `${src.code} with ${codes.length} codes`);
      assert.equal(params.at(-1), "690101000001", `${src.code}: vn is the last param`);
    }
  }
});

test("every declared column is selected", () => {
  for (const src of SOURCES) {
    const { sql } = src.build(src.param ? ["1"] : [], "690101000001");
    for (const col of src.columns) assert.match(sql, new RegExp(`\\b${col.name}\\b`), `${src.code}.${col.name}`);
  }
});

test("lab_provis shares the lab query and columns, matching by LABTEST code", () => {
  const lab = SOURCES.find((s) => s.code === "lab")!;
  const provis = SOURCES.find((s) => s.code === "lab_provis")!;
  assert.deepEqual(provis.columns, lab.columns);
  const a = lab.build(["334"], "1").sql;
  const b = provis.build(["0531601"], "1").sql;
  assert.equal(b.replace("IN (SELECT i.lab_items_code FROM lab_items i WHERE i.provis_labcode IN (?))", "IN (?)"), a);
  assert.ok(provis.param!.pattern.test("0531601"));
  assert.ok(!provis.param!.pattern.test("334") && !provis.param!.pattern.test("05316010"));
});

test("new sources and columns exist", () => {
  const cols = (code: string) => SOURCES.find((s) => s.code === code)?.columns.map((c) => c.name);
  for (const code of ["xray", "dental", "growth"]) assert.deepEqual(cols(code), ["days_since", "count_fy"], code);
  assert.deepEqual(cols("anc_lab"), ["done", "ga_weeks"]);
  for (const c of ["pnc_no", "pnc_window_done"]) assert.ok(cols("anc")!.includes(c), c);
  assert.ok(cols("patient")!.includes("birth_year_be"));
  assert.ok(cols("lab")!.includes("age_m_last"));
});

test("anc_lab done requires every distinct listed id", () => {
  const src = SOURCES.find((s) => s.code === "anc_lab")!;
  assert.match(src.build(["2", "4"], "1").sql, /COUNT\(DISTINCT l\.anc_lab_id\) = 2 /);
  assert.match(src.build(["2", "2"], "1").sql, /COUNT\(DISTINCT l\.anc_lab_id\) = 1 /);
});
