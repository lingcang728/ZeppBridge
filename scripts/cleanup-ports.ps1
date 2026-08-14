# ZeppBridge 端口清理脚本
# 用途：清理开发环境中被占用的端口，确保 npm run dev 能正常启动

Write-Host "正在扫描开发端口..." -ForegroundColor Cyan

# 定义需要检查的端口
$ports = @(1420, 1421, 5173, 3000, 8080, 9000, 9001)

# 获取占用这些端口的进程
$occupiedPorts = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalPort -in $ports } |
    Select-Object LocalPort, OwningProcess, @{Name="ProcessName";Expression={(Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName}}

if ($occupiedPorts) {
    Write-Host "`n发现以下端口被占用：" -ForegroundColor Yellow
    $occupiedPorts | Format-Table -AutoSize

    $response = Read-Host "`n是否终止这些进程？(y/n)"

    if ($response -eq 'y' -or $response -eq 'Y') {
        $occupiedPorts | ForEach-Object {
            try {
                Stop-Process -Id $_.OwningProcess -Force -ErrorAction Stop
                Write-Host "✓ 已终止进程 $($_.ProcessName) (PID: $($_.OwningProcess))" -ForegroundColor Green
            } catch {
                Write-Host "✗ 无法终止进程 $($_.ProcessName) (PID: $($_.OwningProcess))" -ForegroundColor Red
            }
        }

        Start-Sleep -Seconds 1
        Write-Host "`n端口清理完成！" -ForegroundColor Green
    } else {
        Write-Host "已取消操作" -ForegroundColor Yellow
    }
} else {
    Write-Host "`n✓ 所有开发端口都空闲，可以启动项目！" -ForegroundColor Green
}

# 再次检查确认
Write-Host "`n最终端口状态：" -ForegroundColor Cyan
$finalCheck = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalPort -in $ports }

if ($finalCheck) {
    $finalCheck | Select-Object LocalPort, OwningProcess, @{Name="ProcessName";Expression={(Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName}} | Format-Table -AutoSize
} else {
    Write-Host "所有端口都已释放" -ForegroundColor Green
}

Write-Host "`n现在可以运行: npm run dev" -ForegroundColor Cyan
