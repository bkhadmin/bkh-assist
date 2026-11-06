/**
 * Minimal Win32 bindings (via koffi) used to inspect HOSxP windows.
 * Read-only: we only query windows, never send input or change anything.
 */
import koffi from "koffi";

const user32 = koffi.load("user32.dll");
const kernel32 = koffi.load("kernel32.dll");
const shell32 = koffi.load("shell32.dll");

export type Hwnd = unknown; // opaque koffi pointer

const POINT = koffi.struct("POINT", { x: "long", y: "long" });
const RECT = koffi.struct("RECT", { left: "long", top: "long", right: "long", bottom: "long" });
const EnumProc = koffi.proto("bool __stdcall EnumProc(void *hwnd, intptr_t lparam)");

const WindowFromPoint = user32.func("void * __stdcall WindowFromPoint(POINT pt)");
const GetForegroundWindow = user32.func("void * __stdcall GetForegroundWindow()");
const GetParent = user32.func("void * __stdcall GetParent(void *hwnd)");
const GetAncestor = user32.func("void * __stdcall GetAncestor(void *hwnd, uint32_t flags)");
const IsWindowVisible = user32.func("bool __stdcall IsWindowVisible(void *hwnd)");
const IsWindow = user32.func("bool __stdcall IsWindow(void *hwnd)");
const GetClassNameW = user32.func("int __stdcall GetClassNameW(void *hwnd, _Out_ uint8_t *buf, int max)");
const GetWindowRect = user32.func("bool __stdcall GetWindowRect(void *hwnd, _Out_ RECT *rect)");
const GetWindowThreadProcessId = user32.func("uint32_t __stdcall GetWindowThreadProcessId(void *hwnd, _Out_ uint32_t *pid)");
const EnumChildWindows = user32.func("bool __stdcall EnumChildWindows(void *parent, EnumProc *cb, intptr_t lparam)");
const EnumWindows = user32.func("bool __stdcall EnumWindows(EnumProc *cb, intptr_t lparam)");
const SendMessageTimeoutW = user32.func(
  "intptr_t __stdcall SendMessageTimeoutW(void *hwnd, uint32_t msg, uintptr_t wparam, void *lparam, uint32_t flags, uint32_t timeout, _Out_ uintptr_t *result)",
);
const OpenProcess = kernel32.func("void * __stdcall OpenProcess(uint32_t access, bool inherit, uint32_t pid)");
const CloseHandle = kernel32.func("bool __stdcall CloseHandle(void *h)");
const QueryFullProcessImageNameW = kernel32.func(
  "bool __stdcall QueryFullProcessImageNameW(void *h, uint32_t flags, _Out_ uint8_t *buf, _Inout_ uint32_t *size)",
);
const IsUserAnAdmin = shell32.func("bool __stdcall IsUserAnAdmin()");

const WM_GETTEXT = 0x000d;
const WM_GETTEXTLENGTH = 0x000e;
const SMTO_ABORTIFHUNG = 0x0002;
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const GA_ROOT = 2;

export type Rect = { left: number; top: number; right: number; bottom: number };

export const isNull = (h: Hwnd) => h == null || koffi.address(h) === 0n;
export const sameHwnd = (a: Hwnd, b: Hwnd) => !isNull(a) && !isNull(b) && koffi.address(a) === koffi.address(b);

export function windowFromPoint(x: number, y: number): Hwnd {
  return WindowFromPoint({ x, y });
}
export const foregroundWindow = (): Hwnd => GetForegroundWindow();
export const parentOf = (h: Hwnd): Hwnd => GetParent(h);
export const rootOf = (h: Hwnd): Hwnd => GetAncestor(h, GA_ROOT);
export const isVisible = (h: Hwnd): boolean => IsWindowVisible(h);
/** False once the window has been destroyed (e.g. the HOSxP screen was closed). */
export const isAlive = (h: Hwnd): boolean => !isNull(h) && IsWindow(h);
export const isElevated = (): boolean => IsUserAnAdmin();

export function className(h: Hwnd): string {
  const buf = Buffer.alloc(512);
  const n = GetClassNameW(h, buf, 256);
  return buf.toString("utf16le", 0, n * 2);
}

/** Window/control text via WM_GETTEXT with a short timeout, so a hung HOSxP never blocks us. */
export function windowText(h: Hwnd, maxChars = 300): string {
  const res = [0];
  if (!SendMessageTimeoutW(h, WM_GETTEXTLENGTH, 0, null, SMTO_ABORTIFHUNG, 200, res)) return "";
  const len = Math.min(Number(res[0]), maxChars);
  if (len <= 0) return "";
  const buf = Buffer.alloc((len + 1) * 2);
  if (!SendMessageTimeoutW(h, WM_GETTEXT, len + 1, buf, SMTO_ABORTIFHUNG, 200, res)) return "";
  return buf.toString("utf16le", 0, Number(res[0]) * 2);
}

export function rectOf(h: Hwnd): Rect {
  const r: Rect = { left: 0, top: 0, right: 0, bottom: 0 };
  GetWindowRect(h, r);
  return r;
}

export function children(parent: Hwnd): Hwnd[] {
  const list: Hwnd[] = [];
  EnumChildWindows(parent, (h: Hwnd) => (list.push(h), true), 0);
  return list;
}

/** Visible top-level windows of all processes. */
export function topWindows(): Hwnd[] {
  const list: Hwnd[] = [];
  EnumWindows((h: Hwnd) => (IsWindowVisible(h) && list.push(h), true), 0);
  return list;
}

export function processIdOf(h: Hwnd): number {
  const pid = [0];
  GetWindowThreadProcessId(h, pid);
  return pid[0];
}

const exeCache = new Map<number, string>();
/** Executable file name (e.g. "HOSxPXE4.exe") of a process; "" if it cannot be queried. */
export function processExe(pid: number): string {
  const cached = exeCache.get(pid);
  if (cached !== undefined) return cached;
  let name = "";
  const h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
  if (!isNull(h)) {
    const buf = Buffer.alloc(1040);
    const size = [520];
    if (QueryFullProcessImageNameW(h, 0, buf, size)) {
      name = buf.toString("utf16le", 0, size[0] * 2).split("\\").pop() ?? "";
    }
    CloseHandle(h);
  }
  if (exeCache.size > 500) exeCache.clear();
  exeCache.set(pid, name);
  return name;
}
