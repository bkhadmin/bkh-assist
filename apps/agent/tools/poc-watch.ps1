<#
  poc-watch.ps1 — PoC: detect "บันทึก" in HOSxP XE and read the HN on that form.

  Listens (never blocks) to mouse clicks and F9 via low-level hooks for -Seconds.
  When the click lands on a TcxButton whose caption starts with "บันทึก" inside the HOSxP
  process, or F9 is pressed while HOSxP is in front, it finds the form that owns the button,
  locates the TcxLabel "HN" and reads the edit box on the same row to its right.
  Output per event: time, trigger, form class, HN.  Nothing else from the screen is printed.

  Usage: powershell -ExecutionPolicy Bypass -File poc-watch.ps1 -Seconds 120
#>
param([int]$Seconds = 120, [string]$ProcessPattern = 'hosxp')

Add-Type -ReferencedAssemblies System.Windows.Forms -TypeDefinition @'
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

public static class Hk {
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] public struct MSLL { public POINT pt; public uint data, flags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] public struct KBLL { public uint vk, scan, flags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  public delegate IntPtr HookProc(int code, IntPtr w, IntPtr l);
  public delegate bool EnumProc(IntPtr h, IntPtr l);

  [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id, HookProc p, IntPtr mod, uint tid);
  [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr h, int c, IntPtr w, IntPtr l);
  [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string n);
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern IntPtr GetFocus();
  [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h, uint f);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr p, EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern IntPtr SendMessageTimeout(IntPtr h, uint m, IntPtr w, StringBuilder l, uint f, uint t, out IntPtr r);
  [DllImport("user32.dll")] static extern IntPtr SendMessageTimeout(IntPtr h, uint m, IntPtr w, IntPtr l, uint f, uint t, out IntPtr r);

  // Hook callbacks only enqueue; all window inspection happens on the pump loop.
  public static ConcurrentQueue<string> Events = new ConcurrentQueue<string>();
  static IntPtr mouseHook, keyHook;
  static HookProc mouseProc = MouseCb, keyProc = KeyCb;   // keep delegates alive

  static IntPtr MouseCb(int c, IntPtr w, IntPtr l) {
    if (c >= 0 && (int)w == 0x0201) { // WM_LBUTTONDOWN: capture before the form can close
      var m = (MSLL)Marshal.PtrToStructure(l, typeof(MSLL));
      Events.Enqueue("click:" + m.pt.X + ":" + m.pt.Y);
    }
    return CallNextHookEx(mouseHook, c, w, l);
  }
  static IntPtr KeyCb(int c, IntPtr w, IntPtr l) {
    if (c >= 0 && ((int)w == 0x0100 || (int)w == 0x0104)) { // WM_KEYDOWN / WM_SYSKEYDOWN
      var k = (KBLL)Marshal.PtrToStructure(l, typeof(KBLL));
      if (k.vk == 0x78) Events.Enqueue("key:F9");
    }
    return CallNextHookEx(keyHook, c, w, l);
  }
  public static void Start() {
    IntPtr mod = GetModuleHandle(null);
    mouseHook = SetWindowsHookEx(14, mouseProc, mod, 0);
    keyHook = SetWindowsHookEx(13, keyProc, mod, 0);
    if (mouseHook == IntPtr.Zero || keyHook == IntPtr.Zero) throw new Exception("SetWindowsHookEx failed: " + Marshal.GetLastWin32Error());
  }
  public static void Stop() { UnhookWindowsHookEx(mouseHook); UnhookWindowsHookEx(keyHook); }

  public static string Cls(IntPtr h) { var s = new StringBuilder(256); GetClassName(h, s, 256); return s.ToString(); }
  public static string Text(IntPtr h) {
    IntPtr r; SendMessageTimeout(h, 0x0E, IntPtr.Zero, IntPtr.Zero, 2, 200, out r);
    int n = (int)r; if (n <= 0) return ""; if (n > 500) n = 500;
    var sb = new StringBuilder(n + 1); SendMessageTimeout(h, 0x0D, (IntPtr)(n + 1), sb, 2, 200, out r); return sb.ToString();
  }
  public static uint Pid(IntPtr h) { uint p; GetWindowThreadProcessId(h, out p); return p; }
  public static RECT Rect(IntPtr h) { RECT r; GetWindowRect(h, out r); return r; }
  public static List<IntPtr> Children(IntPtr p) { var l = new List<IntPtr>(); EnumChildWindows(p, (h, x) => { l.Add(h); return true; }, IntPtr.Zero); return l; }
  public static IntPtr At(int x, int y) { POINT p; p.X = x; p.Y = y; return WindowFromPoint(p); }

  // Nearest ancestor whose class ends with "Form" (the HOSxP screen that owns the control).
  public static IntPtr OwnerForm(IntPtr h) {
    for (IntPtr p = h; p != IntPtr.Zero; p = GetParent(p)) {
      string c = Cls(p);
      if (c.EndsWith("Form") && c != "TPlaceForm") return p;
    }
    return IntPtr.Zero;
  }

  // Label "HN" -> the edit on the same row, closest to its right.
  public static string ReadHn(IntPtr form) {
    var kids = Children(form);
    string best = null; int bestDx = int.MaxValue;
    foreach (var lab in kids) {
      if (!IsWindowVisible(lab) || !Cls(lab).Contains("Label") || Text(lab).Trim() != "HN") continue;
      var lr = Rect(lab);
      foreach (var e in kids) {
        string c = Cls(e);
        if (!IsWindowVisible(e) || !(c.Contains("TextEdit") || c.Contains("Edit")) || c.Contains("Inner")) continue;
        var er = Rect(e);
        int dx = er.L - lr.R;
        if (Math.Abs(er.T - lr.T) <= 8 && dx >= -4 && dx < 120 && dx < bestDx) {
          string t = Text(e).Trim();
          if (t.Length > 0) { best = t; bestDx = dx; }
        }
      }
    }
    return best;
  }
}
'@

