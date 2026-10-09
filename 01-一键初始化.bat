@echo off
chcp 936 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ============================================================
echo            矩效 Matrix  -  本地环境一键初始化
echo ============================================================
echo.
echo  本脚本将自动完成：
echo    1. 检查 Node.js 环境
echo    2. 创建数据库 / 数据类型 / 权限角色（已存在则跳过）
echo    3. 写入配置文件 .env.local
echo    4. 安装依赖（已安装会自动跳过，不会重复下载）
echo    5. 创建全部数据表
echo    6. 写入初始账号与套餐
echo.
echo  前置：已安装并启动 PostgreSQL（端口5432）。
echo  重要：请先关闭其他初始化/启动窗口，避免重复执行。
echo.
pause

REM ===== 1. 检查 Node =====
set "NODE_DIR=C:\nvm4w\nodejs"
if exist "%NODE_DIR%\node.exe" set "PATH=%NODE_DIR%;%PATH%"
where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Node.js，请先安装 Node.js 22 以上版本。
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do echo [1/6] Node 版本：%%v

REM ===== 2. 数据库 / 类型 / 角色 =====
echo.
set /p "PG_PWD=请输入 PostgreSQL 超级用户 postgres 的密码："
if "!PG_PWD!"=="" (
  echo [错误] 密码不能为空。
  pause
  exit /b 1
)
echo [2/6] 正在创建数据库、数据类型、权限角色（已存在自动跳过）...
set "PG_SUPER_PASSWORD=!PG_PWD!"
call node scripts/setup-db.mjs
if errorlevel 1 (
  echo [错误] 数据库初始化失败，请检查密码与 PostgreSQL 服务。
  pause
  exit /b 1
)

REM ===== 3. .env.local =====
echo [3/6] 正在写入配置文件 .env.local...
set "ENV_FILE=.env.local"
> "%ENV_FILE%" echo NODE_ENV=development
>> "%ENV_FILE%" echo MIAODA_APP_TYPE=3
>> "%ENV_FILE%" echo MIAODA_LOCAL_DEV=1
>> "%ENV_FILE%" echo SERVER_HOST=localhost
>> "%ENV_FILE%" echo SERVER_PORT=3001
>> "%ENV_FILE%" echo CLIENT_DEV_PORT=8080
>> "%ENV_FILE%" echo SUDA_DATABASE_URL=postgres://postgres:!PG_PWD!@localhost:5432/matrix_db
>> "%ENV_FILE%" echo JWT_SECRET=matrix-local-secret-change-me
>> "%ENV_FILE%" echo MIAODA_CACHE_URL=
>> "%ENV_FILE%" echo FORCE_AUTHN_INNERAPI_DOMAIN=http://localhost:3001
echo [OK] .env.local 已写入

REM ===== 4. 依赖（已安装则跳过，不重复下载）=====
if exist "node_modules\.bin\concurrently.cmd" (
  echo [4/6] 检测到依赖已安装，跳过（如需重装请手动删除 node_modules 后再运行）。
) else (
  echo [4/6] 正在安装依赖，首次约需 1-3 分钟（SSD）...
  call npm install --no-audit --no-fund --ignore-scripts
  if errorlevel 1 (
    echo [错误] 依赖安装失败，请检查网络后重新运行。
    pause
    exit /b 1
  )
)

REM ===== 5. 建表 =====
echo [5/6] 正在创建/同步全部数据表...
call npx drizzle-kit push
if errorlevel 1 (
  echo [错误] 建表失败，请把上方日志截图发我。
  pause
  exit /b 1
)

REM ===== 6. 初始数据 =====
echo [6/6] 正在写入初始账号与套餐...
call node scripts/seed.mjs
if errorlevel 1 (
  echo [错误] 初始数据写入失败。
  pause
  exit /b 1
)

echo.
echo ============================================================
echo   初始化完成！接下来请双击 02-一键启动.bat
echo   浏览器访问：http://localhost:8080/
echo   普通用户 demo / user123456 ；管理员 admin / admin123456
echo ============================================================
pause