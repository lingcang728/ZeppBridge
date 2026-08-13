@echo off
setlocal EnableExtensions
cd /d "%~dp0\..\.."
if errorlevel 1 (
  echo [错误] 无法进入 ZeppBridge 项目目录。
  exit /b 1
)

where node.exe >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到 Node.js，请先安装 Node.js 18 或更高版本。
  exit /b 1
)
where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到 npm，请先安装 Node.js 并确认 npm 已加入 PATH。
  exit /b 1
)
where cargo.exe >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到 Cargo，请先安装 Rust 工具链并确认 cargo 已加入 PATH。
  exit /b 1
)
if not exist "node_modules\" (
  echo [错误] 未找到 node_modules，请先在 ZeppBridge 项目目录执行 npm install。
  exit /b 1
)

echo 正在启动 ZeppBridge 开发模式（Vite + Tauri）...
echo 按 Ctrl+C 停止开发服务器。
echo.
npm.cmd run tauri dev
set "DEV_EXIT=%ERRORLEVEL%"
if not "%DEV_EXIT%"=="0" (
  echo.
  echo [错误] ZeppBridge 开发模式已退出，退出码：%DEV_EXIT%。
) else (
  echo.
  echo ZeppBridge 开发模式已正常退出。
)

if /I "%~1"=="pause" pause
exit /b %DEV_EXIT%
