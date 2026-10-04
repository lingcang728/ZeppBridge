param()
$ErrorActionPreference = 'Stop'
$demoRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
$demoExe = Join-Path $demoRoot 'ZeppBridge.exe'
$demoData = Join-Path $demoRoot 'data'
$demoSeed = Join-Path $demoRoot 'fixtures\seed.db'
if (-not (Test-Path -LiteralPath (Join-Path $demoData '.demo-library')) -or -not (Test-Path -LiteralPath $demoSeed)) {
  throw 'This reset script must be run from the packaged isolated demo folder.'
}
$runningDemo = @(Get-Process -Name ZeppBridge -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $demoExe })
if ($runningDemo.Count -gt 0) { throw 'Close the full demo before resetting its synthetic library.' }
foreach ($leaf in @('zepp.db-wal','zepp.db-shm')) {
  $demoJournal = [System.IO.Path]::GetFullPath((Join-Path $demoData $leaf))
  if (-not $demoJournal.StartsWith($demoData + '\',[System.StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected target' }
  if (Test-Path -LiteralPath $demoJournal -PathType Leaf) { Remove-Item -LiteralPath $demoJournal -Force }
}
Copy-Item -LiteralPath $demoSeed -Destination (Join-Path $demoData 'zepp.db') -Force
Write-Host 'Synthetic demo reset. The real ZeppBridge library was not opened.'
