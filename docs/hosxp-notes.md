# HOSxP XE: what we know (for bkh_assist)

Facts learned by testing against the hospital's live HOSxP XE (MariaDB 10.11, db `bkhosxp`) and its Windows client.
Read this before changing how the agent detects saves, reads the screen, or picks a visit.
All tests were read-only. Dates are when the fact was verified.

## Contents
1. [How the agent sees HOSxP](#1-how-the-agent-sees-hosxp)
2. [Screens and controls](#2-screens-and-controls)
3. [Saving: timing and confirm dialog](#3-saving-timing-and-confirm-dialog)
4. [Knowing the visit (VN): `vn_lock`](#4-knowing-the-visit-vn-vn_lock)
5. [Lab order screen: clicks on lab items](#5-lab-order-screen-clicks-on-lab-items)
6. [Prescribing: drug–lab checks](#6-prescribing-druglab-checks)
7. [Database notes](#7-database-notes)
8. [Open decisions](#8-open-decisions)
9. [Test tools](#9-test-tools)

---

## 1. How the agent sees HOSxP

| Need | How | Notes |
|---|---|---|
| A save happened | Low-level mouse/keyboard hooks (`uiohook-napi`): left click on a button captioned `บันทึก…` in `HOSxPXE4.exe`, or F9 while a `บันทึก [F9]` button is in front | Listen only, never blocks HOSxP |
| Which patient | Win32 (`koffi`): label `HN` → the edit on the same row to its right; digits only | Read-only `WM_GETTEXT` |
| Which visit | `vn_lock` table (see §4); otherwise HN + save time in `opdscreen.update_datetime` | VN is not shown on screen |
| The data checked | The server queries HOSxP with a SELECT-only user | Never from the screen |

**Elevation (2026-11-05).** `HOSxPXE4.exe` runs elevated ("Run as administrator"). Windows (UIPI) does not deliver an
elevated window's input to hooks of a non-elevated process, so the agent must run elevated too: the installer
registers a logon task with "Run with highest privileges". `WM_GETTEXT` works across integrity levels;
`BM_GETCHECK` and most other messages do not.

**What cannot be read from the screen (2026-11-07).** DevExpress grids (`TcxGridSite`) paint their own cells:
neither Win32 nor UI Automation exposes their content (HOSxP has no UIA provider; the UIA tree is ~660 panes).
`PrintWindow` of HOSxP forms returns a blank image.

## 2. Screens and controls

| Screen | Window / form class | Save button | HN |
|---|---|---|---|
| OPD screening and doctor exam (same form) | `TDoctorWorkBenchQueueManagerForm` (inside `TMainForm`) | `TcxButton` "บันทึก [F9]"; F9 | `TcxDBTextEdit` right of `TcxLabel` "HN" |
| Doctor queue | `TDoctorWorkBenchQueueForm` | | |
| EMR viewer | `TPtEMRForm` | | |
| Lab order | `THOSxPLabOrderEntryForm` (separate top-level window) | `TcxButton` "บันทึก" (no F9) | none: read HN from the workbench behind it |

- Process name: `HOSxPXE4.exe`. Main window class: `TMainForm`.
- Screening and doctor exam share one form and one save button: a machine checks at most one module per form
  (enforced in admin and on the server).

## 3. Saving: timing and confirm dialog

- Click "บันทึก [F9]" → a confirm dialog with "ยืนยัน [F9]" → more dialogs. **F9 on the confirm dialog is not a new save**
  (no save button in front).
- HOSxP writes `opdscreen` about **5 s after** the click. The agent therefore polls the server (every 2 s, up to 30 s)
  until `update_datetime` is newer than the click. Cancelling the confirm dialog writes nothing → the agent gives up quietly.
- `opdscreen.update_datetime` is set on almost every row; stored in hospital local time (UTC+7, server `@@time_zone=SYSTEM`).

## 4. Knowing the visit (VN): `vn_lock`

`vn_lock` holds **one row per computer for the visit open in the doctor workbench** (verified 2026-11-07):

```
vn_lock(vn varchar PK, lock_date_time datetime, lock_computer varchar, lock_staff varchar, hos_guid char)
indexes: PRIMARY(vn), lock_computer, (lock_computer, vn), lock_date_time
```

| Test | Result |
|---|---|
| Open a patient | a row for this computer with that visit's VN; its HN equals the HN on screen |
| Switch to another patient | the row moves to the new visit within seconds |
| Open an **old** visit (e.g. April while the latest is November) | the row holds the **old** visit |
| Close the exam screen | the row is removed |

- `lock_computer` is the Windows computer name in **upper case** (the agent's `os.hostname()` may be mixed case:
  compare case-insensitively).
- Other computers in the hospital write it too; locks are minutes old, not stale.
- Viewing EMR only may not lock a visit (not tested): keep a fallback.

**Dead ends (do not use):** `ksklog` (no rows since 2026-10-28, no index on time), `key_lock` (last lock 2026-01).
`onlineuser` maps computer → login user and department (no patient).

## 5. Lab order screen: clicks on lab items

PoC 2026-11-07 (`THOSxPLabOrderEntryForm`):

- Lab items are `TLabCxCheckBox` controls (~67 per group); their caption is the lab name, readable with `WM_GETTEXT`
  (e.g. "PSA", "SGOT/AST", "Digoxin (ตรวจระดับยา)").
- A left click on one is detected with the same mouse hook → lab name, **before** the order is saved. Tested across
  a change of lab group (the group dropdown is a `TcxComboBox`).
- Name → code: `lab_items.lab_items_name` (TRIM). 741 items, **30 names are duplicated**: look up all codes with that name.
  Examples: PSA 461, CEA 460, Digoxin 360, Ferritin 278, SGOT/AST 99, SGPT/ALT 100, HbA1c 334, eGFR 921.
- **The checked state cannot be read**: `BM_GETCHECK` returns 0 for all (DevExpress check boxes are not Windows buttons),
  `PrintWindow` is blank. A click therefore cannot tell tick from untick; a warning on click should be informative
  ("last done on …"), not "you ordered X".

## 6. Prescribing: drug–lab checks

Goal (user, 2026-11-07): warn **before save** when a drug is prescribed whose safety depends on a lab, e.g.
metformin 500 mg (icode `1900344`, the only strength in use) vs eGFR (lab `921`), allopurinol vs HLA-B*5801.

**Before save, the agent cannot see the drug yet:**
- HOSxP does not write the drug to `opitemrece` (or `opitemrece_doctor_confirm`, `opitemrece_delta`, `rx_doctor`, …)
  until save (tested: the visit had 11 rows in `opitemrece`, metformin added on screen, 0 metformin rows).
- The added drug appears only in a DevExpress grid; no window text contains it.
- Not yet tested: reading the drug search/entry field while the doctor types or picks a drug.

**HOSxP already has a pre-save drug–lab alert** (configured in HOSxP, shown in its own prescribing screen):

```
drug_lab_interaction(drug_lab_interaction_id, generic_name)
drug_lab_interaction_list(drug_lab_interaction_list_id, drug_lab_interaction_id, lab_items_code, interaction_text (RTF),
  drug_lab_criteria_type_id, ref_value, ref_value_min, ref_value_max,
  total_mg, drug_lab_dose_chk_type_id, check_history ('Y'), max_history_day)
drug_lab_criteria_type: 1 = result >=, 2 = result <=, 3 = in range, 4 = not in range
drug_lab_dose_chk_type: 1 = per day, 2 = per dose
```

Configured on 2026-11-07: `METFORMIN HYDROCHLORIDE` (id 9) → lab 921, result ≤ 30, text "eGFR < 30 ห้ามใช้",
results from the last 180 days. (Another list row points at interaction id 4, which no longer exists.)

The requested metformin dose bands fit this built-in alert ("in range" + `total_mg` per day):

| eGFR | Max dose / day | Message |
|---|---|---|
| < 30 | — | ไม่แนะนำให้ใช้ (configured) |
| 30–45 | 1,000 mg | ใช้ยาเกินขนาด 1,000 มก./วัน · ตรวจไตทุก 3 เดือน |
| 45–60 | 2,000 mg | ใช้ยาเกินขนาด 2,000 มก./วัน · ตรวจไตทุก 3–6 เดือน |
| 60–190 | 3,000 mg | ใช้ยาเกินขนาด 3,000 มก./วัน · ตรวจไตอย่างน้อยปีละครั้ง |

What the built-in alert cannot do (candidates for a bkh_assist module "ตรวจการสั่งยา", checked at save time):
- no result within `max_history_day` → use the latest result anyway and show its date;
- text results (HLA-B*5801 Positive/Negative) and "never tested".

Notes on the user's original SQL draft (to fix before reuse): compares text results with numbers (">90" becomes 0 →
"not recommended"), assumes 500 mg per tablet, does not require `confirm_report = 'Y'`, gaps at 44.99/59.99, scans every
patient's eGFR for a year instead of one HN, selects patient names.

## 7. Database notes

- **Charset:** HOSxP's `init_connect` forces `SET NAMES tis620`; send `SET NAMES utf8mb4` on every connection or Thai
  parameters are misread (the web app does; `db-cli` does not, so Thai literals in db-cli queries do not match).
- **Future visits:** `ovst` holds visits dated in the future (145 on 2026-11-07, Nov 9 – Dec 3, each with an
  `opdscreen` row: pre-registered appointments). "Latest visit by HN" (`ORDER BY vstdate DESC`) picks them.
- **Main tables:** `ovst` (visit, unique `vn`), `opdscreen` (screening; unique `vn`, index `vstdate`; no index on
  `update_datetime`), `ovstdiag` (index `vn`; `icd10` upper case without dots; `diagtype` '1' = principal),
  `patient_history_hpi` (HPI; `opdscreen.hpi` has been empty since 2025-06), `lab_head` / `lab_order` / `lab_items`.
- **Empty values:** mostly NULL, sometimes 0; `> 0` covers both for numbers, `TRIM(x) <> ''` for text.
- Volume: ~800 OPD visits a day; hospital-wide about 2 screening saves a minute at peak (max 7).

## 8. Open decisions

1. **Top bar visit (RLU, opportunities, Authen):** today "latest visit by HN". Waiting for end users: data **as of the
   visit open on screen** (`vn_lock`) or **from the latest visit**? Could differ per badge.
2. **Future visits:** whatever is chosen, "latest" should be `vstdate <= CURDATE()`. Not changed yet.
3. **Drug–lab:** confirm whether doctors see HOSxP's built-in "eGFR < 30" alert today; if yes, configure the dose bands
   there and build only the gaps in bkh_assist.

## 9. Test tools

In `apps/agent/tools/` (PowerShell, read-only; text is masked except button captions, HN-length and VN-length digits):
- `inspect-hosxp.ps1`: list HOSxP windows or dump a window's control tree.
- `poc-watch.ps1`: log saves (click / F9) and the HN, the first PoC.

Run elevated when HOSxP is elevated. `.ps1` files with Thai text must be saved as UTF-8 **with BOM** for Windows PowerShell 5.1.
