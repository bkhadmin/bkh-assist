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

/** Read the HN shown on a form: label "HN" -> closest edit on the same row to its right. */
export function readHn(form: Hwnd): string | null {
  const kids = w.children(form).filter((h) => w.isVisible(h));
  const labels = kids.filter((h) => w.className(h).includes("Label") && w.windowText(h).trim() === "HN");
  let best: { hn: string; dx: number } | null = null;
  for (const lab of labels) {
    const lr = w.rectOf(lab);
    for (const e of kids) {
      const c = w.className(e);
      if (!c.includes("Edit") || c.includes("Inner")) continue;
      const er = w.rectOf(e);
      const dx = er.left - lr.right;
      if (Math.abs(er.top - lr.top) > 8 || dx < -4 || dx > 120) continue;
      const hn = w.windowText(e, 20).trim();
      if (/^\d{1,9}$/.test(hn) && (!best || dx < best.dx)) best = { hn, dx };
    }
  }
  return best?.hn ?? null;
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

/**
 * HN shown in HOSxP right now (for the top bar): the foreground HOSxP window first, else any visible one.
 * Polled about once a second; one EnumWindows + one EnumChildWindows per HOSxP window.
 */
export function shownHn(): string | null {
  const hosxp = w.topWindows().filter(isHosxpWindow);
  const fg = w.rootOf(w.foregroundWindow());
  hosxp.sort((a, b) => Number(w.sameHwnd(b, fg)) - Number(w.sameHwnd(a, fg)));
  for (const win of hosxp) {
    const hn = readHn(win);
    if (hn) return hn;
  }
  return null;
}
