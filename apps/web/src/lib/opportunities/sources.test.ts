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
