/**
 * HbA1c window, opened from the top bar button: medium size, centred on the primary monitor, draggable by
 * its header. Unlike the bar and the alert it takes focus while open (the user asked for it by clicking).
 */
import { BrowserWindow, ipcMain, screen } from "electron";
import { join } from "node:path";
import type { LabView } from "../shared/alert-state";

const SIZE = { width: 480, height: 360 }; // DIP, includes the transparent shadow margin

export class LabWindow {
  private win: BrowserWindow | null = null;
  private ready: Promise<void> = Promise.resolve();

  /** onClosed: the window is gone (✕, Esc or closed by the agent) */
  constructor(private onClosed: () => void) {
    ipcMain.on("lab:close", (e) => {
      if (this.win && e.sender === this.win.webContents) this.close();
    });
  }

  isOpen() {
    return this.win != null;
  }

  open(view: LabView, opts: { offscreen?: boolean } = {}) {
    if (!this.win) {
      const wa = screen.getPrimaryDisplay().workArea;
      this.win = new BrowserWindow({
        ...SIZE,
        x: Math.round(wa.x + (wa.width - SIZE.width) / 2),
        y: Math.round(wa.y + (wa.height - SIZE.height) / 2),
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
