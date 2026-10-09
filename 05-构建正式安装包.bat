@echo off
setlocal
cd /d "%~dp0"

set "NODE_DIR=C:\nvm4w\nodejs"
if exist "%NODE_DIR%\node.exe" set "PATH=%NODE_DIR%;%PATH%"

echo ============================================================
echo   Matrix Windows Installer Builder
echo   This window will stay open if the build fails.
echo ============================================================
echo.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -NoExit -File "%~dp0scripts\build-desktop.ps1"
