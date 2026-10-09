<#
.SYNOPSIS
  构建 zeppbridge-mcp 并放到 src-tauri\binaries\ 下，供桌面安装包作为 sidecar 带上。

.DESCRIPTION
  2026-10-09 打包决定：MCP 随桌面安装包分发，放在 ZeppBridge.exe 旁边，设置「交给
  AI 工具」卡才能给出带真实路径的命令。Tauri 的 externalBin 要求文件名带目标三元组
  （zeppbridge-mcp-x86_64-pc-windows-msvc.exe），打包时会去掉后缀装到 exe 旁边。

  externalBin 只写在 src-tauri\tauri.sidecar.conf.json 里、打包时用 --config 叠上：
  tauri-build 在编译期就会检查 externalBin 指的文件，写进主配置的话，每一次
  cargo check / tauri dev 都得先构建 MCP。

  输出 sidecar 的绝对路径（最后一行）。
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$manifest = Join-Path $repoRoot 'src-tauri\Cargo.toml'

$triple = ((& rustc -vV) | Where-Object { $_ -like 'host:*' }) -replace '^host:\s*', ''
if (-not $triple) { throw '读不到 rustc 的 host 三元组' }

Write-Host "构建 zeppbridge-mcp（$triple）" -ForegroundColor Cyan
& cargo build --release --manifest-path $manifest --locked -p zeppbridge-mcp
if ($LASTEXITCODE -ne 0) { throw "cargo build -p zeppbridge-mcp 失败（$LASTEXITCODE）" }

# CARGO_TARGET_DIR 可能指到别处，问 cargo 自己要。
$metadata = & cargo metadata --manifest-path $manifest --format-version 1 --no-deps | ConvertFrom-Json
$exeSuffix = if ($triple -like '*windows*') { '.exe' } else { '' }
$built = Join-Path $metadata.target_directory "release\zeppbridge-mcp$exeSuffix"
if (-not (Test-Path -LiteralPath $built)) { throw "找不到构建产物：$built" }

$binDir = Join-Path $repoRoot 'src-tauri\binaries'
New-Item -ItemType Directory -Force -Path $binDir | Out-Null
$staged = Join-Path $binDir "zeppbridge-mcp-$triple$exeSuffix"
Copy-Item -LiteralPath $built -Destination $staged -Force
Write-Host "sidecar 已就位：$staged" -ForegroundColor Green
$staged
