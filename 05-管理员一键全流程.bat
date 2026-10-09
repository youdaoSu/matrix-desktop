@echo off
chcp 936 >nul
cd /d "%~dp0"

REM 申请管理员权限（添加 Defender 排除需要）
net session >nul 2>nul
if %errorlevel% neq 0 (
  echo 正在请求管理员权限，请在弹出的窗口点"是"...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

echo ============================================================
echo   矩效 Matrix - 管理员一键全流程
echo ============================================================
echo.
echo [1/2] 添加 Windows Defender 排除项（D 盘工程，加速安装）...
powershell -NoProfile -Command "Add-MpPreference -ExclusionPath 'D:\DoubaoWorkspace\矩效' -ErrorAction SilentlyContinue"
echo      [OK] 排除已就绪
echo.
echo [2/2] 启动标准初始化流程（01）...
echo.
call "01-一键初始化.bat"
goto :eof