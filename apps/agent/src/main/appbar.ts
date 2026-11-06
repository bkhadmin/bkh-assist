/**
 * Register a window as a Windows "application desktop toolbar" (AppBar) docked to the top edge,
 * like the taskbar: Windows shrinks the work area, so maximized windows (HOSxP) sit below it.
 * https://learn.microsoft.com/windows/win32/shell/application-desktop-toolbars
 *
 * Must be removed on exit (ABM_REMOVE), otherwise the reserved strip stays until Explorer restarts.
 * SHAppBarMessage works in physical pixels; Electron in DIPs, so the caller converts.
 */
import koffi from "koffi";

const shell32 = koffi.load("shell32.dll");
const RECT = koffi.struct("AB_RECT", { left: "long", top: "long", right: "long", bottom: "long" });
const APPBARDATA = koffi.struct("APPBARDATA", {
  cbSize: "uint32_t",
  hWnd: "void *",
  uCallbackMessage: "uint32_t",
  uEdge: "uint32_t",
  rc: RECT,
  lParam: "intptr_t",
});
const SHAppBarMessage = shell32.func("uintptr_t __stdcall SHAppBarMessage(uint32_t msg, _Inout_ APPBARDATA *data)");

const ABM_NEW = 0;
const ABM_REMOVE = 1;
const ABM_QUERYPOS = 2;
const ABM_SETPOS = 3;
const ABE_TOP = 1;
/** WM_APP + 1: Windows sends ABN_* notifications to the window with this message id. */
export const APPBAR_CALLBACK = 0x8001;
export const ABN_POSCHANGED = 1;

export type PxRect = { left: number; top: number; right: number; bottom: number };

export class AppBar {
  private registered = false;
  private readonly hwnd: unknown;

  /** @param handle BrowserWindow.getNativeWindowHandle() */
  constructor(handle: Buffer) {
    this.hwnd = koffi.decode(handle, "void *");
  }

  private data(rc: PxRect = { left: 0, top: 0, right: 0, bottom: 0 }) {
    return { cbSize: koffi.sizeof(APPBARDATA), hWnd: this.hwnd, uCallbackMessage: APPBAR_CALLBACK, uEdge: ABE_TOP, rc, lParam: 0 };
  }

  /**
   * Reserve `heightPx` at the top of the monitor whose bounds are `monitorPx`.
   * Returns the rect Windows granted (it may move us below another top AppBar).
   */
  dock(monitorPx: PxRect, heightPx: number): PxRect {
    if (!this.registered) {
      if (!SHAppBarMessage(ABM_NEW, this.data())) throw new Error("SHAppBarMessage(ABM_NEW) failed");
      this.registered = true;
    }
    const d = this.data({ ...monitorPx, bottom: monitorPx.top + heightPx });
    SHAppBarMessage(ABM_QUERYPOS, d); // Windows moves rc out of the way of the taskbar / other AppBars
    d.rc.bottom = d.rc.top + heightPx;
    SHAppBarMessage(ABM_SETPOS, d);
    return { ...d.rc };
  }

  remove() {
    if (!this.registered) return;
    SHAppBarMessage(ABM_REMOVE, this.data());
    this.registered = false;
  }
}
