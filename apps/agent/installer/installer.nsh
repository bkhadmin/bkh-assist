; bkh_assist agent — NSIS additions for electron-builder (UTF-8 with BOM: NSIS needs it for Thai text).
;
; Interactive:  a page asks for the server URL and agent key (empty = keep the current agent.json values).
; Silent:       bkh_assist-agent-Setup.exe /S /SERVER=http://10.0.0.5:3000 /KEY=xxxx
; Both values reach setup.ps1 through environment variables, so the key is never on a command line.

!include nsDialogs.nsh
!include LogicLib.nsh
!include FileFunc.nsh

; The uninstaller is compiled from this same file. NSIS warns about variables/functions it never uses, and
; electron-builder turns warnings into errors, so everything for the config page exists in the installer only.
!ifndef BUILD_UNINSTALLER
Var BkhServer
Var BkhKey
Var BkhServerField
Var BkhKeyField
!endif

!macro customInit
  !ifndef BUILD_UNINSTALLER
    ${GetParameters} $R0
    ClearErrors
    ${GetOptions} $R0 "/SERVER=" $BkhServer
    ClearErrors
    ${GetOptions} $R0 "/KEY=" $BkhKey
    ClearErrors
  !endif
!macroend

!macro customWelcomePage
  Page custom BkhConfigPage BkhConfigLeave
!macroend

!ifndef BUILD_UNINSTALLER
Function BkhConfigPage
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 28u "ตั้งค่าการเชื่อมต่อกับ server ของ bkh_assist$\r$\nถ้าเว้นว่าง จะใช้ค่าเดิมที่เคยตั้งไว้ในเครื่องนี้"
  Pop $0
  ${NSD_CreateLabel} 0 36u 100% 10u "URL ของ server  เช่น  http://10.0.0.5:3000"
  Pop $0
  ${NSD_CreateText} 0 48u 100% 13u $BkhServer
  Pop $BkhServerField
  ${NSD_CreateLabel} 0 70u 100% 10u "Agent key  (ค่าเดียวกับ AGENT_ENROLL_KEY ใน .env ของ server)"
  Pop $0
  ${NSD_CreatePassword} 0 82u 100% 13u $BkhKey
  Pop $BkhKeyField
  nsDialogs::Show
FunctionEnd

Function BkhConfigLeave
  ${NSD_GetText} $BkhServerField $BkhServer
  ${NSD_GetText} $BkhKeyField $BkhKey
FunctionEnd
!endif

!macro customInstall
  System::Call 'Kernel32::SetEnvironmentVariable(t "BKH_SETUP_SERVER", t "$BkhServer")'
  System::Call 'Kernel32::SetEnvironmentVariable(t "BKH_SETUP_KEY", t "$BkhKey")'
  nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\setup.ps1" -AppExe "$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
  Pop $0
  System::Call 'Kernel32::SetEnvironmentVariable(t "BKH_SETUP_KEY", t "")'
  ${If} $0 != 0
    MessageBox MB_ICONEXCLAMATION|MB_OK "ตั้งค่า bkh_assist ไม่สำเร็จ (รหัส $0)$\r$\nติดตั้งโปรแกรมแล้ว แต่ต้องรัน resources\setup.ps1 ด้วยสิทธิ์ Administrator อีกครั้ง" /SD IDOK
  ${EndIf}
  ; Start now for the user running the setup (inherits the installer's elevation). A silent install is often
  ; pushed as SYSTEM with nobody to show a tray icon to: there the logon task starts the agent next time.
  ${IfNot} ${Silent}
    Exec '"$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
  ${EndIf}
!macroend

!macro customUnInstall
  nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\setup.ps1" -Uninstall'
  Pop $0
!macroend
