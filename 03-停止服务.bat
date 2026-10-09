@echo off
chcp 936 >nul
echo 正在停止矩效服务（结束占用 3001 / 8080 端口的进程）...
echo 注意：不会碰 3000 端口（那是 ZError，与矩效无关）。
echo.

set "KILLED=0"
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001 " ^| findstr "LISTENING"') do (
  taskkill /F /PID %%a >nul 2>nul
  if not errorlevel 1 set /a KILLED+=1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8080 " ^| findstr "LISTENING"') do (
  taskkill /F /PID %%a >nul 2>nul
  if not errorlevel 1 set /a KILLED+=1
)
REM 兜底：结束 concurrently 调度进程（不涉及中文路径，安全）
for /f "tokens=2 delims==" %%p in ('wmic process where "name='node.exe' and CommandLine like '%%concurrently%%'" get ProcessId /value ^| findstr ProcessId') do (
  taskkill /F /PID %%p >nul 2>nul
)

if %KILLED%==0 (
  echo 没有检测到正在运行的矩效服务。
) else (
  echo 已停止 %KILLED% 个服务进程。
)
echo.
pause