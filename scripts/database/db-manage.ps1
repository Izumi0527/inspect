#!/usr/bin/env pwsh
<#
.SYNOPSIS
    数据库管理工具 - 统一的数据库操作脚本

.DESCRIPTION
    提供数据库的启动、停止、重置、备份等管理功能
    支持 PostgreSQL（TimescaleDB）与 Redis 的统一管理

.PARAMETER Action
    操作类型: start, stop, reset, backup, status, logs

.PARAMETER Service
    指定服务: postgres, redis, all (默认)

.PARAMETER BackupPath
    备份文件路径 (仅用于 backup 操作)

.EXAMPLE
    .\db-manage.ps1 start
    启动所有数据库服务

.EXAMPLE
    .\db-manage.ps1 stop -Service postgres
    仅停止 PostgreSQL 服务

.EXAMPLE
    .\db-manage.ps1 backup -BackupPath "backups\manual"
    手动备份到指定路径

.NOTES
    文件名: db-manage.ps1
    作者: 技术团队
    版本: 1.0.0
    创建日期: 2025-12-10
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet("start", "stop", "reset", "backup", "status", "logs")]
    [string]$Action,
    
    [ValidateSet("postgres", "redis", "all")]
    [string]$Service = "all",
    
    [string]$BackupPath = "backups"
)

# 设置错误处理
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# 颜色输出函数
function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    
    $colorMap = @{
        "Red" = [ConsoleColor]::Red
        "Green" = [ConsoleColor]::Green
        "Yellow" = [ConsoleColor]::Yellow
        "Blue" = [ConsoleColor]::Blue
        "Cyan" = [ConsoleColor]::Cyan
        "Magenta" = [ConsoleColor]::Magenta
        "White" = [ConsoleColor]::White
    }
    
    Write-Host $Message -ForegroundColor $colorMap[$Color]
}

# 执行命令函数
function Invoke-CommandSafely {
    param(
        [string]$Command,
        [string]$Description,
        [switch]$IgnoreErrors
    )
    
    Write-ColorOutput "执行: $Command" "Cyan"
    
    try {
        $result = Invoke-Expression $Command
        if ($LASTEXITCODE -eq 0 -or $null -eq $LASTEXITCODE) {
            if ($Description) {
                Write-ColorOutput "✅ $Description" "Green"
            }
            return $result
        } else {
            throw "命令执行失败，退出代码: $LASTEXITCODE"
        }
    }
    catch {
        if ($IgnoreErrors) {
            Write-ColorOutput "⚠️ $Description 失败: $($_.Exception.Message)" "Yellow"
            return $null
        } else {
            Write-ColorOutput "❌ $Description 失败: $($_.Exception.Message)" "Red"
            throw
        }
    }
}

# 获取 Docker Compose 文件
function Get-ComposeFile {
    $composeFiles = @(
        "docker-compose.db.yml",
        "docker-compose.dev.yml",
        "docker-compose.yml"
    )
    
    foreach ($file in $composeFiles) {
        if (Test-Path $file) {
            return $file
        }
    }
    
    throw "未找到 Docker Compose 配置文件"
}

# 获取服务名称映射
function Get-ServiceNames {
    param([string]$Service)
    
    $serviceMap = @{
        "postgres" = @("postgres", "postgres-dev", "inspect-postgres-dev")
        "redis" = @("redis", "redis-dev", "inspect-redis-dev")
    }
    
    if ($Service -eq "all") {
        return @()  # 空数组表示所有服务
    }
    
    return $serviceMap[$Service]
}

# 启动数据库服务
function Start-DatabaseServices {
    Write-ColorOutput "`n🚀 启动数据库服务..." "Blue"
    
    $composeFile = Get-ComposeFile
    $serviceNames = Get-ServiceNames $Service
    
    if ($serviceNames.Count -eq 0) {
        # 启动所有服务
        Invoke-CommandSafely "docker-compose -f $composeFile up -d" "启动所有数据库服务"
    } else {
        # 启动指定服务
        $serviceList = $serviceNames -join " "
        Invoke-CommandSafely "docker-compose -f $composeFile up -d $serviceList" "启动 $Service 服务"
    }
    
    Write-ColorOutput "✅ 数据库服务已启动" "Green"
    
    # 显示服务访问信息
    Show-ServiceInfo
}

