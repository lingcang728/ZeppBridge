<#
.SYNOPSIS
  Build an unsigned Microsoft Store MSIX for ZeppBridge.

.DESCRIPTION
  Builds the Store-only Tauri feature (without the GitHub updater), builds CLI
  and MCP sidecars with Store-aware package data resolution, then packages the
  three executables with MakeAppx. The manifest uses the confirmed Partner
  Center identity and registers zeppbridge-cli.exe / zeppbridge-mcp.exe aliases.
  This script never signs or installs the package.

.PARAMETER OutputPath
  Output path. Defaults to release/store-msix/ZeppBridge-3.1.3.0.msix.
  Existing output files are never overwritten.

.PARAMETER CargoTargetDir
  Reusable Cargo target directory. Defaults to CARGO_TARGET_DIR, then an existing
  G:\build_cache\cargo-target-v3, and finally the repository's src-tauri\target.
#>
[CmdletBinding()]
param(
  [string]$OutputPath = '',
  [string]$CargoTargetDir = ''
)

$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$manifest = Join-Path $root 'src-tauri\Cargo.toml'
$packageJson = Join-Path $root 'package.json'
$tauriConfig = Join-Path $root 'src-tauri\tauri.store.conf.json'
$appManifest = Join-Path $root 'src-tauri\windows\store\AppxManifest.xml'

foreach ($tool in 'cargo', 'rustc', 'npm', 'node') {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    throw "Required tool is not installed or not on PATH: $tool"
  }
}

$version = [string](Get-Content -LiteralPath $packageJson -Raw -Encoding UTF8 | ConvertFrom-Json).version
if ($version -ne '3.1.1') { throw "This Store package plan is pinned to 3.1.1; package.json has $version." }
if ([string](Get-Content -LiteralPath $tauriConfig -Raw -Encoding UTF8 | ConvertFrom-Json).version -ne $version) {
  throw 'tauri.store.conf.json version does not match package.json.'
}
if (-not (Test-Path -LiteralPath $appManifest -PathType Leaf)) { throw "Missing package manifest: $appManifest" }

$xml = [System.Xml.XmlDocument]::new()
$xml.Load($appManifest)
$ns = [System.Xml.XmlNamespaceManager]::new($xml.NameTable)
$ns.AddNamespace('uap3', 'http://schemas.microsoft.com/appx/manifest/uap/windows10/3')
$ns.AddNamespace('desktop', 'http://schemas.microsoft.com/appx/manifest/desktop/windows10')
$identity = $xml.Package.Identity
if ($identity.Name -ne 'LincStudio.ZeppBridge' -or
    $identity.Publisher -ne 'CN=4670A0D8-769F-495D-9030-60FBE54AF9D2' -or
    $identity.Version -ne '3.1.3.0' -or
    $xml.Package.Properties.PublisherDisplayName -ne 'Linc Studio') {
  throw 'The manifest identity does not match the confirmed Partner Center values.'
}
$actualAliases = @()
foreach ($node in $xml.SelectNodes('//uap3:Extension[@Category="windows.appExecutionAlias"]/uap3:AppExecutionAlias/desktop:ExecutionAlias', $ns)) {
  $actualAliases += [string]$node.GetAttribute('Alias')
}
$expectedAliases = @(
  'zeppbridge-cli.exe',
  'zeppbridge-mcp.exe',
  'zeppbridge-store-cli.exe',
  'zeppbridge-store-mcp.exe'
)
$actualAliasSet = ($actualAliases | Sort-Object) -join '|'
$expectedAliasSet = ($expectedAliases | Sort-Object) -join '|'
if ($actualAliasSet -cne $expectedAliasSet) {
  throw "Execution aliases must include the canonical and Store-specific names. Found: $($actualAliases -join ', ')"
}
$storePaths = Join-Path $root 'src-tauri\crates\core\src\paths\store.rs'
$storePathsSource = Get-Content -LiteralPath $storePaths -Raw -Encoding UTF8
if (-not $storePathsSource.Contains('LincStudio.ZeppBridge_pwftgd5x5w3va')) {
  throw 'Store LocalState family-name guard does not match the manifest identity.'
}

$sdkRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
$makeAppx = Get-ChildItem -LiteralPath $sdkRoot -Directory -ErrorAction Stop |
  Where-Object { $_.Name -match '^10\.0\.\d+\.0$' } |
  Sort-Object { [version]$_.Name } -Descending |
  ForEach-Object { Join-Path $_.FullName 'x64\makeappx.exe' } |
  Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
  Select-Object -First 1
if (-not $makeAppx) { throw "Windows SDK MakeAppx.exe was not found under $sdkRoot." }

$rustHostTriple = ((& rustc -vV) | Where-Object { $_ -like 'host:*' }) -replace '^host:\s*', ''
if ($rustHostTriple -ne 'x86_64-pc-windows-msvc') { throw "Expected x64 MSVC Rust host; got $rustHostTriple." }

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $OutputPath = Join-Path $root 'release\store-msix\ZeppBridge-3.1.3.0.msix'
}
if (-not [System.IO.Path]::IsPathRooted($OutputPath)) { $OutputPath = Join-Path $root $OutputPath }
$OutputPath = [System.IO.Path]::GetFullPath($OutputPath)
if (Test-Path -LiteralPath $OutputPath) { throw "Refusing to overwrite existing package: $OutputPath" }
$outputDirectory = Split-Path -Parent $OutputPath
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null

