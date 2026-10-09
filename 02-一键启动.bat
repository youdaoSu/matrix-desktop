@echo off
chcp 936 >nul
cd /d "%~dp0"

set "NODE_DIR=C:\nvm4w\nodejs"
if exist "%NODE_DIR%\node.exe" set "PATH=%NODE_DIR%;%PATH%"

if not exist ".env.local" (
  echo [错误] 未找到 .env.local，请先运行 01-一键初始化.bat
  pause
  exit /b 1
)

REM ===== 检测是否已有服务在运行（防止重复双击导致端口占用）=====
netstat -ano | findstr ":8080 " | findstr LISTENING >nul 2>&1
if not errorlevel 1 (
  echo [提示] 检测到矩效服务已在运行，正在为你打开浏览器...
  timeout /t 1 /nobreak >nul
  start "" http://localhost:8080/
  echo.
  echo 如需重启，请先运行 03-停止服务.bat 再启动本程序。
  pause
  exit /b 0
)

REM ===== 启动参数 =====
set NODE_ENV=development
set MIAODA_APP_TYPE=3
set MIAODA_LOCAL_DEV=1
set SERVER_PORT=3001
set FORCE_AUTHN_INNERAPI_DOMAIN=http://localhost:3001

echo ============================================================
echo   矩效 Matrix 启动中...
echo.
echo   请等待下方出现 "ready in" 字样，然后用浏览器访问：
echo.
echo        http://localhost:8080/
echo.
echo   约 20 秒后将自动打开浏览器。
echo   停止服务：直接关闭本窗口，或运行 03-停止服务.bat
echo ============================================================
echo.

REM ===== 延迟 20 秒后自动打开浏览器（仅首次）=====
start "" /b cmd /c "timeout /t 20 /nobreak >nul && start """" http://localhost:8080/"

REM 不用 -k，避免一个子进程退出时把另一个也带走
call npx concurrently -n 后端,前端 -c blue,green "npm run dev:server" "npm run dev:client"
echo.
echo 服务已退出。
pause