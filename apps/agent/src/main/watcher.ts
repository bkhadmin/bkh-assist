/**
 * Listens (never blocks) to global mouse/keyboard input and reports HOSxP saves.
 * Low-level hooks only see an elevated HOSxP when this process is elevated too.
 */
import { EventEmitter } from "node:events";
import { uIOhook, UiohookKey } from "uiohook-napi";
import * as w from "./win32";
import { describeScreen, findF9SaveButton, isHosxpWindow, isSaveButton, type ScreenInfo } from "./hosxp";

export type SaveEvent = ScreenInfo & { trigger: "click" | "F9"; savedAt: Date };

/** Two triggers for the same save (e.g. click then the F9 of the confirm dialog) within this window collapse into one. */
const DEDUPE_MS = 2500;

export class SaveWatcher extends EventEmitter<{ save: [SaveEvent] }> {
  private last = { at: 0, hn: "" as string | null };

  start() {
    uIOhook.on("mousedown", (e) => {
      if (e.button !== 1) return; // left button
      this.safely(() => {
        const h = w.windowFromPoint(e.x, e.y);
        if (isHosxpWindow(h) && isSaveButton(h)) this.report(h, "click");
      });
    });
    uIOhook.on("keydown", (e) => {
      if (e.keycode !== UiohookKey.F9) return;
      this.safely(() => {
        const fg = w.foregroundWindow();
        if (!isHosxpWindow(fg)) return;
        // F9 on the confirm dialog ("ยืนยัน [F9]") has no save button in front: not a new save.
        const btn = findF9SaveButton(w.rootOf(fg));
        if (btn) this.report(btn, "F9");
      });
    });
    uIOhook.start();
  }

  stop() {
    uIOhook.removeAllListeners();
    uIOhook.stop();
  }

  private report(button: w.Hwnd, trigger: SaveEvent["trigger"]) {
    const screen = describeScreen(button);
    if (!screen) return;
    const now = Date.now();
    if (now - this.last.at < DEDUPE_MS && this.last.hn === screen.hn) return;
    this.last = { at: now, hn: screen.hn };
    this.emit("save", { ...screen, trigger, savedAt: new Date(now) });
  }

  private safely(fn: () => void) {
    try {
      fn();
    } catch (err) {
      console.error("[watcher]", err);
    }
  }
}
