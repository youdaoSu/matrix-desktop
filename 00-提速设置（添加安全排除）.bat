@echo off
chcp 936 >nul
cd /d "%~dp0"

REM ===== 自动请求管理员权限 =====
net session >nul 2>nul
if %errorlevel% neq 0 (
  echo 正在请求管理员权限（请在弹出的窗口点"是"）...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

echo 正在为矩效文件夹（D 盘）添加 Windows Defender 排除项...
powershell -NoProfile -Command "Add-MpPreference -ExclusionPath 'D:\DoubaoWorkspace\矩效' -ErrorAction SilentlyContinue"
if %errorlevel% equ 0 (
  echo.
  echo [OK] 已添加排除！现在删除/安装依赖会快很多。
) else (
  echo [失败] 未能添加，请手动在 Windows 安全中心添加。
)
echo.
pause