param(
  [string]$SourceDirectory = (Join-Path $PSScriptRoot '..\..\design_picture'),
  [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\..\src\assets\design-icons')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$sourceRoot = [System.IO.Path]::GetFullPath($SourceDirectory)
$outputRoot = [System.IO.Path]::GetFullPath($OutputDirectory)
[void][System.IO.Directory]::CreateDirectory($outputRoot)

function Copy-DesignAsset {
  param(
    [Parameter(Mandatory = $true)][string]$SourceName,
    [Parameter(Mandatory = $true)][string]$OutputName
  )
  $source = Join-Path $sourceRoot $SourceName
  $destination = Join-Path $outputRoot $OutputName
  if (-not [System.IO.File]::Exists($source)) {
    throw "Missing design asset: $source"
  }
  [System.IO.File]::Copy($source, $destination, $true)
  Write-Host "Copied $OutputName"
}

function Split-DesignSheet {
  param(
    [Parameter(Mandatory = $true)][string]$SourceName,
    [Parameter(Mandatory = $true)][int]$Columns,
    [Parameter(Mandatory = $true)][int]$Rows,
    [Parameter(Mandatory = $true)][string[]]$Names
  )

  if ($Names.Count -ne ($Columns * $Rows)) {
    throw "$SourceName expects $($Columns * $Rows) output names, got $($Names.Count)"
  }

  $source = Join-Path $sourceRoot $SourceName
  if (-not [System.IO.File]::Exists($source)) {
    throw "Missing design sheet: $source"
  }

  $sheet = [System.Drawing.Bitmap]::new($source)
  try {
    if (($sheet.Width % $Columns) -ne 0 -or ($sheet.Height % $Rows) -ne 0) {
      throw "$SourceName dimensions $($sheet.Width)x$($sheet.Height) do not divide into ${Columns}x${Rows}"
    }
    $cellWidth = [int]($sheet.Width / $Columns)
    $cellHeight = [int]($sheet.Height / $Rows)

    for ($row = 0; $row -lt $Rows; $row += 1) {
      for ($column = 0; $column -lt $Columns; $column += 1) {
        $index = ($row * $Columns) + $column
        $bounds = [System.Drawing.Rectangle]::new($column * $cellWidth, $row * $cellHeight, $cellWidth, $cellHeight)
        $tile = $sheet.Clone($bounds, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        try {
          # The generated sheets intentionally let a few highlights bleed across
          # cell boundaries. Clear a narrow transparent gutter so neighbouring
          # icons never appear as one-pixel cyan/yellow slivers in the app.
          $gutter = [Math]::Min(8, [Math]::Floor([Math]::Min($cellWidth, $cellHeight) / 12))
          $transparent = [System.Drawing.Color]::FromArgb(0, 0, 0, 0)
          for ($edge = 0; $edge -lt $gutter; $edge += 1) {
            for ($x = 0; $x -lt $cellWidth; $x += 1) {
              $tile.SetPixel($x, $edge, $transparent)
              $tile.SetPixel($x, $cellHeight - 1 - $edge, $transparent)
            }
            for ($y = 0; $y -lt $cellHeight; $y += 1) {
              $tile.SetPixel($edge, $y, $transparent)
              $tile.SetPixel($cellWidth - 1 - $edge, $y, $transparent)
            }
          }
          $destination = Join-Path $outputRoot "$($Names[$index]).png"
          $tile.Save($destination, [System.Drawing.Imaging.ImageFormat]::Png)
          Write-Host "Generated $($Names[$index]).png ($cellWidth x $cellHeight)"
        } finally {
          $tile.Dispose()
        }
      }
    }
  } finally {
    $sheet.Dispose()
  }
}

Copy-DesignAsset -SourceName 'ChatGPT Image Aug 17, 2026, 08_23_46 PM (1).png' -OutputName 'app-icon.png'
Copy-DesignAsset -SourceName 'ChatGPT Image Aug 17, 2026, 08_23_47 PM (2).png' -OutputName 'brand-mark.png'

Split-DesignSheet `
  -SourceName 'ChatGPT Image Aug 17, 2026, 08_23_47 PM (3).png' `
  -Columns 4 `
  -Rows 3 `
  -Names @(
    'overview', 'handoff', 'settings', 'document',
    'browser-login', 'manual-entry', 'structured-data', 'database',
    'sync', 'verified', 'chevron-right', 'chevron-down'
  )

Split-DesignSheet `
  -SourceName 'ChatGPT Image Aug 17, 2026, 08_23_48 PM (4).png' `
  -Columns 3 `
  -Rows 3 `
  -Names @(
    'zepp-cloud', 'secure', 'private',
    'ai-ready', 'auto-sync', 'profile',
    'watch-device', 'ai-chip', 'cloud-output'
  )

Split-DesignSheet `
  -SourceName 'ChatGPT Image Aug 17, 2026, 08_23_48 PM (5).png' `
  -Columns 4 `
  -Rows 3 `
  -Names @(
    'sleep', 'outdoor-run', 'outdoor-cycling', 'recovery',
    'heart-rate', 'resting-heart-rate', 'training-load', 'vo2-max',
    'steps', 'health-watch', 'sleep-waves', 'body-activity'
  )

Write-Host "Design icons ready at $outputRoot"
