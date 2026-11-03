<#
.SYNOPSIS
  打便携版的静默更新包、用 updater 私钥签名，写进 release\latest.json。

.DESCRIPTION
  便携版不走 NSIS：应用下载这个包（updater 插件按内置公钥验签），把里面的 exe 原地换掉
  （src-tauri/src/updates/portable.rs）。包里平铺、不带目录，应用会拒绝白名单之外的条目。

  所以打两份（3.1.1 起）：
  - `ZeppBridge-<版本>-Windows-Portable.zip`：ZeppBridge.exe + zeppbridge-mcp.exe + zeppbridge-cli.exe，
    写进 `windows-x86_64-portable-cli` 条目。3.1.1 及以后的应用读这一条。
  - `ZeppBridge-<版本>-Windows-Portable-Legacy.zip`：只有前两个，写进老的 `windows-x86_64-portable`
    条目。3.1.0 及更早的应用读这一条——它们的白名单里没有 CLI，收到带 CLI 的包会整包拒绝、
    永远升不上来。这一份要一直发下去。

  在 publish-local.ps1 之后跑：release\ZeppBridge.exe 和 release\latest.json 已经就位，
  MCP 由 stage-mcp-sidecar.ps1 放在 src-tauri/binaries/ 下。
  签名私钥照 tauri 的约定从 TAURI_SIGNING_PRIVATE_KEY / TAURI_SIGNING_PRIVATE_KEY_PASSWORD 读。

  没有这一条，3.0 之后的便携版查更新时会拿不到包（应用把「远端没有便携条目」当成没有新版本）。
#>
[CmdletBinding()]
param(
    [string]$Repo = $(if ($env:GITHUB_REPOSITORY) { $env:GITHUB_REPOSITORY } else { 'lingcang728/ZeppBridge' })
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$release = Join-Path $repoRoot 'release'
$version = (Get-Content -LiteralPath (Join-Path $repoRoot 'package.json') -Raw | ConvertFrom-Json).version

$exe = Join-Path $release 'ZeppBridge.exe'
if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { throw "缺少便携 exe：$exe" }
$exeVersion = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($exe)
if ($exeVersion.ProductVersion -ne $version -and $exeVersion.FileVersion -ne $version) {
    throw "release\ZeppBridge.exe 的版本是 $($exeVersion.ProductVersion)，期望 $version"
}

$triple = ((& rustc -vV) | Where-Object { $_ -like 'host:*' }) -replace '^host:\s*', ''
$sidecars = [ordered]@{}
foreach ($name in 'zeppbridge-mcp', 'zeppbridge-cli') {
    $path = Join-Path $repoRoot "src-tauri/binaries/$name-$triple.exe"
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "缺少 sidecar：$path（先跑 stage-mcp-sidecar.ps1）" }
    $sidecars[$name] = $path
}

$latestPath = Join-Path $release 'latest.json'
$latest = Get-Content -LiteralPath $latestPath -Raw | ConvertFrom-Json
if ($latest.version -ne $version) { throw "latest.json 的版本是 $($latest.version)，期望 $version" }

# 打一份 zip、签名、写进 latest.json 的 $target 条目。
function Add-PortablePackage([string]$zipName, [string]$target, [string[]]$programs) {
    $stage = Join-Path $release 'portable-stage'
    if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
    New-Item -ItemType Directory -Path $stage | Out-Null
    Copy-Item -LiteralPath $exe -Destination (Join-Path $stage 'ZeppBridge.exe')
    foreach ($name in $programs) {
        Copy-Item -LiteralPath $sidecars[$name] -Destination (Join-Path $stage "$name.exe")
    }

    $zip = Join-Path $release $zipName
    if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
    Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip
    Remove-Item -LiteralPath $stage -Recurse -Force

    Push-Location $repoRoot
    try {
        & npx tauri signer sign $zip
        if ($LASTEXITCODE -ne 0) { throw "签名失败（$LASTEXITCODE）" }
    } finally {
        Pop-Location
    }
    $signature = (Get-Content -LiteralPath "$zip.sig" -Raw).Trim()
    if ([string]::IsNullOrWhiteSpace($signature)) { throw "$zipName 的签名为空" }

    $size = (Get-Item -LiteralPath $zip).Length
    $entry = [ordered]@{
        signature = $signature
        url = "https://github.com/$Repo/releases/download/v$version/$zipName"
        size = $size
    }
    $latest.platforms | Add-Member -NotePropertyName $target -NotePropertyValue $entry -Force
    Write-Host "便携更新包：$zip（$size 字节）→ $target" -ForegroundColor Green
}

Add-PortablePackage "ZeppBridge-${version}-Windows-Portable.zip" 'windows-x86_64-portable-cli' @('zeppbridge-mcp', 'zeppbridge-cli')
Add-PortablePackage "ZeppBridge-${version}-Windows-Portable-Legacy.zip" 'windows-x86_64-portable' @('zeppbridge-mcp')

$json = $latest | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText($latestPath, $json, [System.Text.UTF8Encoding]::new($false))
Write-Host '两份便携更新包都已写进 latest.json' -ForegroundColor Green
