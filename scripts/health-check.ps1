# 系统清理和健康检查脚本

Write-Host "`n=== ZeppBridge 系统健康检查 ===" -ForegroundColor Cyan
Write-Host ""

# 1. 检查开发端口
Write-Host "1. 开发端口扫描..." -ForegroundColor Yellow
$devPorts = @(1420, 1421, 3000, 3001, 4200, 5000, 5173, 8000, 8080, 8888, 9000, 9001)
$occupied = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalPort -in $devPorts } |
    Select-Object LocalPort, OwningProcess, @{Name="ProcessName";Expression={(Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName}}

if ($occupied) {
    Write-Host "   发现占用的端口：" -ForegroundColor Yellow
    $occupied | Format-Table -AutoSize
} else {
    Write-Host "   ✓ 所有开发端口都空闲" -ForegroundColor Green
}

# 2. 检查开发进程
Write-Host "`n2. 开发进程扫描..." -ForegroundColor Yellow
$devProcesses = Get-Process -Name node, npm, python, ruby, php, vite, yarn, pnpm -ErrorAction SilentlyContinue |
    Where-Object { $_.ProcessName -ne 'node' -or (Get-CimInstance Win32_Process -Filter "ProcessId = $($_.Id)").CommandLine -notmatch 'Adobe' }

if ($devProcesses) {
    Write-Host "   发现开发进程：" -ForegroundColor Yellow
    $devProcesses | Select-Object Id, ProcessName, @{Name="Memory(MB)";Expression={[math]::Round($_.WorkingSet64/1MB,2)}}, StartTime | Format-Table -AutoSize
} else {
    Write-Host "   ✓ 没有开发进程运行（Adobe等系统进程已排除）" -ForegroundColor Green
}

# 3. 检查孤儿进程
Write-Host "`n3. 孤儿进程扫描..." -ForegroundColor Yellow
$allProcesses = Get-CimInstance Win32_Process
$devProcs = $allProcesses | Where-Object { $_.Name -match 'node|npm|python|ruby|php|vite|yarn|pnpm' -and $_.CommandLine -notmatch 'Adobe' }
$orphans = @()

foreach ($proc in $devProcs) {
    $parent = $allProcesses | Where-Object { $_.ProcessId -eq $proc.ParentProcessId }
    if (-not $parent -and $proc.ParentProcessId -ne 0) {
        $orphans += [PSCustomObject]@{
            PID = $proc.ProcessId
            Name = $proc.Name
            ParentPID = $proc.ParentProcessId
            CommandLine = $proc.CommandLine
        }
    }
}

if ($orphans) {
    Write-Host "   发现孤儿进程：" -ForegroundColor Red
    $orphans | Format-Table -AutoSize -Wrap
} else {
    Write-Host "   ✓ 没有发现孤儿进程" -ForegroundColor Green
}

# 4. PowerShell配置检查
Write-Host "`n4. PowerShell配置..." -ForegroundColor Yellow
if (Test-Path $profile) {
    Write-Host "   ✓ Profile文件存在: $profile" -ForegroundColor Green
    $profileContent = Get-Content $profile -Raw
    if ($profileContent -match 'Clear-DevPorts') {
        Write-Host "   ✓ 端口清理函数已配置" -ForegroundColor Green
    } else {
        Write-Host "   ✗ 端口清理函数未配置" -ForegroundColor Red
    }
} else {
    Write-Host "   ✗ Profile文件不存在" -ForegroundColor Red
}

# 5. npm配置检查
Write-Host "`n5. npm配置..." -ForegroundColor Yellow
$npmFg = npm config get foreground-scripts
$npmShell = npm config get script-shell
Write-Host "   foreground-scripts: $npmFg" -ForegroundColor Gray
Write-Host "   script-shell: $npmShell" -ForegroundColor Gray

# 6. 总结
Write-Host "`n=== 总结 ===" -ForegroundColor Cyan
$issues = 0

if ($occupied) { $issues++ }
if ($orphans) { $issues++ }

if ($issues -eq 0) {
    Write-Host "✓ 系统状态良好，没有发现问题" -ForegroundColor Green
    Write-Host "✓ 可以正常运行: npm run dev" -ForegroundColor Green
} else {
    Write-Host "⚠ 发现 $issues 个问题" -ForegroundColor Yellow
    Write-Host "建议运行清理命令或重启相关进程" -ForegroundColor Yellow
}

Write-Host ""