# 停止数据库服务
function Stop-DatabaseServices {
    Write-ColorOutput "`n🛑 停止数据库服务..." "Blue"
    
    $composeFile = Get-ComposeFile
    $serviceNames = Get-ServiceNames $Service
    
    if ($serviceNames.Count -eq 0) {
        # 停止所有服务
        Invoke-CommandSafely "docker-compose -f $composeFile down" "停止所有数据库服务"
    } else {
        # 停止指定服务
        foreach ($serviceName in $serviceNames) {
            Invoke-CommandSafely "docker-compose -f $composeFile stop $serviceName" "停止 $serviceName 服务" -IgnoreErrors
        }
    }
    
    Write-ColorOutput "✅ 数据库服务已停止" "Green"
}

# 重置数据库
function Reset-DatabaseServices {
    Write-ColorOutput "`n🔄 重置数据库..." "Blue"
    Write-ColorOutput "⚠️ 警告: 此操作将删除所有数据！" "Yellow"
    
    $confirmation = Read-Host "确认重置数据库? (y/N)"
    if ($confirmation -ne "y" -and $confirmation -ne "Y") {
        Write-ColorOutput "操作已取消" "Yellow"
        return
    }
    
    $composeFile = Get-ComposeFile
    
    # 停止并删除容器和卷
    Invoke-CommandSafely "docker-compose -f $composeFile down -v" "停止服务并删除数据卷"
    
    # 重新启动服务
    Invoke-CommandSafely "docker-compose -f $composeFile up -d" "重新启动数据库服务"
    
    Write-ColorOutput "✅ 数据库已重置" "Green"
    
    # 等待服务启动
    Write-ColorOutput "⏳ 等待服务启动..." "Yellow"
    Start-Sleep -Seconds 10
    
    Show-ServiceInfo
}

# 备份数据库
function Backup-DatabaseServices {
    Write-ColorOutput "`n💾 备份数据库..." "Blue"
    
    # 创建备份目录
    if (-not (Test-Path $BackupPath)) {
        New-Item -ItemType Directory -Path $BackupPath -Force | Out-Null
    }
    
    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    
    try {
        # 备份 PostgreSQL
        if ($Service -eq "all" -or $Service -eq "postgres") {
            Write-ColorOutput "📊 备份 PostgreSQL..." "Cyan"
            $pgBackupFile = Join-Path $BackupPath "postgres_backup_$timestamp.sql"
            
            # 尝试不同的容器名称
            $containerNames = @("inspect-postgres-dev", "postgres-dev", "postgres")
            $backupSuccess = $false
            
            foreach ($containerName in $containerNames) {
                try {
                    $containerExists = docker ps --format "table {{.Names}}" | Select-String $containerName
                    if ($containerExists) {
                        Invoke-CommandSafely "docker exec $containerName pg_dump -U inspect_dev inspect_system_dev > `"$pgBackupFile`"" "备份 PostgreSQL 到 $pgBackupFile"
                        $backupSuccess = $true
                        break
                    }
                }
                catch {
                    continue
                }
            }
            
            if (-not $backupSuccess) {
                Write-ColorOutput "⚠️ PostgreSQL 容器未运行或备份失败" "Yellow"
            }
        }
        
        # 备份 Redis
        if ($Service -eq "all" -or $Service -eq "redis") {
            Write-ColorOutput "🔴 备份 Redis..." "Cyan"
            $redisBackupFile = Join-Path $BackupPath "redis_backup_$timestamp.rdb"
            
            $containerNames = @("inspect-redis-dev", "redis-dev", "redis")
            $backupSuccess = $false
            
            foreach ($containerName in $containerNames) {
                try {
                    $containerExists = docker ps --format "table {{.Names}}" | Select-String $containerName
                    if ($containerExists) {
                        Invoke-CommandSafely "docker exec $containerName redis-cli -a dev_redis_2024 --rdb /tmp/dump.rdb" "创建 Redis 备份"
                        Invoke-CommandSafely "docker cp $containerName`:/tmp/dump.rdb `"$redisBackupFile`"" "复制 Redis 备份文件"
                        $backupSuccess = $true
                        break
                    }
                }
                catch {
                    continue
                }
            }
            
            if (-not $backupSuccess) {
                Write-ColorOutput "⚠️ Redis 容器未运行或备份失败" "Yellow"
            }
        }
        
        Write-ColorOutput "✅ 数据库备份完成: $BackupPath" "Green"
        
        # 显示备份文件
        $backupFiles = Get-ChildItem -Path $BackupPath -Filter "*$timestamp*"
        if ($backupFiles) {
            Write-ColorOutput "`n📁 备份文件:" "Blue"
            foreach ($file in $backupFiles) {
                Write-ColorOutput "  - $($file.Name)" "White"
            }
        }
    }
    catch {
        Write-ColorOutput "❌ 备份过程中发生错误: $($_.Exception.Message)" "Red"
        throw
    }
}

