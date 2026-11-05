<#
  install-task.ps1 — start the bkh_assist agent elevated at every logon, without a UAC prompt.

  HOSxP XE runs elevated, and Windows only delivers its mouse/keyboard events to hooks in a
  process with the same or higher integrity, so the agent must be elevated too. A scheduled
  task with "Run with highest privileges" does that silently. Run this script once as admin.

    powershell -ExecutionPolicy Bypass -File install-task.ps1             # install for the current user
    powershell -ExecutionPolicy Bypass -File install-task.ps1 -Uninstall

  -ElectronExe / -AppDir default to this dev checkout; point them at the packaged agent later.
#>
param(
  [string]$ElectronExe = (Resolve-Path "$PSScriptRoot\..\..\..\node_modules\electron\dist\electron.exe").Path,
  [string]$AppDir = (Resolve-Path "$PSScriptRoot\..").Path,
  [string]$TaskName = 'bkh_assist agent',
  [switch]$Uninstall
)

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { throw 'Run this script from an elevated PowerShell (Run as administrator).' }

if ($Uninstall) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Removed task '$TaskName'."
  return
}

$user = "$env:USERDOMAIN\$env:USERNAME"
$action = New-ScheduledTaskAction -Execute $ElectronExe -Argument "`"$AppDir`"" -WorkingDirectory $AppDir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Write-Host "Installed task '$TaskName' for $user (runs elevated at logon)."
Write-Host "Start now with:  Start-ScheduledTask -TaskName '$TaskName'"
