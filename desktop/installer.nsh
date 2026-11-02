; Native process enumeration for BOTH installation and uninstallation.
; The stock per-user tasklist /FI USERNAME check can hang inside WMI. Never
; skip the safety check: refuse the update while Matrix is running, or if
; process enumeration fails. No automatic process termination or data deletion.
; nsProcess statuses: https://nsis.sourceforge.io/NsProcess_plugin
!include "LogicLib.nsh"

!macro matrixRequireStoppedProcessStatus
  ${If} $R0 == 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(appRunning)" /SD IDOK
    SetErrorLevel 32
    Quit
  ${ElseIf} $R0 != 603
    DetailPrint "Matrix process enumeration failed ($R0). Update cancelled."
    SetErrorLevel 33
    Quit
  ${EndIf}
!macroend

!macro customCheckAppRunning
  nsProcess::_FindProcess "${APP_EXECUTABLE_FILENAME}"
  Pop $R0
  !insertmacro matrixRequireStoppedProcessStatus
!macroend
