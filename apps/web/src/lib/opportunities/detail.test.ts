// Run: node --test --experimental-strip-types apps/web/src/lib/opportunities/detail.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { fyEnd, opportunityDetail } from "./detail.ts";

const patient = { age_y: 62, age_m: 750, sex: "2" };

test("age band: basis and due before the next birthday past the band", () => {
  const d = opportunityDetail(
    [
      { source: "patient", column: "age_y", op: "between", value: "60, 70" },
      { source: "pp_special", codes: ["1B30"], column: "days_since", op: "gt_or_empty", value: "365" },
    ],
    [patient, { days_since: 120, count_fy: 0 }],
    "2026-11-09",
  );
  assert.deepEqual(d, { basis: "อายุ 62 ปี", lastDone: "2026-07-12", due: "ก่อนอายุครบ 71 ปี" });
});

test("never done, months, and no history condition", () => {
  const never = opportunityDetail(
    [
      { source: "patient", column: "age_m", op: "lt", value: "13" },
      { source: "vaccine", codes: ["815"], column: "days_since", op: "empty" },
    ],
    [{ age_m: 9 }, { days_since: null, count_fy: 0 }],
    "2026-11-09",
  );
  assert.deepEqual(never, { basis: "อายุ 9 เดือน", lastDone: null, due: "ก่อนอายุครบ 13 เดือน" });

  const none = opportunityDetail([{ source: "patient", column: "sex", op: "eq", value: "2" }], [patient], "2026-11-09");
  assert.deepEqual(none, { basis: null, lastDone: undefined, due: null });
});

test("once per fiscal year: due = 30 Sep, takes precedence over the age band; GA from the anc row", () => {
  const d = opportunityDetail(
    [
      { source: "patient", column: "age_y", op: "lte", value: "70" },
      { source: "anc", column: "pregnant", op: "eq", value: "1" },
      { source: "diag", codes: ["E11"], column: "days_since", op: "not_empty" }, // eligibility, not the service
      { source: "lab", codes: ["978"], column: "count_fy", op: "eq", value: "0" },
    ],
    [patient, { pregnant: 1, ga_weeks: 30 }, { days_since: 0, count_fy: 3 }, { days_since: 400, count_fy: 0 }],
    "2026-09-15",
  );
  assert.deepEqual(d, { basis: "อายุ 62 ปี, GA 30 สัปดาห์", lastDone: "2025-08-11", due: "2026-09-30" });
  assert.equal(fyEnd("2026-10-01"), "2027-09-30");
  assert.equal(fyEnd("2026-09-30"), "2026-09-30");
});