# 显示服务状态
function Show-ServiceStatus {
    Write-ColorOutput "`n📊 数据库服务状态:" "Blue"
    
    $composeFile = Get-ComposeFile
    Invoke-CommandSafely "docker-compose -f $composeFile ps" "获取服务状态"
    
    # 显示容器健康状态
    Write-ColorOutput "`n🏥 容器健康状态:" "Blue"
    $containers = docker ps --format "table {{.Names}}\t{{.Status}}" | Select-String -Pattern "(postgres|redis)"
    
    if ($containers) {
        foreach ($container in $containers) {
            Write-ColorOutput "  $container" "White"
        }
    } else {
        Write-ColorOutput "  没有运行中的数据库容器" "Yellow"
    }
}

# 显示服务日志
function Show-ServiceLogs {
    Write-ColorOutput "`n📋 数据库服务日志:" "Blue"
    
    $composeFile = Get-ComposeFile
    $serviceNames = Get-ServiceNames $Service
    
    if ($serviceNames.Count -eq 0) {
        # 显示所有服务日志
        Invoke-CommandSafely "docker-compose -f $composeFile logs --tail=50" "获取所有服务日志"
    } else {
        # 显示指定服务日志
        $serviceList = $serviceNames -join " "
        Invoke-CommandSafely "docker-compose -f $composeFile logs --tail=50 $serviceList" "获取 $Service 服务日志"
    }
}

# 显示服务访问信息
function Show-ServiceInfo {
    Write-ColorOutput "`n📊 服务访问地址:" "Blue"
    Write-ColorOutput "  🗄️ PostgreSQL: localhost:5433" "White"
    Write-ColorOutput "    - 用户名: inspect_dev" "Gray"
    Write-ColorOutput "    - 密码: dev_password_2024" "Gray"
    Write-ColorOutput "    - 数据库: inspect_system_dev" "Gray"
    Write-ColorOutput "  🔴 Redis: localhost:6380" "White"
    Write-ColorOutput "    - 密码: dev_redis_2024" "Gray"
    Write-ColorOutput "  🔧 pgAdmin: http://localhost:5050" "White"
    Write-ColorOutput "  🔧 Redis Commander: http://localhost:8081" "White"
}

# 主执行函数
function Main {
    try {
        Write-ColorOutput "🗄️ 数据库管理工具" "Green"
        Write-ColorOutput "操作: $Action, 服务: $Service" "Cyan"
        Write-ColorOutput "$('=' * 50)" "Cyan"
        
        switch ($Action) {
            "start" { Start-DatabaseServices }
            "stop" { Stop-DatabaseServices }
            "reset" { Reset-DatabaseServices }
            "backup" { Backup-DatabaseServices }
            "status" { Show-ServiceStatus }
            "logs" { Show-ServiceLogs }
        }
        
        Write-ColorOutput "`n✅ 操作完成" "Green"
    }
    catch {
        Write-ColorOutput "`n❌ 操作失败: $($_.Exception.Message)" "Red"
        Write-ColorOutput "请检查 Docker 服务是否正常运行" "Yellow"
        exit 1
    }
}

# 执行主函数
Main
