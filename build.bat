@echo off
setlocal EnableExtensions
cd /d "%~dp0"
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

set "METADATA_FILE=%TEMP%\ZeppBridge-cargo-metadata-%RANDOM%.json"
set "ZEPPBRIDGE_METADATA_FILE=%METADATA_FILE%"
if exist "%METADATA_FILE%" del /q "%METADATA_FILE%" >nul 2>&1

echo 正在读取 Cargo target_directory...
cargo.exe metadata --manifest-path "src-tauri\Cargo.toml" --format-version 1 --no-deps > "%METADATA_FILE%"
set "METADATA_EXIT=%ERRORLEVEL%"
if not "%METADATA_EXIT%"=="0" (
  echo [错误] cargo metadata 失败，退出码：%METADATA_EXIT%。
  del /q "%METADATA_FILE%" >nul 2>&1
  set "ZEPPBRIDGE_METADATA_FILE="
  exit /b %METADATA_EXIT%
)

set "TARGET_DIR="
for /f "usebackq delims=" %%T in (`powershell.exe -NoProfile -NonInteractive -Command "$ErrorActionPreference = 'Stop'; $meta = Get-Content -LiteralPath $env:ZEPPBRIDGE_METADATA_FILE -Encoding UTF8 -Raw | ConvertFrom-Json; $target = [string]$meta.target_directory; if ([string]::IsNullOrWhiteSpace($target)) { throw 'cargo metadata did not return target_directory' }; [System.IO.Path]::GetFullPath($target)"`) do set "TARGET_DIR=%%T"
set "METADATA_PARSE_EXIT=%ERRORLEVEL%"
del /q "%METADATA_FILE%" >nul 2>&1
set "ZEPPBRIDGE_METADATA_FILE="
if not "%METADATA_PARSE_EXIT%"=="0" (
  echo [错误] 无法从 cargo metadata 读取 target_directory，退出码：%METADATA_PARSE_EXIT%。
  exit /b %METADATA_PARSE_EXIT%
)
if not defined TARGET_DIR (
  echo [错误] cargo metadata 未返回有效的 target_directory。
  exit /b 1
)
set "BUNDLE_DIR=%TARGET_DIR%\release\bundle"

echo 正在构建 ZeppBridge Windows 安装包...
echo   - 前端：Vite production build
echo   - 后端：Rust release build
echo   - 安装包：NSIS 与 MSI
echo.
npm.cmd run tauri build
set "BUILD_EXIT=%ERRORLEVEL%"
if not "%BUILD_EXIT%"=="0" (
  echo.
  echo [错误] ZeppBridge 构建失败，退出码：%BUILD_EXIT%。
  exit /b %BUILD_EXIT%
)

if not exist "%BUNDLE_DIR%\." (
  echo.
  echo [错误] 构建命令成功但未找到安装包目录：
  echo        %BUNDLE_DIR%
  exit /b 1
)

echo.
echo ZeppBridge 构建成功。
echo 实际安装包目录：%BUNDLE_DIR%
set "NSIS_INSTALLER="
for /f "usebackq delims=" %%F in (`dir /b /s "%BUNDLE_DIR%\nsis\*.exe" 2^>nul`) do if not defined NSIS_INSTALLER set "NSIS_INSTALLER=%%F"
set "MSI_INSTALLER="
for /f "usebackq delims=" %%F in (`dir /b /s "%BUNDLE_DIR%\msi\*.msi" 2^>nul`) do if not defined MSI_INSTALLER set "MSI_INSTALLER=%%F"
if not defined NSIS_INSTALLER if not defined MSI_INSTALLER (
  echo [错误] 构建成功但未找到 NSIS EXE 或 MSI 安装包。
  echo        检查目录：%BUNDLE_DIR%
  exit /b 1
)
if defined NSIS_INSTALLER echo NSIS 安装包：%NSIS_INSTALLER%
if defined MSI_INSTALLER echo MSI 安装包：%MSI_INSTALLER%

if /I "%~1"=="pause" pause
exit /b 0
