/**
 * Sticky top bar (replaces the tray icon): a 30 px strip docked to the top of the primary monitor and
 * registered as an AppBar, so Windows reserves the space and maximized windows (HOSxP) start below it.
 * Always on top and non-activating, like the alert: it never takes focus from HOSxP. Shows only the HN on screen.
 *
 * Collapsed (button at the right): the AppBar is removed so Windows gives the strip back, and only a small
 * tab stays at the top centre (not top right, where it would cover the window's close button) to expand again.
 */
import { BrowserWindow, ipcMain, screen } from "electron";
import { join } from "node:path";
import type { TopbarCommand, TopbarStatus } from "../shared/alert-state";
import { ABN_POSCHANGED, APPBAR_CALLBACK, AppBar } from "./appbar";

export const TOPBAR_HEIGHT = 30; // DIP
const TAB = { width: 170, height: 24 }; // collapsed tab, DIP

export class TopbarWindow {
  private win: BrowserWindow;
  private appbar: AppBar | null = null;
  private ready: Promise<void>;
  private status: TopbarStatus | null = null;
  private collapsed = false;

  /** dock = false: render only (demo screenshots), do not reserve screen space. */
  constructor(opts: { dock?: boolean; offscreen?: boolean; onLab?: (open: boolean) => void; onUpdate?: () => void } = {}) {
    const wa = screen.getPrimaryDisplay().bounds;
    this.win = new BrowserWindow({
      x: wa.x,
      y: wa.y,
      width: wa.width,
      height: TOPBAR_HEIGHT,
      show: false,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      focusable: false,
      alwaysOnTop: true,
      transparent: true, // the collapsed tab has rounded corners
      hasShadow: false,
      webPreferences: {
        preload: join(__dirname, "topbar-preload.js"),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        offscreen: opts.offscreen ?? false,
        backgroundThrottling: false,
      },
    });
    this.win.setAlwaysOnTop(true, "screen-saver");
    this.win.setMenu(null);
    const devUrl = process.env.ELECTRON_RENDERER_URL;
    this.ready = devUrl ? this.win.loadURL(`${devUrl}/topbar.html`) : this.win.loadFile(join(__dirname, "renderer", "topbar.html"));
    // every (re)load, e.g. a Vite reload in dev: the page starts empty, so send the current state again
    this.win.webContents.on("did-finish-load", () => {
      if (this.status) this.win.webContents.send("topbar:status", this.status);
      if (this.collapsed) this.win.webContents.send("topbar:collapsed", true);
    });

    ipcMain.on("topbar:cmd", (e, cmd: TopbarCommand) => {
      if (e.sender !== this.win.webContents) return;
      if (cmd.type === "collapse") this.setCollapsed(true);
      if (cmd.type === "expand") this.setCollapsed(false);
      if (cmd.type === "lab") opts.onLab?.(cmd.open);
      if (cmd.type === "update") opts.onUpdate?.();
    });

    if (opts.dock !== false) {
      this.appbar = new AppBar(this.win.getNativeWindowHandle());
      // another AppBar / the taskbar moved: Windows asks us to recompute our place
      this.win.hookWindowMessage(APPBAR_CALLBACK, (wParam) => {
        if (wParam.readUInt32LE(0) === ABN_POSCHANGED && !this.collapsed) this.dock();
      });
      screen.on("display-metrics-changed", () => (this.collapsed ? this.placeTab() : this.dock()));
      this.dock();
    }
    this.win.showInactive();
  }

  /** Reserve the strip and move the window into the rect Windows granted. */
  private dock() {
    if (!this.appbar) return;
    const d = screen.getPrimaryDisplay();
    const monitor = screen.dipToScreenRect(this.win, d.bounds);
    const heightPx = Math.round(TOPBAR_HEIGHT * d.scaleFactor);
    const rc = this.appbar.dock(
      { left: monitor.x, top: monitor.y, right: monitor.x + monitor.width, bottom: monitor.y + monitor.height },
      heightPx,
    );
    this.win.setBounds(screen.screenToDipRect(this.win, { x: rc.left, y: rc.top, width: rc.right - rc.left, height: rc.bottom - rc.top }));
  }

  private setCollapsed(v: boolean) {
    if (v === this.collapsed) return;
    this.collapsed = v;
    if (v) {
      this.appbar?.remove(); // Windows gives the strip back: maximized windows grow to the top again
      this.placeTab();
    } else if (this.appbar) {
      this.dock();
    } else {
      const b = screen.getPrimaryDisplay().bounds; // demo (no AppBar): just restore the full width
      this.win.setBounds({ x: b.x, y: b.y, width: b.width, height: TOPBAR_HEIGHT });
    }
    this.win.webContents.send("topbar:collapsed", v);
  }

  private placeTab() {
    const b = screen.getPrimaryDisplay().bounds;
    this.win.setBounds({ x: Math.round(b.x + (b.width - TAB.width) / 2), y: b.y, ...TAB });
  }

  update(status: TopbarStatus) {
    if (JSON.stringify(this.status) === JSON.stringify(status)) return;
    this.status = status;
    void this.ready.then(() => this.win.webContents.send("topbar:status", status));
  }

  capture() {
    return this.ready.then(() => this.win.webContents.capturePage());
  }

  /** Give the reserved space back. Must run before the app exits. */
  destroy() {
    this.appbar?.remove();
    this.appbar = null;
    if (!this.win.isDestroyed()) this.win.destroy();
  }
}
