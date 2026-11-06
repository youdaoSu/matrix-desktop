; Native process enumeration for BOTH installation and uninstallation.
; The stock per-user tasklist /FI USERNAME check can hang inside WMI. Never
; skip the safety check: refuse the update while Matrix is running, or if
; process enumeration fails. No automatic process termination or data deletion.
; nsProcess statuses: https://nsis.sourceforge.io/NsProcess_plugin
!include "LogicLib.nsh"
!ifndef YUANXIAO_LEGACY_EXECUTABLE_FILENAME
  !define YUANXIAO_LEGACY_EXECUTABLE_FILENAME "矩效 Matrix.exe"
!endif

!macro matrixRequireStoppedProcessStatus
  ${If} $R0 == 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(appRunning)" /SD IDOK
    SetErrorLevel 32
    Quit
  ${ElseIf} $R0 != 603
    DetailPrint "YuanXiao process enumeration failed ($R0). Update cancelled."
    SetErrorLevel 33
    Quit
  ${EndIf}
!macroend

!macro customCheckAppRunning
  nsProcess::_FindProcess "${APP_EXECUTABLE_FILENAME}"
  Pop $R0
  !insertmacro matrixRequireStoppedProcessStatus
  nsProcess::_FindProcess "${YUANXIAO_LEGACY_EXECUTABLE_FILENAME}"
  Pop $R0
  !insertmacro matrixRequireStoppedProcessStatus
!macroend

!macro customInstall
  ; Only retire the obsolete binaries after the replacement exists.
  IfFileExists "$INSTDIR\远效.exe" 0 +3
  Delete "$INSTDIR\矩效 Matrix.exe"
  Delete "$INSTDIR\resources\edge-host\MatrixEdgeHost.exe"
!macroend
