/**
 * Warns BEFORE a redundant lab is ordered: a left click that ticks a lab checkbox on HOSxP's lab-order screen whose
 * caption is a lab of a warning RLU item calls onHit. Ported from TopStickly (electron/hosxp.js watchClicks).
 * Listens on the uIOhook that SaveWatcher starts (one low-level hook for the app); never blocks or swallows input.
 * Not seen: ticking with the keyboard (space), and lab comboboxes (see the note at the bottom).
 */
import { uIOhook, type UiohookMouseEvent } from "uiohook-napi";
import * as w from "./win32";

export type WarnItem = { code: string; label: string; message: string | null; labNames: string[] };

const CHECK_CLASS = /CheckBox|RadioButton/; // TcxCheckBox, TcxDBCheckBox, radio buttons
// DevExpress editors host an inner native edit; the click lands on it, the meaningful control is its parent
const INNER_CLASS = /^Tcx.*Inner/;
const REPAINT_MS = 120; // the checkbox toggles and repaints on mouseup: read it a little after
const READ_TRIES = 5; // HOSxP busy (ping times out) -> retry, then treat as unreadable
const DEDUPE_MS = 3000; // one hit per caption per 3 s (the caller handles per-patient rules)

/** HOSxP lab captions are lab_items_name plus an optional " ?". */
export const cleanCaption = (s: string) => s.replace(/\s*\?\s*$/, "").trim();

/** The first warning item that has this (raw) caption among its lab names. */
export function matchItem(items: WarnItem[], caption: string): WarnItem | undefined {
  const lab = cleanCaption(caption);
  return lab ? items.find((i) => i.labNames.some((n) => cleanCaption(n) === lab)) : undefined;
}

/** Ticked or unreadable -> warn ("a needless warning beats a missed one"); clearly unticked by the click -> not. */
export const shouldWarn = (checked: boolean | null) => checked !== false;

/** Starts watching; returns stop(). SaveWatcher must have started uIOhook. */
export function watchLabTicks(opts: {
  isHosxp: (h: w.Hwnd) => boolean;
  getWarnItems: () => WarnItem[];
  onHit: (item: WarnItem, caption: string) => void;
}): () => void {
  const lastHit = new Map<string, number>();
  let pressed: { h: w.Hwnd; caption: string; item: WarnItem } | null = null;

  const checkboxAt = (x: number, y: number): w.Hwnd | null => {
    let h = w.windowFromPoint(x, y);
    if (!opts.isHosxp(h)) return null;
    if (INNER_CLASS.test(w.className(h))) h = w.parentOf(h);
    return CHECK_CLASS.test(w.className(h)) ? h : null;
  };
  const safely = (fn: () => void) => {
    try {
      fn();
    } catch (err) {
      console.error("[lab-tick]", err);
    }
  };
  const read = (h: w.Hwnd, done: (checked: boolean | null) => void, tries = READ_TRIES) =>
    setTimeout(() => safely(() => {
      const v = w.isAlive(h) ? w.isCheckedByPixels(h) : null;
      if (v === null && tries > 1 && w.isAlive(h)) read(h, done, tries - 1);
      else done(v);
    }), REPAINT_MS);

  const down = (e: UiohookMouseEvent) => {
    pressed = null;
    if (e.button !== 1) return; // left button
    safely(() => {
      const h = checkboxAt(e.x, e.y);
      if (!h) return;
      const caption = cleanCaption(w.windowText(h));
      const item = matchItem(opts.getWarnItems(), caption);
      if (item) pressed = { h, caption, item };
    });
  };
  const up = (e: UiohookMouseEvent) => {
    const p = pressed;
    pressed = null;
    if (!p || e.button !== 1) return;
    safely(() => {
      // released elsewhere = no click, the box did not toggle
      if (!w.sameHwnd(checkboxAt(e.x, e.y), p.h)) return;
      read(p.h, (checked) => {
        if (!shouldWarn(checked)) return;
        const now = Date.now();
        if (now - (lastHit.get(p.caption) ?? 0) < DEDUPE_MS) return;
        lastHit.set(p.caption, now);
        opts.onHit(p.item, p.caption);
      });
    });
  };
  uIOhook.on("mousedown", down);
  uIOhook.on("mouseup", up);
  return () => {
    uIOhook.off("mousedown", down);
    uIOhook.off("mouseup", up);
  };
}

// Comboboxes: not done. TopStickly waits for the DevExpress dropdown (a top-level *Popup* window) to open and close,
// then reads the edit's text; the lab-order screen picks labs by checkbox, so it is not worth that polling here.
