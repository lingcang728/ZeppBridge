# v3 worktree 专用门禁脚本。
#
# 存在的唯一理由：CARGO_TARGET_DIR 是**全局环境变量**（本机指向
# G:\build_cache\cargo-target），而 cargo 的优先级是
#   --target-dir > CARGO_TARGET_DIR 环境变量 > .cargo/config.toml 的 build.target-dir
# 所以在 v3 worktree 里放一个 .cargo/config.toml 是**无效**的，必须在调用前显式覆盖环境变量。
# 不覆盖的后果：v3 和 main 两个 worktree 共用同一个 target 目录，两棵不同的源码树写同一批
# 产物指纹，典型症状是 cargo check 过、cargo test 却挂在莫名其妙的地方。
#
# 用法：
#   pwsh scripts\v3-gates.ps1              # 只跑 Rust 四道门禁
#   pwsh scripts\v3-gates.ps1 -Frontend    # 跑前端门禁

[CmdletBinding()]
param(
    [switch]$Frontend
)

$ErrorActionPreference = 'Stop'

$env:CARGO_TARGET_DIR = 'G:\build_cache\cargo-target-v3'

$repoRoot = Split-Path -Parent $PSScriptRoot
$manifest = Join-Path $repoRoot 'src-tauri\Cargo.toml'

if (-not (Test-Path $manifest)) {
    throw "找不到 $manifest —— 这个脚本必须留在 v3 worktree 的 scripts\ 下运行。"
}

$tauriConfPath = Join-Path $repoRoot 'src-tauri\tauri.conf.json'
$tauriConf = Get-Content -LiteralPath $tauriConfPath -Encoding UTF8 -Raw | ConvertFrom-Json
if ([string]$tauriConf.productName -ne 'ZeppBridge3') {
    throw "v3 的 productName 必须是 ZeppBridge3（打出来的 exe 才能和 2.x 的 ZeppBridge 分开），当前是 $($tauriConf.productName)。"
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

if ($Frontend) {
    Push-Location $repoRoot
    try {
        foreach ($script in @('build', 'test', 'i18n:check', 'version:check')) {
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
