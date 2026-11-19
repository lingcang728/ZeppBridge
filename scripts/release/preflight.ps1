<#
.SYNOPSIS
  推 main / 打 tag 之前在本机先跑一遍 CI 能在 Windows 上跑的部分。

.DESCRIPTION
  云端一次完整 CI 要十几二十分钟，挂在一个本机几分钟就能发现的问题上最亏。
  这里按 CI 的顺序跑：路由与隐私检查、锁文件、前端门禁、Rust 门禁（含商店渠道）、
  Flatpak 来源检查。Rust 部分走 scripts\v3-gates.ps1（独立 cargo target、--jobs 1）。

  本机覆盖不到、只有云端能回答的：macOS / Linux 上的编译、clippy 和测试
  （cfg(not(windows)) 分支在 Windows 上根本不编译）、三平台安装包、Flatpak 和 Docker 镜像。
  这些在推 main 时由 CI 跑；改到打包相关的文件时，推 main 也会顺带三平台打包。

.PARAMETER SkipRust
  只跑前端和脚本类检查（几分钟），跳过 Rust 门禁。

.EXAMPLE
  npm run preflight
#>
[CmdletBinding()]
param(
    [switch]$SkipRust
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Push-Location $repoRoot
$started = Get-Date
$results = [System.Collections.Generic.List[object]]::new()

function Invoke-Step([string]$Name, [scriptblock]$Body) {
    Write-Host "==> $Name" -ForegroundColor Yellow
    $t = Get-Date
    & $Body
    if ($LASTEXITCODE) { throw "$Name 失败，退出码 $LASTEXITCODE" }
    $results.Add([pscustomobject]@{ Step = $Name; Minutes = [math]::Round(((Get-Date) - $t).TotalMinutes, 1) })
    Write-Host ''
}

try {
    # 和 CI 用同一版 Rust（rust-toolchain.toml）。版本对不上时本机测出来的不算数。
    $want = (Select-String -LiteralPath 'rust-toolchain.toml' -Pattern '^channel\s*=\s*"([^"]+)"').Matches[0].Groups[1].Value
    $have = ((& rustc --version) -split ' ')[1]
    if ($have -ne $want) {
        throw "rustc 是 $have，rust-toolchain.toml 钉的是 $want。先运行：rustup toolchain install"
    }

    Invoke-Step 'CI 路由与隐私检查的测试' { & node --test tests/ci-routing.test.mjs tests/privacy-check.test.mjs }

    $ahead = (& git rev-list --count origin/main..HEAD)
    if ($LASTEXITCODE -eq 0 -and [int]$ahead -gt 0) {
        Invoke-Step "未推送的 $ahead 个提交：隐私检查" { & node scripts/privacy/check.mjs --range origin/main..HEAD }
    }

    Invoke-Step '锁文件源地址' { & npm run lockfile:check }

    $gateArgs = @('-NoProfile', '-File', (Join-Path $repoRoot 'scripts/v3-gates.ps1'), '-Frontend')
    if ($SkipRust) {
        # 只跑前端：v3-gates 没有「只要前端」的开关，这里直接按它的清单跑。
        foreach ($script in @('build', 'test', 'test:functions', 'i18n:check', 'version:check', 'docs:check', 'budget:check', 'icons:verify')) {
            Invoke-Step "npm run $script" { & npm run $script }
        }
    }
    else {
        $gateArgs += '-Store'
        Invoke-Step 'Rust + 前端门禁（v3-gates.ps1 -Frontend -Store）' { & pwsh @gateArgs }
    }

    $python = (Get-Command python -ErrorAction SilentlyContinue)
    if ($python) {
        & $python.Source -c 'import yaml' 2>$null
        if ($LASTEXITCODE -eq 0) {
            Invoke-Step 'Flatpak 托盘模块来源' { & $python.Source scripts/ci/check-flatpak-sources.py }
        }
        else {
            $global:LASTEXITCODE = 0
            Write-Warning '本机 Python 没有 PyYAML，跳过 Flatpak 来源检查（CI 会跑）。'
        }
    }
    else {
        Write-Warning '找不到 python，跳过 Flatpak 来源检查（CI 会跑）。'
    }

    Write-Host ''
    $results | Format-Table -AutoSize | Out-String | Write-Host
    $total = [math]::Round(((Get-Date) - $started).TotalMinutes, 1)
    Write-Host "本机预检全部通过，用时 $total 分钟。" -ForegroundColor Green
    Write-Host '仍需云端回答：macOS / Linux 的编译与测试、三平台安装包、Flatpak、Docker。' -ForegroundColor Cyan
}
finally {
    Pop-Location
}