if ([string]::IsNullOrWhiteSpace($CargoTargetDir)) {
  if (-not [string]::IsNullOrWhiteSpace($env:CARGO_TARGET_DIR)) {
    $CargoTargetDir = $env:CARGO_TARGET_DIR
  } elseif (Test-Path -LiteralPath 'G:\build_cache\cargo-target-v3' -PathType Container) {
    $CargoTargetDir = 'G:\build_cache\cargo-target-v3'
  } else {
    $CargoTargetDir = Join-Path $root 'src-tauri\target'
  }
}
$CargoTargetDir = [System.IO.Path]::GetFullPath($CargoTargetDir)
New-Item -ItemType Directory -Path $CargoTargetDir -Force | Out-Null
$stage = Join-Path $root "src-tauri\target\store-msix-stage-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $stage -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $stage 'Assets') -Force | Out-Null

$previous = @{}
foreach ($name in 'CARGO_TARGET_DIR', 'CARGO_BUILD_JOBS', 'ZB_STORE_BUILD', 'TAURI_CLI_CONFIG') {
  $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}

Push-Location $root
try {
  $env:CARGO_TARGET_DIR = $CargoTargetDir
  $env:CARGO_BUILD_JOBS = '2'
  $env:ZB_STORE_BUILD = '1'
  Remove-Item Env:TAURI_CLI_CONFIG -ErrorAction SilentlyContinue

  node scripts/release/check-version-consistency.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Version consistency check failed.' }

  Write-Host 'Building Store CLI and MCP sidecars (jobs=2)…' -ForegroundColor Cyan
  & cargo build --release --manifest-path $manifest --locked --no-default-features --features store -p zeppbridge-cli -p zeppbridge-mcp
  if ($LASTEXITCODE -ne 0) { throw "Store sidecar build failed ($LASTEXITCODE)." }

  Write-Host 'Building Store desktop executable (no bundle, no updater; jobs=2)…' -ForegroundColor Cyan
  npm exec -- tauri build --ci --no-bundle --features store --config src-tauri/tauri.store.conf.json -- --no-default-features --locked
  if ($LASTEXITCODE -ne 0) { throw "Store Tauri build failed ($LASTEXITCODE)." }

  $releaseDir = Join-Path $CargoTargetDir 'release'
  $appExe = @('zeppbridge.exe', 'ZeppBridge.exe') |
    ForEach-Object { Join-Path $releaseDir $_ } |
    Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
    Select-Object -First 1
  if (-not $appExe) { throw "Could not find the Tauri executable in $releaseDir." }

  $payloads = @(
    @{ Source = $appExe; Name = 'ZeppBridge.exe' },
    @{ Source = Join-Path $releaseDir 'zeppbridge-cli.exe'; Name = 'zeppbridge-cli.exe' },
    @{ Source = Join-Path $releaseDir 'zeppbridge-mcp.exe'; Name = 'zeppbridge-mcp.exe' }
  )
  foreach ($payload in $payloads) {
    if (-not (Test-Path -LiteralPath $payload.Source -PathType Leaf)) { throw "Missing Store package payload: $($payload.Source)" }
    Copy-Item -LiteralPath $payload.Source -Destination (Join-Path $stage $payload.Name)
  }

  $iconDirectory = Join-Path $root 'src-tauri\icons'
  Add-Type -AssemblyName System.Drawing
  $iconSizes = @{
    'StoreLogo.png' = 50
    'Square150x150Logo.png' = 150
    'Square44x44Logo.png' = 44
  }
  foreach ($name in $iconSizes.Keys) {
    $icon = Join-Path $iconDirectory $name
    if (-not (Test-Path -LiteralPath $icon -PathType Leaf)) { throw "Missing Store asset at its required size: $icon" }
    $image = [System.Drawing.Image]::FromFile($icon)
    try {
      if ($image.Width -ne $iconSizes[$name] -or $image.Height -ne $iconSizes[$name]) {
        throw "Store asset $icon must be $($iconSizes[$name])x$($iconSizes[$name]); found $($image.Width)x$($image.Height)."
      }
    } finally {
      $image.Dispose()
    }
    Copy-Item -LiteralPath $icon -Destination (Join-Path $stage "Assets\$name")
  }
  Copy-Item -LiteralPath $appManifest -Destination (Join-Path $stage 'AppxManifest.xml')

  Write-Host "Packing unsigned MSIX with $makeAppx…" -ForegroundColor Cyan
  & $makeAppx pack /v /no /d $stage /p $OutputPath
  if ($LASTEXITCODE -ne 0) { throw "MakeAppx pack failed ($LASTEXITCODE)." }
  if (-not (Test-Path -LiteralPath $OutputPath -PathType Leaf)) { throw 'MakeAppx did not create the package.' }

  $hash = (Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256).Hash.ToLowerInvariant()
  Write-Host "Unsigned MSIX: $OutputPath" -ForegroundColor Green
  Write-Host "SHA-256: $hash"
  Write-Host 'Identity: LincStudio.ZeppBridge'
  Write-Host 'Publisher: CN=4670A0D8-769F-495D-9030-60FBE54AF9D2'
  Write-Host 'Package version: 3.1.3.0 (application binaries: 3.1.1)'
} finally {
  Pop-Location
  foreach ($name in $previous.Keys) {
    [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process')
  }
}