$hosxp = @(Get-Process | Where-Object { $_.ProcessName -match $ProcessPattern } | ForEach-Object { [uint32]$_.Id })
if (-not $hosxp) { Write-Host "HOSxP is not running"; exit 1 }

[Hk]::Start()
Write-Host "Watching HOSxP for $Seconds s ... click 'บันทึก' or press F9 in HOSxP."
$end = (Get-Date).AddSeconds($Seconds)
try {
  while ((Get-Date) -lt $end) {
    [System.Windows.Forms.Application]::DoEvents()   # pump messages so LL hooks get called
    $ev = $null
    while ([Hk]::Events.TryDequeue([ref]$ev)) {
      $now = Get-Date -Format 'HH:mm:ss.fff'
      $target = [IntPtr]::Zero; $trigger = $null
      if ($ev -like 'click:*') {
        $p = $ev.Split(':'); $h = [Hk]::At([int]$p[1], [int]$p[2])
        $isHos = $hosxp -contains [Hk]::Pid($h); $hc = [Hk]::Cls($h)
        $cap = if ($hc -match 'Button') { [Hk]::Text($h) } else { '' }
        Write-Host ("{0}  click  hosxp={1}  class={2}  button='{3}'" -f $now, $isHos, $hc, $cap)
        if ($hosxp -contains [Hk]::Pid($h) -and [Hk]::Cls($h) -match 'Button' -and ([Hk]::Text($h)).StartsWith('บันทึก')) {
          $target = $h; $trigger = "click '$([Hk]::Text($h))'"
        }
      } elseif ($ev -eq 'key:F9') {
        $fg = [Hk]::GetForegroundWindow()
        Write-Host ("{0}  F9     hosxp-in-front={1}" -f $now, ($hosxp -contains [Hk]::Pid($fg)))
        if ($hosxp -contains [Hk]::Pid($fg)) {
          # F9 acts on the screen that has focus; GetFocus is per-thread, so locate via the save button instead
          foreach ($c in [Hk]::Children($fg)) {
            if ([Hk]::IsWindowVisible($c) -and [Hk]::Cls($c) -match 'Button' -and ([Hk]::Text($c)) -like 'บันทึก*F9*') { $target = $c; break }
          }
          # F9 on a confirm dialog ("ยืนยัน [F9]") has no save button in front: not a new save
          $trigger = if ($target -ne [IntPtr]::Zero) { 'F9' } else { $null }
        }
      }
      if ($trigger) {
        $form = if ($target -ne [IntPtr]::Zero) { [Hk]::OwnerForm($target) } else { [IntPtr]::Zero }
        $formCls = if ($form -ne [IntPtr]::Zero) { [Hk]::Cls($form) } else { '?' }
        $hn = if ($form -ne [IntPtr]::Zero) { [Hk]::ReadHn($form) } else { $null }
        Write-Host ("{0}  SAVE  trigger={1}  form={2}  hn={3}" -f $now, $trigger, $formCls, ($(if ($hn) { $hn } else { '(not found)' })))
      }
    }
    Start-Sleep -Milliseconds 15
  }
} finally { [Hk]::Stop(); Write-Host 'Stopped.' }
