/**
 * Panel window opened from the top bar: centred on the primary monitor and draggable by its header.
 * Unlike the bar and the alert it takes focus while open (the user asked for it by clicking).
 */
import { BrowserWindow, ipcMain, screen } from "electron";
import { join } from "node:path";
import type { LabView, Panel } from "../shared/alert-state";

/** DIP, including the transparent shadow margin. */
const SIZES: Record<Panel, { width: number; height: number }> = { save: { width: 760, height: 560 }, rlu: { width: 760, height: 560 }, opps: { width: 760, height: 560 }, rdu: { width: 760, height: 560 }, warn: { width: 600, height: 400 }, authen: { width: 480, height: 320 }, settings: { width: 520, height: 420 }, ofc: { width: 560, height: 440 } };

export class LabWindow {
  private win: BrowserWindow | null = null;
  private ready: Promise<void> = Promise.resolve();
  private panel: Panel | null = null;

  /** onClosed: the window is gone (✕, Esc or closed by the agent) */
  constructor(private onClosed: () => void, onServicePoint?: (code: string) => void, onAck?: () => void) {
    ipcMain.on("lab:close", (e) => {
      if (this.win && e.sender === this.win.webContents) this.close();
    });
    // "รับทราบ" in the save panel: the user has seen the save result
    ipcMain.on("lab:ack", (e) => {
      if (this.win && e.sender === this.win.webContents) onAck?.();
    });
    ipcMain.on("lab:service-point", (e, code: unknown) => {
      if (this.win && e.sender === this.win.webContents && typeof code === "string") onServicePoint?.(code);
    });
  }

  isOpen() {
    return this.win != null;
  }

  /** inactive: show without taking focus (a warning popping up while the user types in HOSxP). */
  open(view: LabView, opts: { offscreen?: boolean; inactive?: boolean } = {}) {
    if (!this.win) {
      const size = SIZES[view.panel];
      const wa = screen.getPrimaryDisplay().workArea;
      const pos = { x: Math.round(wa.x + (wa.width - size.width) / 2), y: Math.round(wa.y + (wa.height - size.height) / 2) };
      this.panel = view.panel;
      const win = new BrowserWindow({
        ...size,
        ...pos,
        show: false,
        frame: false,
        transparent: true, // rounded card with a shadow
        hasShadow: false,
        resizable: false,
        movable: true, // dragged by the header (-webkit-app-region: drag)
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
      win.on("closed", () => {
        if (this.win !== win) return;
        this.win = null;
        this.panel = null;
        this.onClosed();
      });
      const devUrl = process.env.ELECTRON_RENDERER_URL;
      this.ready = devUrl ? win.loadURL(`${devUrl}/lab.html`) : win.loadFile(join(__dirname, "renderer", "lab.html"));
      void this.ready.then(() => !win.isDestroyed() && !opts.offscreen && (opts.inactive ? win.showInactive() : win.show()));
    }
    this.update(view);
  }

  update(view: LabView) {
    const win = this.win;
    if (win && view.panel !== this.panel) {
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
      // an offscreen window keeps its first frame after setBounds: force a fresh paint
      win.webContents.invalidate();
      await new Promise((r) => setTimeout(r, 200));
      return win.webContents.capturePage();
    });
  }

  close() {
    if (this.win && !this.win.isDestroyed()) this.win.close();
  }
}
