# ZeppBridge 开发环境启动脚本
# 自动检查端口、清理冲突、启动开发服务器

Write-Host "=== ZeppBridge 开发环境启动 ===" -ForegroundColor Cyan

# 检查端口占用
$ports = @(1420, 1421, 5173)
$occupied = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in $ports }

if ($occupied) {
    Write-Host "`n检测到端口被占用，正在清理..." -ForegroundColor Yellow
    $occupied | ForEach-Object {
        $processInfo = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
        Write-Host "终止进程: $($processInfo.ProcessName) (PID: $($_.OwningProcess), 端口: $($_.LocalPort))"
        Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
}

Write-Host "`n启动开发服务器..." -ForegroundColor Green
Set-Location $PSScriptRoot\..
npm run dev
