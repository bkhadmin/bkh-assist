/**
 * Panel window (HbA1c / "จัดเก็บ"), opened from the top bar: HbA1c medium, จัดเก็บ large, centred on the primary monitor, draggable by
 * its header. Unlike the bar and the alert it takes focus while open (the user asked for it by clicking).
 */
import { BrowserWindow, ipcMain, screen } from "electron";
import { join } from "node:path";
import type { LabView, Panel } from "../shared/alert-state";

/** DIP, including the transparent shadow margin: HbA1c is medium, the "จัดเก็บ" list large. */
const SIZES: Record<Panel, { width: number; height: number }> = { hba1c: { width: 480, height: 360 }, opps: { width: 760, height: 560 }, authen: { width: 480, height: 320 }, settings: { width: 520, height: 420 }, ofc: { width: 560, height: 440 } };

export class LabWindow {
  private win: BrowserWindow | null = null;
  private ready: Promise<void> = Promise.resolve();
  private panel: Panel | null = null;

  /** onClosed: the window is gone (✕, Esc or closed by the agent) */
  constructor(private onClosed: () => void, onServicePoint?: (code: string) => void) {
    ipcMain.on("lab:close", (e) => {
      if (this.win && e.sender === this.win.webContents) this.close();
    });
    ipcMain.on("lab:service-point", (e, code: unknown) => {
      if (this.win && e.sender === this.win.webContents && typeof code === "string") onServicePoint?.(code);
    });
  }

  isOpen() {
    return this.win != null;
  }

  open(view: LabView, opts: { offscreen?: boolean } = {}) {
    if (!this.win) {
      const wa = screen.getPrimaryDisplay().workArea;
      const size = SIZES[view.panel];
      this.panel = view.panel;
      this.win = new BrowserWindow({
        ...size,
        x: Math.round(wa.x + (wa.width - size.width) / 2),
        y: Math.round(wa.y + (wa.height - size.height) / 2),
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
      this.win.setAlwaysOnTop(true, "screen-saver");
      this.win.setMenu(null);
      this.win.on("closed", () => {
        this.win = null;
        this.panel = null;
        this.onClosed();
      });
      const devUrl = process.env.ELECTRON_RENDERER_URL;
      this.ready = devUrl ? this.win.loadURL(`${devUrl}/lab.html`) : this.win.loadFile(join(__dirname, "renderer", "lab.html"));
      const win = this.win;
      void this.ready.then(() => !win.isDestroyed() && !opts.offscreen && win.show());
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
    const win = this.win;
    return this.ready.then(() => win!.webContents.capturePage());
  }

  close() {
    if (this.win && !this.win.isDestroyed()) this.win.close();
  }
}
