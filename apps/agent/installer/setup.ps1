<#
  setup.ps1 — run by the bkh_assist agent installer (elevated). Also usable by hand for repair.

  Install:   setup.ps1 -AppExe "C:\Program Files\bkh_assist agent\bkh-assist-agent.exe"
             Server URL / agent key come from env BKH_SETUP_SERVER / BKH_SETUP_KEY (set by the installer,
             so the key never appears on a command line). Empty = keep the value already in agent.json.
  Uninstall: setup.ps1 -Uninstall

  1. Writes %ProgramData%\bkh_assist\agent.json (merged with an existing file, UTF-8 without BOM).
  2. Registers the logon task "bkh_assist agent" for every user (BUILTIN\Users) with "Run with highest
     privileges": HOSxP XE runs elevated, and Windows only delivers its mouse/keyboard events to hooks of a
     process with the same integrity. Admin users get an elevated agent without a UAC prompt; standard users
     get a normal one (their HOSxP cannot be elevated either).
#>
param([string]$AppExe, [switch]$Uninstall)
$ErrorActionPreference = 'Stop'
$TaskName = 'bkh_assist agent'
$dir = Join-Path $env:ProgramData 'bkh_assist'
$cfgPath = Join-Path $dir 'agent.json'

if ($Uninstall) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Get-Process 'bkh-assist-agent' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  # agent.json is kept on purpose: reinstalling or upgrading keeps the server URL and key.
  Write-Output 'bkh_assist: task removed'
  exit 0
}
if (-not $AppExe -or -not (Test-Path $AppExe)) { throw "AppExe not found: $AppExe" }

# --- 1. config -----------------------------------------------------------------
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$cfg = [ordered]@{}
if (Test-Path $cfgPath) {
  try {
    (Get-Content -Raw -Encoding UTF8 $cfgPath | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $cfg[$_.Name] = $_.Value }
  } catch { Write-Output "bkh_assist: existing agent.json unreadable, rewriting ($($_.Exception.Message))" }
}
if ($env:BKH_SETUP_SERVER) { $cfg['serverUrl'] = $env:BKH_SETUP_SERVER.Trim().TrimEnd('/') }
if ($env:BKH_SETUP_KEY) { $cfg['agentKey'] = $env:BKH_SETUP_KEY.Trim() }
if (-not $cfg.Contains('serverUrl')) { $cfg['serverUrl'] = 'http://localhost:3000' }
if (-not $cfg.Contains('agentKey')) { $cfg['agentKey'] = '' }
# Fallback module, used only until the server has answered once (the admin page decides afterwards).
if (-not $cfg.Contains('module')) { $cfg['module'] = 'OPDVisitcheck' }
if (-not $cfg.Contains('moduleLabel')) { $cfg['moduleLabel'] = 'ซักประวัติ OPD' }
[IO.File]::WriteAllText($cfgPath, ($cfg | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))
Write-Output "bkh_assist: config written ($cfgPath), server=$($cfg['serverUrl']), key=$(if ($cfg['agentKey']) { 'set' } else { 'EMPTY' })"

# --- 2. logon task ---------------------------------------------------------------
$action = New-ScheduledTaskAction -Execute $AppExe -WorkingDirectory (Split-Path $AppExe)
$trigger = New-ScheduledTaskTrigger -AtLogOn                                   # any user
$principal = New-ScheduledTaskPrincipal -GroupId 'S-1-5-32-545' -RunLevel Highest   # BUILTIN\Users
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances Parallel -StartWhenAvailable
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal `
  -Settings $settings -Description 'bkh_assist: ตรวจความครบถ้วนของการบันทึกใน HOSxP' -Force | Out-Null
Write-Output "bkh_assist: logon task '$TaskName' registered"
