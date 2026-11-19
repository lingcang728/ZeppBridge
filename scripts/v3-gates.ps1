# v3 门禁脚本（cargo target 隔离）。
#
# 存在的唯一理由：CARGO_TARGET_DIR 是**全局环境变量**（本机指向
# G:\build_cache\cargo-target），而 cargo 的优先级是
#   --target-dir > CARGO_TARGET_DIR 环境变量 > .cargo/config.toml 的 build.target-dir
# 所以放一个 .cargo/config.toml 是**无效**的，必须在调用前显式覆盖环境变量。
# 不覆盖的后果：v3 和 main（临时 worktree）共用同一个 target 目录，两棵不同的源码树写同一批
# 产物指纹，典型症状是 cargo check 过、cargo test 却挂在莫名其妙的地方。
#
# 用法：
#   pwsh scripts\v3-gates.ps1              # 只跑 Rust 四道门禁
#   pwsh scripts\v3-gates.ps1 -Frontend    # 跑前端门禁
#   pwsh scripts\v3-gates.ps1 -Store       # 再加商店渠道的测试和依赖树检查（同 CI 的 verify-store）
#
# 本机测试保留 --jobs 1：全核满载太久，这台机器会掉电。CI 上不限。

[CmdletBinding()]
param(
    [switch]$Frontend,
    [switch]$Store
)

$ErrorActionPreference = 'Stop'

$env:CARGO_TARGET_DIR = 'G:\build_cache\cargo-target-v3'

# check / clippy 也别吃满全部核心：换了 Rust 版本要整体重编时会满载好几分钟。
if (-not $env:CARGO_BUILD_JOBS) {
    $env:CARGO_BUILD_JOBS = [string][math]::Max(1, [math]::Floor([Environment]::ProcessorCount / 2))
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$manifest = Join-Path $repoRoot 'src-tauri\Cargo.toml'

if (-not (Test-Path $manifest)) {
    throw "找不到 $manifest —— 这个脚本必须留在仓库的 scripts\ 下运行。"
}

$tauriConfPath = Join-Path $repoRoot 'src-tauri\tauri.conf.json'
$tauriConf = Get-Content -LiteralPath $tauriConfPath -Encoding UTF8 -Raw | ConvertFrom-Json
# 2026-09-30 用户决定：本机不再并行跑 2.x，v3 测试版改回叫 ZeppBridge。
if ([string]$tauriConf.productName -ne 'ZeppBridge') {
    throw "v3 的 productName 应为 ZeppBridge，当前是 $($tauriConf.productName)。"
}

Write-Host "CARGO_TARGET_DIR = $env:CARGO_TARGET_DIR" -ForegroundColor Cyan
Write-Host "manifest         = $manifest" -ForegroundColor Cyan
Write-Host "productName      = $($tauriConf.productName)" -ForegroundColor Cyan
Write-Host ''

# 顺序与 .github/workflows/ci.yml 一致。--workspace 不能省：
# 仓库是 cargo workspace（zeppbridge / core / cli / mcp），漏掉它只检查了应用一个包。
$gates = @(
    @{ Name = 'fmt';    Args = @('fmt', '--manifest-path', $manifest, '--all', '--', '--check') },
    @{ Name = 'check';  Args = @('check', '--manifest-path', $manifest, '--workspace', '--locked', '--all-targets') },
    @{ Name = 'clippy'; Args = @('clippy', '--manifest-path', $manifest, '--workspace', '--locked', '--all-targets', '--', '-D', 'warnings') },
    @{ Name = 'test';   Args = @('test', '--manifest-path', $manifest, '--workspace', '--locked', '--jobs', '1') }
)

foreach ($gate in $gates) {
    Write-Host "==> cargo $($gate.Name)" -ForegroundColor Yellow
    & cargo @($gate.Args)
    if ($LASTEXITCODE -ne 0) {
        throw "cargo $($gate.Name) 失败，退出码 $LASTEXITCODE"
    }
    Write-Host ''
}

if ($Store) {
    Write-Host '==> cargo test（商店渠道）' -ForegroundColor Yellow
    $savedConfig = $env:TAURI_CONFIG
    $savedStore = $env:ZB_STORE_BUILD
    try {
        $env:TAURI_CONFIG = Get-Content -LiteralPath (Join-Path $repoRoot 'src-tauri\tauri.store.conf.json') -Raw
        $env:ZB_STORE_BUILD = '1'
        & cargo test --manifest-path $manifest --workspace --no-default-features --features store --locked --jobs 1
        if ($LASTEXITCODE -ne 0) { throw "商店渠道 cargo test 失败，退出码 $LASTEXITCODE" }
    }
    finally {
        $env:TAURI_CONFIG = $savedConfig
        $env:ZB_STORE_BUILD = $savedStore
    }
    Write-Host '==> 商店渠道不含 GitHub 更新器' -ForegroundColor Yellow
    $tree = & cargo tree --manifest-path $manifest --workspace --no-default-features --features store --edges normal,build --locked
    if ($LASTEXITCODE -ne 0) { throw "cargo tree 失败，退出码 $LASTEXITCODE" }
    if ($tree -match 'tauri-plugin-updater v') { throw '商店渠道的依赖树里出现了 tauri-plugin-updater' }
    Write-Host ''
}

if ($Frontend) {
    Push-Location $repoRoot
    try {
        # 与 CI 对齐：字体覆盖在 test:functions 中，首屏体积在 budget:check 中。
        # 只做 build / Vitest 会漏掉这两类曾连续失败的门禁。
        foreach ($script in @('build', 'test', 'test:functions', 'i18n:check', 'version:check', 'docs:check', 'budget:check', 'icons:verify')) {
            Write-Host "==> npm run $script" -ForegroundColor Yellow
            & npm run $script
            if ($LASTEXITCODE -ne 0) {
                throw "npm run $script 失败，退出码 $LASTEXITCODE"
            }
            Write-Host ''
        }
    }
    finally {
        Pop-Location
    }
}

Write-Host '全部门禁通过。' -ForegroundColor Green
