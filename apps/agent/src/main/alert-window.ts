/**
 * The floating alert. Frameless, transparent, always on top and NON-activating:
 * it never steals focus from HOSxP, so the user can keep typing.
 */
import { BrowserWindow, ipcMain, screen, type Rectangle } from "electron";
import { join } from "node:path";
import type { AlertCommand, AlertState } from "../shared/alert-state";

const MARGIN = 6; // from the work-area edge (the window itself already has shadow padding)

export class AlertWindow {
  private win: BrowserWindow;
  private ready: Promise<void>;
  private anchor: Rectangle | null = null;

  /** offscreen: render without a real window (used by --demo --shot-dir to capture PNGs). */
  constructor(opts: { offscreen?: boolean } = {}) {
    this.win = new BrowserWindow({
      width: 400,
      height: 200,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      focusable: false,
      hasShadow: false,
      alwaysOnTop: true,
      webPreferences: {
        preload: join(__dirname, "alert-preload.js"),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        offscreen: opts.offscreen ?? false,
        // the window is hidden most of the time; it must still react to new states
        backgroundThrottling: false,
      },
    });
    this.win.setAlwaysOnTop(true, "screen-saver");
    this.win.setMenu(null);
    this.ready = this.win.loadFile(join(__dirname, "renderer", "alert.html"));

    ipcMain.on("alert:cmd", (e, cmd: AlertCommand) => {
      if (e.sender !== this.win.webContents) return;
      if (cmd.type === "dismiss") this.win.hide();
      if (cmd.type === "resize") this.place(cmd.width, cmd.height);
    });
  }

  /** anchor = bounds of the HOSxP window, so the alert shows on the same monitor. */
  async show(state: AlertState, opts: { anchor?: Rectangle; collapsed?: boolean } = {}) {
    if (opts.anchor) this.anchor = opts.anchor;
    await this.ready;
    this.win.webContents.send("alert:state", { state, collapsed: opts.collapsed ?? false });
    // the renderer answers with "resize", which positions and shows the window
  }

  hide() {
    this.win.hide();
  }

  isVisible() {
    return this.win.isVisible();
  }

  capture() {
    return this.win.webContents.capturePage();
  }

  private place(width: number, height: number) {
    const display = this.anchor
      ? screen.getDisplayMatching(this.anchor)
      : screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const wa = display.workArea;
    this.win.setBounds({
      width,
      height,
      x: wa.x + wa.width - width - MARGIN,
      y: wa.y + wa.height - height - MARGIN,
    });
    if (!this.win.isVisible()) this.win.showInactive();
  }
}
