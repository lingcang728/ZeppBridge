<#
.SYNOPSIS
  打包 zeppbridge-cli 与 zeppbridge-mcp 为一个版本化压缩包。

.DESCRIPTION
  桌面应用是双击运行的，命令行和 MCP 不是——它们要被 Task Scheduler、cron
  或某个 MCP 客户端按路径调起来。所以这两个 binary 单独分发，而不是塞进
  NSIS/MSI 安装包里：装了桌面应用的人不一定需要它们，需要它们的人也不该被
  迫先装一个 GUI。

  压缩包里除了两个 binary，还有 SHA256SUMS.txt、一份说明和一段可以直接粘进
  MCP 客户端配置的 JSON 示例。文件名带版本和平台，不与主程序 ZeppBridge.exe
  冲突。

.PARAMETER Target
  rustc target triple。默认取当前主机。
#>
[CmdletBinding()]
param(
    [string]$Target = ''
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$manifest = Join-Path $repoRoot 'src-tauri/Cargo.toml'

$version = (Get-Content (Join-Path $repoRoot 'package.json') -Raw | ConvertFrom-Json).version
if (-not $version) { throw 'package.json 里读不到版本号' }

$cargoArgs = @('build', '--release', '--manifest-path', $manifest, '--locked',
               '-p', 'zeppbridge-cli', '-p', 'zeppbridge-mcp')
if ($Target) { $cargoArgs += @('--target', $Target) }

Write-Host "构建 zeppbridge-cli / zeppbridge-mcp v$version" -ForegroundColor Cyan
& cargo @cargoArgs
if ($LASTEXITCODE -ne 0) { throw "cargo build 失败（$LASTEXITCODE）" }

# cargo 的产物目录可能被 CARGO_TARGET_DIR 改到别处，问 cargo 自己要，
# 而不是假设它在 src-tauri/target 下。
$metadata = & cargo metadata --manifest-path $manifest --format-version 1 --no-deps | ConvertFrom-Json
$targetRoot = $metadata.target_directory
$profileDir = if ($Target) { Join-Path $targetRoot "$Target/release" } else { Join-Path $targetRoot 'release' }

$isWindowsHost = $IsWindows -or ($null -eq $IsWindows)
$exeSuffix = if ($isWindowsHost -and -not $Target) { '.exe' } elseif ($Target -like '*windows*') { '.exe' } else { '' }
$platform = if ($Target) { $Target } elseif ($isWindowsHost) { 'x86_64-pc-windows-msvc' } else { 'host' }

$stageName = "zeppbridge-tools-$version-$platform"
$stage = Join-Path $repoRoot "release/$stageName"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage -Force | Out-Null

foreach ($name in @('zeppbridge-cli', 'zeppbridge-mcp')) {
    $source = Join-Path $profileDir "$name$exeSuffix"
    if (-not (Test-Path $source)) { throw "找不到构建产物：$source" }
    Copy-Item $source (Join-Path $stage "$name$exeSuffix") -Force
}

# MCP 配置示例。命令留成占位路径：写死本机绝对路径会把打包机器的目录结构
# 一起发出去。
$mcpExample = @"
{
  "mcpServers": {
    "zeppbridge": {
      "command": "<解压目录>/zeppbridge-mcp$exeSuffix",
      "args": []
    }
  }
}
"@
Set-Content -Path (Join-Path $stage 'mcp-config-example.json') -Value $mcpExample -Encoding utf8

$readme = @"
ZeppBridge 命令行与 MCP 工具 v$version（$platform）

包含
  zeppbridge-cli$exeSuffix   无交互命令行：status / sync / export / contract
  zeppbridge-mcp$exeSuffix   MCP stdio 服务，只读

前提
  这两个程序读的是 ZeppBridge 桌面应用的本机数据库。请先安装桌面应用、
  连接账号并至少同步一次；命令行不做登录，MCP 不联网。

  数据库位置取决于平台：
    Windows  桌面应用安装目录旁的 data\zepp.db
    macOS    ~/Library/Application Support/com.zeppbridge.ZeppBridge/data
    Linux    包管理器安装的用 ~/.local/share/zeppbridge/data；
             AppImage 和解包的 tarball 用可执行文件旁的 data/

  注意：这条规则是每个可执行文件各自套用的。把这两个程序解压到一个
  自己的目录里，它们解析出的就是那个目录旁边的 data/——一个空库，不是
  应用在写的那个。表现是一句「本机还没有数据库」，而应用明明有数据。

  要共用同一份数据，把 ZEPPBRIDGE_DATA_DIR 设成应用数据目录的绝对路径：
    Linux/macOS  ZEPPBRIDGE_DATA_DIR=/path/to/data zeppbridge-cli status --json
    Windows      set ZEPPBRIDGE_DATA_DIR=C:\path\to\data

zeppbridge-cli
  zeppbridge-cli status --json
  zeppbridge-cli sync --mode incremental --json
  zeppbridge-cli export --from 2026-01-01 --to 2026-01-31 --format csv --out a.csv
  zeppbridge-cli help          完整选项与退出码

  退出码：0 成功 / 1 失败 / 2 用法错误 / 3 未连接账号 /
  4 另有进程在写库（可重试）/ 5 云端失败 / 6 数据库错误 /
  7 数据库版本与本程序不匹配（先启动一次桌面应用完成升级）

zeppbridge-mcp
  stdio 传输，不监听任何端口。配置示例见 mcp-config-example.json，
  把 <解压目录> 换成实际路径即可。

  工具：list_workouts、get_workout_insight、get_metric_series、
  get_sleep_detail、get_data_health。全部只读。

隐私
  两个程序都只读写本机数据目录，不上传任何数据，不返回 token、Cookie
  或完整账号。缺失的数据就是缺失——不会用 0 或估算值填空。

校验
  SHA256SUMS.txt 里是本包内每个文件的 SHA-256。
"@
Set-Content -Path (Join-Path $stage 'README.txt') -Value $readme -Encoding utf8

# 先算校验和再打包，且不把 SHA256SUMS.txt 自己算进去。
$sums = Get-ChildItem $stage -File | Sort-Object Name | ForEach-Object {
    "$((Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower())  $($_.Name)"
}
Set-Content -Path (Join-Path $stage 'SHA256SUMS.txt') -Value $sums -Encoding utf8

$zip = Join-Path $repoRoot "release/$stageName.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip
$zipHash = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()

Write-Host "已生成 $zip" -ForegroundColor Green
Write-Host "SHA-256 $zipHash"
