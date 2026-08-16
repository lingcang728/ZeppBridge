param(
  [switch]$UserEntryOnly,
  [switch]$SkipShortcuts,
  [switch]$SkipStaleInstall
)

$ErrorActionPreference = 'Stop'
$PSDefaultParameterValues['*:Encoding'] = 'utf8'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = [System.IO.Path]::GetFullPath((Join-Path $ScriptDir '..\..'))
$ReleaseDir = Join-Path $Root 'release'
$PackageJson = Join-Path $Root 'package.json'
$TauriConfig = Join-Path $Root 'src-tauri\tauri.conf.json'
$CargoToml = Join-Path $Root 'src-tauri\Cargo.toml'

function Get-Sha256([string]$Path) {
  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
      return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant()
    } finally {
      $sha.Dispose()
    }
  } finally {
    $stream.Dispose()
  }
}

function Remove-FileSafe([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
  [System.IO.File]::SetAttributes($Path, [System.IO.FileAttributes]::Normal)
  [System.IO.File]::Delete($Path)
  return $true
}

function Copy-WithRetry([string]$Source, [string]$Destination) {
  $dir = Split-Path -Parent $Destination
  if (-not (Test-Path -LiteralPath $dir -PathType Container)) {
    [void][System.IO.Directory]::CreateDirectory($dir)
  }
  for ($attempt = 1; $attempt -le 12; $attempt += 1) {
    try {
      [System.IO.File]::Copy($Source, $Destination, $true)
      return
    } catch {
      if ($attempt -eq 12) { throw }
      Start-Sleep -Milliseconds 400
    }
  }
}

function Get-AppVersion {
  $npmVersion = (Get-Content -LiteralPath $PackageJson -Encoding UTF8 -Raw | ConvertFrom-Json).version
  $tauriVersion = (Get-Content -LiteralPath $TauriConfig -Encoding UTF8 -Raw | ConvertFrom-Json).version
  $cargoText = Get-Content -LiteralPath $CargoToml -Encoding UTF8 -Raw
  if ($cargoText -notmatch '(?ms)^\[package\][^\[]*?^version\s*=\s*"([^"]+)"') {
    throw 'Cargo.toml 缺少 [package].version'
  }
  $cargoVersion = $Matches[1]
  if ($npmVersion -ne $tauriVersion -or $cargoVersion -ne $tauriVersion) {
    throw "版本不一致：npm=$npmVersion tauri=$tauriVersion cargo=$cargoVersion"
  }
  if ($tauriVersion -notmatch '^\d+\.\d+\.\d+$') {
    throw "无法识别的版本号：$tauriVersion"
  }
  return [string]$tauriVersion
}

function Get-CargoTargetDir {
  $raw = & cargo.exe metadata --manifest-path $CargoToml --format-version 1 --no-deps
  if ($LASTEXITCODE -ne 0) { throw "cargo metadata 失败，退出码 $LASTEXITCODE" }
  $meta = $raw | ConvertFrom-Json
  $target = [string]$meta.target_directory
  if ([string]::IsNullOrWhiteSpace($target)) {
    throw 'cargo metadata 未返回 target_directory'
  }
  return [System.IO.Path]::GetFullPath($target)
}

function Get-VersionedArtifactVersion([string]$Name) {
  if ($Name -match '^ZeppBridge_(\d+\.\d+\.\d+)_') {
    return $Matches[1]
  }
  return $null
}

function Test-KeepReleaseFile([string]$Name, [string]$Version) {
  if ($Name -ieq 'ZeppBridge.exe') { return $true }
  $fileVersion = Get-VersionedArtifactVersion $Name
  if ($null -eq $fileVersion) { return $true }
  return $fileVersion -eq $Version
}

function Remove-OldVersionedArtifacts {
  param(
    [Parameter(Mandatory = $true)][string]$Directory,
    [Parameter(Mandatory = $true)][string]$Version
  )
  if (-not (Test-Path -LiteralPath $Directory -PathType Container)) { return @() }
  $removed = @()
  $files = [System.IO.Directory]::GetFiles($Directory)
  foreach ($path in $files) {
    $name = [System.IO.Path]::GetFileName($path)
    if (Test-KeepReleaseFile -Name $name -Version $Version) { continue }
    $fileVersion = Get-VersionedArtifactVersion $name
    if ($null -eq $fileVersion) { continue }
    if (Remove-FileSafe $path) {
      $removed += $path
      Write-Host "已删除旧安装包：$path"
    }
  }
  return $removed
}

function Stop-ProcessesAt([string]$Executable) {
  if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) { return 0 }
  $target = [System.IO.Path]::GetFullPath($Executable)
  $running = @(Get-Process -Name 'ZeppBridge', 'zeppbridge' -ErrorAction SilentlyContinue | Where-Object {
      try {
        if (-not $_.Path) { return $false }
        return ([System.IO.Path]::GetFullPath($_.Path)).Equals($target, [System.StringComparison]::OrdinalIgnoreCase)
      } catch {
        return $false
      }
    })
  if ($running.Count -eq 0) { return 0 }
  foreach ($proc in $running) {
    try { [void]$proc.CloseMainWindow() } catch { }
  }
  Start-Sleep -Milliseconds 700
  $still = @(Get-Process -Name 'ZeppBridge', 'zeppbridge' -ErrorAction SilentlyContinue | Where-Object {
      try {
        if (-not $_.Path) { return $false }
        return ([System.IO.Path]::GetFullPath($_.Path)).Equals($target, [System.StringComparison]::OrdinalIgnoreCase)
      } catch {
        return $false
      }
    })
  foreach ($proc in $still) {
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Milliseconds 350
  return $running.Count
}

function Set-Shortcut {
  param(
    [Parameter(Mandatory = $true)][string]$ShortcutPath,
    [Parameter(Mandatory = $true)][string]$TargetPath,
    [Parameter(Mandatory = $true)][string]$Description
  )
  $dir = Split-Path -Parent $ShortcutPath
  if (-not (Test-Path -LiteralPath $dir -PathType Container)) {
    [void][System.IO.Directory]::CreateDirectory($dir)
  }
  $shell = New-Object -ComObject WScript.Shell
  try {
    $shortcut = $shell.CreateShortcut($ShortcutPath)
    $shortcut.TargetPath = $TargetPath
    $shortcut.WorkingDirectory = [System.IO.Path]::GetDirectoryName($TargetPath)
    $shortcut.Description = $Description
    $shortcut.IconLocation = "$TargetPath,0"
    $shortcut.Save()
  } finally {
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($shell)
  }
}

function Get-ShortcutTarget([string]$ShortcutPath) {
  if (-not (Test-Path -LiteralPath $ShortcutPath -PathType Leaf)) { return $null }
  $shell = New-Object -ComObject WScript.Shell
  try {
    return [string]$shell.CreateShortcut($ShortcutPath).TargetPath
  } finally {
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($shell)
  }
}

function Update-UserEntry([string]$PortableExe, [string]$Version) {
  $desktop = [Environment]::GetFolderPath('DesktopDirectory')
  if ([string]::IsNullOrWhiteSpace($desktop)) {
    $desktop = [Environment]::GetFolderPath('Desktop')
  }
  $startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
  $desktopLnk = Join-Path $desktop 'ZeppBridge.lnk'
  $startMenuLnk = Join-Path $startMenu 'ZeppBridge.lnk'
  $description = "ZeppBridge $Version"

  Set-Shortcut -ShortcutPath $desktopLnk -TargetPath $PortableExe -Description $description
  Set-Shortcut -ShortcutPath $startMenuLnk -TargetPath $PortableExe -Description $description

  $appPaths = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\ZeppBridge.exe'
  if (-not (Test-Path -LiteralPath $appPaths)) {
    New-Item -Path $appPaths -Force | Out-Null
  }
  Set-ItemProperty -LiteralPath $appPaths -Name '(default)' -Value $PortableExe
  Set-ItemProperty -LiteralPath $appPaths -Name 'Path' -Value (Split-Path -Parent $PortableExe)

  Add-Type -Namespace ZeppBridge -Name Native -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("shell32.dll")]
public static extern void SHChangeNotify(uint wEventId, uint uFlags, System.IntPtr dwItem1, System.IntPtr dwItem2);
'@ -ErrorAction SilentlyContinue
  if ([type]::GetType('ZeppBridge.Native')) {
    [ZeppBridge.Native]::SHChangeNotify(0x8000000, 0x0000, [IntPtr]::Zero, [IntPtr]::Zero)
  }

  foreach ($lnk in @($desktopLnk, $startMenuLnk)) {
    $got = [System.IO.Path]::GetFullPath((Get-ShortcutTarget $lnk))
    $expected = [System.IO.Path]::GetFullPath($PortableExe)
    if (-not $got.Equals($expected, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "快捷方式未指向 release exe：`n  $lnk`n  got=$got`n  expected=$expected"
    }
    Write-Host "快捷方式已更新：$lnk -> $expected"
  }
}

function Remove-StaleNsisInstall {
  $staleDir = Join-Path $env:LOCALAPPDATA 'ZeppBridge'
  $removed = @()
  if (Test-Path -LiteralPath $staleDir -PathType Container) {
    $names = [System.IO.Directory]::GetFiles($staleDir)
    foreach ($path in $names) {
      $name = [System.IO.Path]::GetFileName($path)
      if ($name -match '^(?i)(zeppbridge\.exe|uninstall\.exe|zeppbridge\.exe\..*bak|.*\.bak|.*\.new)$') {
        if (Remove-FileSafe $path) {
          $removed += $path
          Write-Host "已删除残留安装文件：$path"
        }
      }
    }
    $left = [System.IO.Directory]::GetFileSystemEntries($staleDir)
    if ($left.Count -eq 0) {
      [System.IO.Directory]::Delete($staleDir, $false)
      Write-Host "已删除空目录：$staleDir"
    }
  }

  $uninstallKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\ZeppBridge'
  if (Test-Path -LiteralPath $uninstallKey) {
    & reg.exe delete 'HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\ZeppBridge' /f | Out-Null
    Write-Host '已删除卸载注册表：HKCU Uninstall\\ZeppBridge'
  }
  $nsisKey = 'HKCU:\Software\ZeppBridge'
  if (Test-Path -LiteralPath $nsisKey) {
    & reg.exe delete 'HKCU\Software\ZeppBridge' /f | Out-Null
    Write-Host '已删除 NSIS 注册表：HKCU Software\\ZeppBridge'
  }
  return $removed
}

$version = Get-AppVersion
Write-Host "当前版本：$version"
if (-not (Test-Path -LiteralPath $ReleaseDir -PathType Container)) {
  [void][System.IO.Directory]::CreateDirectory($ReleaseDir)
}

$portableDest = Join-Path $ReleaseDir 'ZeppBridge.exe'
$nsisName = "ZeppBridge_${version}_x64-setup.exe"
$msiName = "ZeppBridge_${version}_x64_en-US.msi"

if (-not $UserEntryOnly) {
  $targetDir = Get-CargoTargetDir
  $bundleDir = Join-Path $targetDir 'release\bundle'
  Write-Host "Cargo target_directory：$targetDir"
  Write-Host "Bundle 目录：$bundleDir"

  $portableSource = $null
  foreach ($name in @('ZeppBridge.exe', 'zeppbridge.exe')) {
    $candidate = Join-Path $targetDir "release\$name"
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
      $portableSource = $candidate
      break
    }
  }
  if (-not $portableSource) {
    throw "构建成功但未找到独立 exe：$targetDir\release\ZeppBridge.exe"
  }

  $nsisSource = $null
  $nsisDir = Join-Path $bundleDir 'nsis'
  if (Test-Path -LiteralPath $nsisDir -PathType Container) {
    $nsisSource = Get-ChildItem -LiteralPath $nsisDir -Filter $nsisName -File -ErrorAction SilentlyContinue | Select-Object -First 1
  }
  $msiSource = $null
  $msiDir = Join-Path $bundleDir 'msi'
  if (Test-Path -LiteralPath $msiDir -PathType Container) {
    $msiSource = Get-ChildItem -LiteralPath $msiDir -Filter $msiName -File -ErrorAction SilentlyContinue | Select-Object -First 1
  }
  if (-not $nsisSource -and -not $msiSource) {
    throw "构建成功但未找到当前版本安装包：$nsisName / $msiName"
  }

  $needReplacePortable = $true
  if (Test-Path -LiteralPath $portableDest -PathType Leaf) {
    if ((Get-Sha256 $portableSource) -eq (Get-Sha256 $portableDest)) {
      $needReplacePortable = $false
      Write-Host "独立 exe 已是最新，跳过覆盖：$portableDest"
    }
  }
  if ($needReplacePortable) {
    [void](Stop-ProcessesAt $portableDest)
    Copy-WithRetry -Source $portableSource -Destination $portableDest
    if ((Get-Sha256 $portableSource) -ne (Get-Sha256 $portableDest)) {
      throw "独立 exe 复制校验失败：$portableDest"
    }
    Write-Host "已复制独立 exe：$portableDest"
  }

  if ($nsisSource) {
    $nsisDest = Join-Path $ReleaseDir $nsisName
    Copy-WithRetry -Source $nsisSource.FullName -Destination $nsisDest
    Write-Host "已复制 NSIS：$nsisDest"
  }
  if ($msiSource) {
    $msiDest = Join-Path $ReleaseDir $msiName
    Copy-WithRetry -Source $msiSource.FullName -Destination $msiDest
    Write-Host "已复制 MSI：$msiDest"
  }

  $pruneDirs = @(
    $ReleaseDir,
    $nsisDir,
    $msiDir,
    (Join-Path $Root 'src-tauri\target\release\bundle\nsis'),
    (Join-Path $Root 'src-tauri\target\release\bundle\msi')
  )
  foreach ($dir in $pruneDirs) {
    [void](Remove-OldVersionedArtifacts -Directory $dir -Version $version)
  }
} else {
  $pruneDirs = @(
    $ReleaseDir,
    (Join-Path $Root 'src-tauri\target\release\bundle\nsis'),
    (Join-Path $Root 'src-tauri\target\release\bundle\msi')
  )
  try {
    $targetDir = Get-CargoTargetDir
    $pruneDirs += @(
      (Join-Path $targetDir 'release\bundle\nsis'),
      (Join-Path $targetDir 'release\bundle\msi')
    )
  } catch {
    Write-Host "跳过 Cargo bundle 清理：$($_.Exception.Message)"
  }
  foreach ($dir in $pruneDirs) {
    [void](Remove-OldVersionedArtifacts -Directory $dir -Version $version)
  }
}

if (-not (Test-Path -LiteralPath $portableDest -PathType Leaf)) {
  throw "缺少用户入口 exe：$portableDest"
}
$portableInfo = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($portableDest)
if ($portableInfo.FileVersion -ne $version -and $portableInfo.ProductVersion -ne $version) {
  throw "release\\ZeppBridge.exe 版本是 $($portableInfo.FileVersion)，期望 $version"
}

if (-not $SkipShortcuts) {
  Update-UserEntry -PortableExe $portableDest -Version $version
}

if (-not $SkipStaleInstall) {
  [void](Remove-StaleNsisInstall)
}

$leftover = @(Get-ChildItem -LiteralPath $ReleaseDir -File | Where-Object {
    $fileVersion = Get-VersionedArtifactVersion $_.Name
    return ($null -ne $fileVersion -and $fileVersion -ne $version)
  })
if ($leftover.Count -gt 0) {
  $names = ($leftover | ForEach-Object { $_.Name }) -join ', '
  throw "release 里仍有旧安装包：$names"
}

Write-Host "用户入口：$portableDest"
Write-Host "release 目录：$ReleaseDir"
exit 0
