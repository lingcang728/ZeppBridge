$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$loadedLocalSigningKey = $false

Push-Location $root
try {
  npm run build
  if ($LASTEXITCODE -ne 0) { throw '前端构建失败。' }
  npm run icons:verify
  if ($LASTEXITCODE -ne 0) { throw '图标校验失败。' }
  cargo fmt --manifest-path src-tauri\Cargo.toml --all -- --check
  if ($LASTEXITCODE -ne 0) { throw 'Rust 格式校验失败。' }
  cargo test --manifest-path src-tauri\Cargo.toml --locked
  if ($LASTEXITCODE -ne 0) { throw 'Rust 测试失败。' }

  if ([string]::IsNullOrWhiteSpace($env:TAURI_SIGNING_PRIVATE_KEY) -and
      [string]::IsNullOrWhiteSpace($env:TAURI_SIGNING_PRIVATE_KEY_PATH)) {
    $backup = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'ZeppBridge-Updater-Offline-Backup'
    $private = Join-Path $backup 'zeppbridge-updater.key'
    $passwordFile = Join-Path $backup 'zeppbridge-updater.key-password.dpapi'
    if (-not (Test-Path -LiteralPath $private) -or -not (Test-Path -LiteralPath $passwordFile)) {
      throw '缺少 ZeppBridge updater 离线签名备份。'
    }
    $secure = ConvertTo-SecureString (Get-Content -LiteralPath $passwordFile -Raw)
    $credential = [System.Management.Automation.PSCredential]::new('zeppbridge-updater', $secure)
    $env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content -LiteralPath $private -Raw).Trim()
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $credential.GetNetworkCredential().Password
    $loadedLocalSigningKey = $true
  }

  tauri build
  if ($LASTEXITCODE -ne 0) { throw 'Tauri 打包失败。' }
  & (Join-Path $PSScriptRoot 'publish-local.ps1')
  if ($LASTEXITCODE -ne 0) { throw '本机发布同步失败。' }
} finally {
  if ($loadedLocalSigningKey) {
    Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue
  }
  Pop-Location
}
