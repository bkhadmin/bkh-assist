<#
  inspect-hosxp.ps1 — read-only explorer for HOSxP XE windows (PoC for bkh_assist agent).

  Lists HOSxP top-level windows and dumps their child-control tree (class, text, rect, handle)
  so we can learn which form is open, where the "บันทึก" button is and which control shows HN.
  It never clicks, types or changes anything.

  Privacy: button captions are shown in full (we need "บันทึก"). Every other text is masked:
  letters -> "x" (labels keep ASCII), digit runs of 10-11 (phone) or 13+ (CID) -> "#",
  runs of <= 9 (HN) or exactly 12 (VN) kept.
  Pass -Raw to disable masking (only for your own eyes; do not share the output).

  Usage:
    powershell -ExecutionPolicy Bypass -File inspect-hosxp.ps1                 # list HOSxP windows
    powershell -ExecutionPolicy Bypass -File inspect-hosxp.ps1 -Foreground -Delay 5
        # switch to HOSxP within 5 s; dumps the window that is in front
    powershell -ExecutionPolicy Bypass -File inspect-hosxp.ps1 -Handle 0x00123456
#>
param(
  [switch]$Foreground,
  [int]$Delay = 0,
  [string]$Handle,
  [string]$ProcessPattern = 'hosxp',
  [switch]$Raw,
  [string]$Out
)

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class W32 {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr p, EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h, uint flags);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr SendMessageTimeout(IntPtr h, uint msg, IntPtr w, StringBuilder l, uint flags, uint timeout, out IntPtr res);
  [DllImport("user32.dll")] public static extern IntPtr SendMessageTimeout(IntPtr h, uint msg, IntPtr w, IntPtr l, uint flags, uint timeout, out IntPtr res);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);

  public static string Cls(IntPtr h) { var s = new StringBuilder(256); GetClassName(h, s, 256); return s.ToString(); }
  public static string Text(IntPtr h) {
    IntPtr res; const uint WM_GETTEXTLENGTH = 0x0E, WM_GETTEXT = 0x0D, SMTO_ABORTIFHUNG = 2;
    SendMessageTimeout(h, WM_GETTEXTLENGTH, IntPtr.Zero, IntPtr.Zero, SMTO_ABORTIFHUNG, 200, out res);
    int n = (int)res; if (n <= 0) return "";
    if (n > 2000) n = 2000;
    var sb = new StringBuilder(n + 1);
    SendMessageTimeout(h, WM_GETTEXT, (IntPtr)(n + 1), sb, SMTO_ABORTIFHUNG, 200, out res);
    return sb.ToString();
  }
  public static List<IntPtr> Tops() { var l = new List<IntPtr>(); EnumWindows((h, p) => { l.Add(h); return true; }, IntPtr.Zero); return l; }
  public static List<IntPtr> Children(IntPtr parent) { var l = new List<IntPtr>(); EnumChildWindows(parent, (h, p) => { l.Add(h); return true; }, IntPtr.Zero); return l; }
}
'@

function Mask([string]$s, [string]$cls) {
  if ($Raw -or [string]::IsNullOrEmpty($s)) { return $s }
  if ($cls -match 'Button') { return $s }
  # keep digit runs that look like HN (<= 9) or VN (exactly 12); hide phone (10-11) and CID (13+)
  $s = [regex]::Replace($s, '\d+', { param($m) $n = $m.Value.Length; if ($n -le 9 -or $n -eq 12) { $m.Value } else { '#' * $n } })
  # labels may keep ASCII letters (field captions like "HN", "VN"); Thai text (names) is always masked
  if ($cls -match 'Label') { return [regex]::Replace($s, '[^\x00-\x7F]', 'x') }
  return [regex]::Replace($s, '[\p{L}\p{M}]', 'x')
}

function Describe([IntPtr]$h) {
  $r = New-Object W32+RECT; [void][W32]::GetWindowRect($h, [ref]$r)
  $procId = 0; [void][W32]::GetWindowThreadProcessId($h, [ref]$procId)
  [pscustomobject]@{
    Handle  = ('0x{0:X8}' -f $h.ToInt64())
    Class   = [W32]::Cls($h)
    Text    = Mask ([W32]::Text($h)) ([W32]::Cls($h))
    Visible = [W32]::IsWindowVisible($h)
    Rect    = "$($r.L),$($r.T) $($r.R - $r.L)x$($r.B - $r.T)"
    Pid     = $procId
  }
}

function Depth([IntPtr]$h, [IntPtr]$root) {
  $d = 0; $p = $h
  while ($p -ne [IntPtr]::Zero -and $p -ne $root -and $d -lt 50) { $p = [W32]::GetParent($p); $d++ }
  return $d
}

function Dump([IntPtr]$root) {
  $lines = New-Object System.Collections.Generic.List[string]
  $top = Describe $root
  $proc = Get-Process -Id $top.Pid -ErrorAction SilentlyContinue
  $lines.Add("WINDOW $($top.Handle) class=$($top.Class) text='$($top.Text)' rect=$($top.Rect) process=$($proc.ProcessName)")
  foreach ($c in [W32]::Children($root)) {
    if (-not [W32]::IsWindowVisible($c)) { continue }
    $d = Describe $c
    $indent = '  ' * (Depth $c $root)
    $lines.Add("$indent$($d.Class) [$($d.Handle)] '$($d.Text)' @ $($d.Rect)")
  }
  return $lines
}

$hosxpPids = @(Get-Process | Where-Object { $_.ProcessName -match $ProcessPattern } | ForEach-Object { $_.Id })

if ($Delay -gt 0) { Write-Host "Switch to HOSxP now... ($Delay s)"; Start-Sleep -Seconds $Delay }

if ($Handle) {
  $result = Dump ([IntPtr][Convert]::ToInt64($Handle, 16))
} elseif ($Foreground) {
  $fg = [W32]::GetAncestor([W32]::GetForegroundWindow(), 2)  # GA_ROOT
  $result = Dump $fg
} else {
  if (-not $hosxpPids) { Write-Host "No process matching '$ProcessPattern'. Running processes with windows:"; Get-Process | Where-Object MainWindowTitle | Select-Object ProcessName, Id | Format-Table -AutoSize; exit 1 }
  $result = foreach ($h in [W32]::Tops()) {
    $procId = 0; [void][W32]::GetWindowThreadProcessId($h, [ref]$procId)
    if ($hosxpPids -contains $procId -and [W32]::IsWindowVisible($h)) {
      $d = Describe $h; "$($d.Handle)  class=$($d.Class)  text='$($d.Text)'  rect=$($d.Rect)  children=$([W32]::Children($h).Count)"
    }
  }
  $result = @("HOSxP processes: " + ((Get-Process -Id $hosxpPids | ForEach-Object { "$($_.ProcessName)($($_.Id))" }) -join ', ')) + $result
}

if ($Out) { $result | Out-File -FilePath $Out -Encoding utf8; Write-Host "Saved $($result.Count) lines to $Out" } else { $result }
