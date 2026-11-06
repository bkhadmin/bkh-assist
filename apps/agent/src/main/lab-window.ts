/**
 * Panel window opened from the top bar: centred on the primary monitor and draggable by its header, except "rlu", a
 * dropdown anchored under its badge (not movable, height fits its content, closes when it loses focus).
 * Unlike the bar and the alert it takes focus while open (the user asked for it by clicking).
 */
import { BrowserWindow, ipcMain, screen } from "electron";
import { join } from "node:path";
import type { LabView, Panel } from "../shared/alert-state";

/** DIP, including the transparent shadow margin; rlu's height is only the first guess (the renderer reports its own). */
const SIZES: Record<Panel, { width: number; height: number }> = { save: { width: 760, height: 560 }, rlu: { width: 420, height: 240 }, opps: { width: 760, height: 560 }, authen: { width: 480, height: 320 }, settings: { width: 520, height: 420 }, ofc: { width: 560, height: 440 } };

/** transparent margin left/right/below the dropdown card (lab.css body.drop padding) */
const DROP_PAD = 14;
const MAX_DROP_HEIGHT = 520;

export class LabWindow {
  private win: BrowserWindow | null = null;
  private ready: Promise<void> = Promise.resolve();
  private panel: Panel | null = null;

  /** onClosed: the window is gone (✕, Esc, blur of the dropdown or closed by the agent) */
  constructor(private onClosed: () => void, onServicePoint?: (code: string) => void) {
    ipcMain.on("lab:close", (e) => {
      if (this.win && e.sender === this.win.webContents) this.close();
    });
    ipcMain.on("lab:service-point", (e, code: unknown) => {
      if (this.win && e.sender === this.win.webContents && typeof code === "string") onServicePoint?.(code);
    });
    // the dropdown's content height (DIP), so it fits its list: capped at MAX_DROP_HEIGHT and the work area
    ipcMain.on("lab:resize", (e, height: unknown) => {
      const win = this.win;
      if (!win || e.sender !== win.webContents || this.panel !== "rlu" || typeof height !== "number") return;
      const b = win.getBounds();
      const wa = screen.getDisplayMatching(b).workArea;
      win.setBounds({ ...b, height: Math.max(60, Math.min(Math.ceil(height), MAX_DROP_HEIGHT, wa.y + wa.height - b.y)) });
    });
  }

  isOpen() {
    return this.win != null;
  }

  /** anchor (DIP): where the dropdown's card starts, i.e. the RLU badge's left edge at the bar's bottom; for "rlu" */
  open(view: LabView, opts: { offscreen?: boolean; anchor?: { x: number; y: number } } = {}) {
    const drop = view.panel === "rlu";
    if (this.win && drop !== (this.panel === "rlu")) {
      // dropdown <-> centred panel: a fresh window (different position, movability and blur rule)
      const old = this.win;
      this.win = null;
      old.close();
    }
    if (!this.win) {
      const size = SIZES[view.panel];
      let pos: { x: number; y: number };
      if (drop) {
        const a = opts.anchor ?? { x: 0, y: 0 };
        const wa = screen.getDisplayNearestPoint(a).workArea;
        // the card sits DROP_PAD right of the window edge (side shadow margin); keep the whole window on screen
        pos = { x: Math.round(Math.max(wa.x, Math.min(a.x - DROP_PAD, wa.x + wa.width - size.width))), y: Math.round(Math.max(a.y, wa.y)) };
      } else {
        const wa = screen.getPrimaryDisplay().workArea;
        pos = { x: Math.round(wa.x + (wa.width - size.width) / 2), y: Math.round(wa.y + (wa.height - size.height) / 2) };
      }
      this.panel = view.panel;
      const win = new BrowserWindow({
        ...size,
        ...pos,
        show: false,
        frame: false,
        transparent: true, // rounded card with a shadow
        hasShadow: false,
        resizable: false,
        movable: !drop, // dragged by the header (-webkit-app-region: drag)
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        webPreferences: {
          preload: join(__dirname, "lab-preload.js"),
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false,
          offscreen: opts.offscreen ?? false,
        },
      });
      this.win = win;
      win.setAlwaysOnTop(true, "screen-saver");
      win.setMenu(null);
      // a replaced window (see above) must not report the new one as closed
      win.on("closed", () => {
        if (this.win !== win) return;
        this.win = null;
        this.panel = null;
        this.onClosed();
      });
      // clicking anywhere else closes the dropdown (the top bar never takes focus, so its badge toggles it instead)
      if (drop) win.on("blur", () => this.win === win && this.close());
      const devUrl = process.env.ELECTRON_RENDERER_URL;
      this.ready = devUrl ? win.loadURL(`${devUrl}/lab.html`) : win.loadFile(join(__dirname, "renderer", "lab.html"));
      void this.ready.then(() => !win.isDestroyed() && !opts.offscreen && win.show());
    }
    this.update(view);
  }

  update(view: LabView) {
    const win = this.win;
    if (win && view.panel !== this.panel) {
      if ((view.panel === "rlu") !== (this.panel === "rlu")) return; // dropdown <-> centred: open() replaces the window
      // switched panel: resize around the current centre (the user may have dragged the window)
      this.panel = view.panel;
      const b = win.getBounds();
      const size = SIZES[view.panel];
      win.setBounds({ ...size, x: Math.round(b.x + (b.width - size.width) / 2), y: Math.round(b.y + (b.height - size.height) / 2) });
    }
    if (win) void this.ready.then(() => !win.isDestroyed() && win.webContents.send("lab:view", view));
  }

  capture() {
    const win = this.win!;
    return this.ready.then(async () => {
      // an offscreen window keeps its first frame after setBounds (the dropdown's fit): force a fresh paint
      win.webContents.invalidate();
      await new Promise((r) => setTimeout(r, 200));
      return win.webContents.capturePage();
    });
  }

  close() {
    if (this.win && !this.win.isDestroyed()) this.win.close();
  }
}
