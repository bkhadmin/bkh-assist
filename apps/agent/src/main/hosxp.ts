/**
 * Knowledge about HOSxP XE screens, learned from the PoC on 2026-11-05:
 * - the screening screen is TDoctorWorkBenchQueueManagerForm (Delphi VCL + DevExpress)
 * - the save button is a TcxButton captioned "บันทึก [F9]"; F9 does the same
 * - after saving, a confirm dialog with "ยืนยัน [F9]" appears (its F9 is NOT a new save)
 * - HN is the TcxDBTextEdit right of the TcxLabel "HN" on the same row
 */
import * as w from "./win32";
import type { Hwnd } from "./win32";

const HOSXP_EXE = /hosxp/i;
const SAVE_CAPTION = /^บันทึก/;

export const isHosxpWindow = (h: Hwnd) => !w.isNull(h) && HOSXP_EXE.test(w.processExe(w.processIdOf(h)));

export function isSaveButton(h: Hwnd): boolean {
  return /Button/.test(w.className(h)) && SAVE_CAPTION.test(w.windowText(h).trim());
}

/** Nearest ancestor that is a HOSxP screen (class ends in "Form", not the TPlaceForm helper). */
export function ownerForm(h: Hwnd): Hwnd | null {
  for (let p = h, depth = 0; !w.isNull(p) && depth < 40; p = w.parentOf(p), depth++) {
    const c = w.className(p);
    if (c.endsWith("Form") && c !== "TPlaceForm") return p;
  }
  return null;
}

/** The visible "บันทึก [F9]" button inside a top-level window, if any. */
export function findF9SaveButton(top: Hwnd): Hwnd | null {
  for (const c of w.children(top)) {
    if (!w.isVisible(c) || !/Button/.test(w.className(c))) continue;
    const t = w.windowText(c).trim();
    if (SAVE_CAPTION.test(t) && t.includes("F9")) return c;
  }
  return null;
}

const HN_LABEL = /^\s*HN\s*(\/\s*Q)?\s*[:.]?\s*$/i; // "HN", "HN/Q", "HN :", "HN."
const HN_VALUE = /^\d+$/; // digits only; leading zeros are part of the HN
const hnText = (edit: Hwnd) => w.windowTextOrNull(edit, 20)?.trim() ?? null;

/**
 * The HN edit on a window: label "HN" -> closest edit on the same row to its right, holding an HN.
 * null = none, undefined = none found but HOSxP did not answer some text reads (busy).
 */
function findHnEdit(win: Hwnd): { edit: Hwnd; hn: string } | null | undefined {
  const kids = w.children(win).filter((h) => w.isVisible(h));
  let busy = false;
  let best: { edit: Hwnd; hn: string; dx: number } | null = null;
  for (const lab of kids) {
    if (!w.className(lab).includes("Label")) continue;
    const t = w.windowTextOrNull(lab);
    if (t === null) busy = true;
    if (!t || !HN_LABEL.test(t)) continue;
    const lr = w.rectOf(lab);
    for (const e of kids) {
      const c = w.className(e);
      if (!c.includes("Edit") || c.includes("Inner")) continue;
      const er = w.rectOf(e);
      const dx = er.left - lr.right;
      if (Math.abs(er.top - lr.top) > 8 || dx < -4 || dx > 120) continue;
      const hn = hnText(e);
      if (hn === null) busy = true;
      else if (HN_VALUE.test(hn) && (!best || dx < best.dx)) best = { edit: e, hn, dx };
    }
  }
  return best ?? (busy ? undefined : null);
}

/** Read the HN shown on a form (used for the saved form); null if none or unreadable. */
export function readHn(form: Hwnd): string | null {
  return findHnEdit(form)?.hn ?? null;
}

export type ScreenInfo = { form: string; formHwnd: Hwnd; hn: string | null; bounds: w.Rect };

export function describeScreen(saveButton: Hwnd): ScreenInfo | null {
  const form = ownerForm(saveButton);
  if (!form) return null;
  return { form: w.className(form), formHwnd: form, hn: readHn(form), bounds: w.rectOf(w.rootOf(form)) };
}

/** HN currently shown on a HOSxP form; null if the form is gone or shows no HN. */
export function currentHn(form: Hwnd): string | null {
  return w.isAlive(form) && w.isVisible(form) ? readHn(form) : null;
}

let hnCache: { top: Hwnd; edit: Hwnd } | null = null;

/**
 * HN shown in HOSxP right now (for the top bar); null = none, undefined = HOSxP busy (keep the last one).
 * Windows are tried foreground first, then in z-order (a dialog over the main form wins).
 * Polled about once a second: the HN edit found is cached while the same window stays on top, so a poll is
 * usually one EnumWindows + one WM_GETTEXT; it re-scans the children only when the top window or the edit changes.
 */
export function shownHn(): string | null | undefined {
  const hosxp = w.topWindows().filter((h) => isHosxpWindow(h) && w.className(h) !== "TApplication"); // z-order, top first
  const fg = w.rootOf(w.foregroundWindow());
  hosxp.sort((a, b) => Number(w.sameHwnd(b, fg)) - Number(w.sameHwnd(a, fg))); // stable: the rest keep z-order
  const top = hosxp[0];
  if (hnCache && w.sameHwnd(hnCache.top, top) && w.isAlive(hnCache.edit) && w.isVisible(hnCache.edit)) {
    const hn = hnText(hnCache.edit);
    if (hn === null) return undefined;
    if (HN_VALUE.test(hn)) return hn;
  }
  hnCache = null;
  let busy = false;
  for (const win of hosxp) {
    const found = findHnEdit(win);
    if (found) {
      hnCache = { top, edit: found.edit };
      return found.hn;
    }
    if (found === undefined) busy = true;
  }
  return busy ? undefined : null;
}

/**
 * True when a visible HOSxP runs elevated ("Run as administrator") but this agent does not: Windows then hides
 * HOSxP's clicks/keys from our low-level hooks, so saves are never seen (the HN can still be read).
 */
export function savesHidden(): boolean {
  if (w.isElevated()) return false;
  return w.topWindows().some((h) => isHosxpWindow(h) && w.isVisible(h) && w.isProcessElevated(w.processIdOf(h)) === true);
}
