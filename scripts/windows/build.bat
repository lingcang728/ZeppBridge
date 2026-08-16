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

echo 正在构建 ZeppBridge Windows 安装包...
echo   - 图标：src-tauri/icons/icon-source.svg（tauri beforeBuildCommand）
echo   - 前端：Vite production build
echo   - 后端：Rust release build
echo   - 安装包：NSIS 与 MSI
echo   - 用户入口：项目 release\ZeppBridge.exe（桌面/开始菜单快捷方式会改指向这里）
echo.
npm.cmd run tauri build
set "BUILD_EXIT=%ERRORLEVEL%"
if not "%BUILD_EXIT%"=="0" (
  echo.
  echo [错误] ZeppBridge 构建失败，退出码：%BUILD_EXIT%。
  exit /b %BUILD_EXIT%
)

echo.
echo 构建成功，正在收集到 release\ 并同步本机入口...
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0publish-local.ps1"
set "PUBLISH_EXIT=%ERRORLEVEL%"
if not "%PUBLISH_EXIT%"=="0" (
  echo.
  echo [错误] 发布到 release\ 或同步快捷方式失败，退出码：%PUBLISH_EXIT%。
  exit /b %PUBLISH_EXIT%
)

if /I "%~1"=="pause" pause
exit /b 0
