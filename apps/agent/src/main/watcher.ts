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
    // BKH_DEBUG_INPUT=1: log what each left click / F9 hit (window class + whether it counts), to diagnose missed saves.
    // Never the window text of non-buttons (could be patient data).
    const debug = process.env.BKH_DEBUG_INPUT === "1" ? (...p: unknown[]) => console.log("[input]", ...p) : null;
    uIOhook.on("mousedown", (e) => {
      if (e.button !== 1) return; // left button
      this.safely(() => {
        const h = w.windowFromPoint(e.x, e.y);
        const hosxp = isHosxpWindow(h), save = hosxp && isSaveButton(h);
        debug?.(`click at ${e.x},${e.y} class=${w.className(h)} hosxp=${hosxp} save=${save}${/Button/.test(w.className(h)) ? ` caption=${JSON.stringify(w.windowText(h).trim())}` : ""}`);
        if (save) this.report(h, "click");
      });
    });
    uIOhook.on("keydown", (e) => {
      if (e.keycode !== UiohookKey.F9) return;
      this.safely(() => {
        const fg = w.foregroundWindow();
        const hosxp = isHosxpWindow(fg);
        // F9 on the confirm dialog ("ยืนยัน [F9]") has no save button in front: not a new save.
        const btn = hosxp ? findF9SaveButton(w.rootOf(fg)) : null;
        debug?.(`F9 foreground=${w.className(fg)} hosxp=${hosxp} saveButton=${btn ? "found" : "none"}`);
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
    if (!screen) return console.log("[input] save button outside a known HOSxP form: ignored");
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
