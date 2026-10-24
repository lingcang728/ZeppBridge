$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$metadataFiles = @(
  'package.json', 'package-lock.json', 'src-tauri/tauri.conf.json',
  'src-tauri/Cargo.toml', 'src-tauri/crates/core/Cargo.toml',
  'src-tauri/crates/cli/Cargo.toml', 'src-tauri/crates/mcp/Cargo.toml',
  'src-tauri/Cargo.lock', 'src/lib/appVersion.ts',
  'docs/reference/architecture.md', 'docs/reference/architecture.zh-CN.md',
  'packaging/flatpak/com.zeppbridge.app.metainfo.xml'
)
$snapshot = @{}
foreach ($relative in $metadataFiles) {
  $snapshot[$relative] = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $repo $relative)))
}
$snapshot | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'source-version-snapshot.json') -Encoding utf8
$env:CARGO_TARGET_DIR = 'G:\build_cache\cargo-target-v3'
$env:CARGO_BUILD_JOBS = '2'
$env:RUST_TEST_THREADS = '2'
$env:ZEPPBRIDGE_RELEASE_NOTES = 'Local acceptance build: historical workout details, reversible workout edits, credential recovery and shutdown coordination. Not published.'
Push-Location $repo
try {
  node scripts/release/check-version-consistency.mjs 3.0.9-beta.11
  if ($LASTEXITCODE -ne 0) { throw 'Cannot stage local beta version' }
  @'
import json, re
from pathlib import Path
p=Path('src-tauri/Cargo.lock')
s=p.read_text(encoding='utf-8')
s,n=re.subn(r'(name = "zeppbridge(?:-core|-cli|-mcp)?"\nversion = ")[^"]+(")',r'\g<1>3.0.9-beta.11\2',s)
if n != 4: raise RuntimeError(f'Expected four workspace lock versions, got {n}')
p.write_text(s,encoding='utf-8')
p=Path('package-lock.json')
s=p.read_text(encoding='utf-8')
s,n=re.subn(r'("version":\s*")3\.0\.6(")',r'\g<1>3.0.9-beta.11\2',s,count=2)
if n != 2: raise RuntimeError(f'Expected two root npm lock versions, got {n}')
p.write_text(s,encoding='utf-8')
'@ | python -
  if ($LASTEXITCODE -ne 0) { throw 'Cannot stage local beta lock metadata' }
  npm run package:release
  if ($LASTEXITCODE -ne 0) { throw 'Local beta packaging failed' }
  cargo build --release --manifest-path src-tauri/Cargo.toml --locked -p zeppbridge-cli
  if ($LASTEXITCODE -ne 0) { throw 'CLI candidate build failed' }
  Copy-Item -LiteralPath (Join-Path $env:CARGO_TARGET_DIR 'release\zeppbridge-cli.exe') -Destination (Join-Path $repo 'release\zeppbridge-cli.exe') -Force
} finally {
  foreach ($relative in $metadataFiles) {
    [IO.File]::WriteAllBytes((Join-Path $repo $relative), [Convert]::FromBase64String($snapshot[$relative]))
  }
  Remove-Item Env:ZEPPBRIDGE_RELEASE_NOTES -ErrorAction SilentlyContinue
  Pop-Location
}
