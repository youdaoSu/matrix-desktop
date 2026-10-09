@echo off
chcp 65001 >nul
cd /d "%~dp0"

set "NODE_DIR=C:\nvm4w\nodejs"
if exist "%NODE_DIR%\node.exe" set "PATH=%NODE_DIR%;%PATH%"

echo 请先确认 02-一键启动.bat 已经运行。
echo 正在启动矩效桌面连接器...
call npm run desktop
pause
