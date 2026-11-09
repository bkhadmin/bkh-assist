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
const advapi32 = koffi.load("advapi32.dll");
const OpenProcessToken = advapi32.func("bool __stdcall OpenProcessToken(void *process, uint32_t access, _Out_ void **token)");
const GetTokenInformation = advapi32.func(
  "bool __stdcall GetTokenInformation(void *token, int infoClass, _Out_ uint32_t *info, uint32_t length, _Out_ uint32_t *returned)",
);
const TOKEN_QUERY = 0x0008;
const TokenElevation = 20;

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

/** Does process `pid` run elevated ("Run as administrator")? null when it cannot be asked. */
export function isProcessElevated(pid: number): boolean | null {
  const p = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
  if (isNull(p)) return null;
  try {
    const token = [null];
    if (!OpenProcessToken(p, TOKEN_QUERY, token)) return null;
    try {
      const info = [0], ret = [0];
      return GetTokenInformation(token[0], TokenElevation, info, 4, ret) ? info[0] !== 0 : null;
    } finally {
      CloseHandle(token[0]);
    }
  } finally {
    CloseHandle(p);
  }
}

export function className(h: Hwnd): string {
  const buf = Buffer.alloc(512);
  const n = GetClassNameW(h, buf, 256);
  return buf.toString("utf16le", 0, n * 2);
}

/** Window/control text via WM_GETTEXT with a short timeout, so a hung HOSxP never blocks us; null when it did not answer. */
export function windowTextOrNull(h: Hwnd, maxChars = 300): string | null {
  const res = [0];
  if (!SendMessageTimeoutW(h, WM_GETTEXTLENGTH, 0, null, SMTO_ABORTIFHUNG, 200, res)) return null;
  const len = Math.min(Number(res[0]), maxChars);
  if (len <= 0) return "";
  const buf = Buffer.alloc((len + 1) * 2);
  if (!SendMessageTimeoutW(h, WM_GETTEXT, len + 1, buf, SMTO_ABORTIFHUNG, 200, res)) return null;
  return buf.toString("utf16le", 0, Number(res[0]) * 2);
}
export const windowText = (h: Hwnd, maxChars = 300): string => windowTextOrNull(h, maxChars) ?? "";

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

// --- Checkbox state from pixels (ported from TopStickly electron/hosxp.js isChecked) ---
// DevExpress checkboxes answer 0 to BM_GETCHECK and expose no CHECKED state, so we read how the control paints
// itself: PrintWindow into a 32-bit DIB (works even when HOSxP is covered), then classifyCheckGlyph.
const gdi32 = koffi.load("gdi32.dll");
koffi.struct("BITMAPINFOHEADER", {
  biSize: "uint32", biWidth: "int32", biHeight: "int32", biPlanes: "uint16", biBitCount: "uint16", biCompression: "uint32",
  biSizeImage: "uint32", biXPelsPerMeter: "int32", biYPelsPerMeter: "int32", biClrUsed: "uint32", biClrImportant: "uint32",
});
const PrintWindow = user32.func("bool __stdcall PrintWindow(void *hwnd, void *hdc, uint32_t flags)");
const GetDC = user32.func("void * __stdcall GetDC(void *hwnd)");
const ReleaseDC = user32.func("int __stdcall ReleaseDC(void *hwnd, void *hdc)");
const CreateCompatibleDC = gdi32.func("void * __stdcall CreateCompatibleDC(void *hdc)");
const CreateCompatibleBitmap = gdi32.func("void * __stdcall CreateCompatibleBitmap(void *hdc, int w, int h)");
const SelectObject = gdi32.func("void * __stdcall SelectObject(void *hdc, void *obj)");
const DeleteObject = gdi32.func("bool __stdcall DeleteObject(void *obj)");
const DeleteDC = gdi32.func("bool __stdcall DeleteDC(void *hdc)");
const GetDIBits = gdi32.func(
  "int __stdcall GetDIBits(void *hdc, void *bmp, uint32_t start, uint32_t lines, _Out_ uint8_t *bits, BITMAPINFOHEADER *bi, uint32_t usage)",
);
const WM_NULL = 0x0000;

/**
 * Ticked state of a checkbox from a top-down 32-bit BGRA capture of the whole control (glyph left, caption right).
 * true = ticked, false = empty, null = can't tell (nothing painted, no glyph box found).
 * Glyph box = bounding box of the strokes clearly darker (median - 40) than the glyph column's median luminance;
 * inside it (30% in from each side, clear of the border) an empty box is flat even when tinted on hover/press,
 * a check mark gives a spread > 60.
 */
export function classifyCheckGlyph(bits: Uint8Array, width: number, height: number): boolean | null {
  const gw = Math.min(width, Math.round(height * 0.6)); // the glyph column only, not the caption
  const lum = (x: number, y: number) => {
    const o = (y * width + x) * 4, b = bits[o], g = bits[o + 1], r = bits[o + 2];
    return b || g || r ? 0.114 * b + 0.587 * g + 0.299 * r : null; // pure black = unpainted
  };
  const all: number[] = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < gw; x++) {
      const l = lum(x, y);
      if (l !== null) all.push(l);
    }
  if (!all.length) return null;
  const median = all.sort((a, b) => a - b)[all.length >> 1];

  let x0 = gw, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < gw; x++) {
      const l = lum(x, y);
      if (l !== null && l < median - 40) (x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x)), (y1 = Math.max(y1, y));
    }
  if (x1 - x0 < 6 || y1 - y0 < 6) return null;

  const ix = Math.ceil((x1 - x0) * 0.3), iy = Math.ceil((y1 - y0) * 0.3);
  let lo = 255, hi = 0;
  for (let y = y0 + iy; y <= y1 - iy; y++)
    for (let x = x0 + ix; x <= x1 - ix; x++) {
      const l = lum(x, y);
      if (l !== null) (lo = Math.min(lo, l)), (hi = Math.max(hi, l));
    }
  return hi - lo > 60;
}

/** Ticked state of a (DevExpress) checkbox window from its pixels; null = can't tell (HOSxP hung, nothing painted). */
export function isCheckedByPixels(h: Hwnd): boolean | null {
  // PrintWindow has no timeout: ping first so a hung HOSxP never blocks our main thread
  if (!SendMessageTimeoutW(h, WM_NULL, 0, null, SMTO_ABORTIFHUNG, 200, [0])) return null;
  const r = rectOf(h), width = r.right - r.left, height = r.bottom - r.top;
  if (width <= 0 || height <= 0 || width * height > 4_000_000) return null;
  const screen = GetDC(null), mem = CreateCompatibleDC(screen), bmp = CreateCompatibleBitmap(screen, width, height);
  const old = SelectObject(mem, bmp);
  const ok = PrintWindow(h, mem, 0);
  SelectObject(mem, old);
  const bits = Buffer.alloc(width * height * 4);
  const header = {
    biSize: 40, biWidth: width, biHeight: -height /* top-down rows */, biPlanes: 1, biBitCount: 32, biCompression: 0,
    biSizeImage: 0, biXPelsPerMeter: 0, biYPelsPerMeter: 0, biClrUsed: 0, biClrImportant: 0,
  };
  const lines = GetDIBits(mem, bmp, 0, height, bits, header, 0);
  DeleteObject(bmp);
  DeleteDC(mem);
  ReleaseDC(null, screen);
  return ok && lines ? classifyCheckGlyph(bits, width, height) : null;
}
