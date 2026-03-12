#!/usr/bin/env pwsh
<#
.SYNOPSIS
    数据库管理工具 - 统一的数据库操作脚本

.DESCRIPTION
    提供数据库的启动、停止、重置、备份等管理功能
    支持 PostgreSQL（TimescaleDB）与 Redis 的统一管理

.PARAMETER Action
    操作类型: start, stop, reset, backup, status, logs, init, seed-admin

.PARAMETER Service
    指定服务: postgres, redis, all (默认)

.PARAMETER BackupPath
    备份文件路径 (仅用于 backup 操作)

.PARAMETER Username
    seed-admin 操作的用户名（默认: admin）

.PARAMETER Password
    seed-admin 操作的密码（默认: admin123）

.PARAMETER Email
    seed-admin 操作的邮箱（默认: admin@admin.com）

.PARAMETER Role
    seed-admin 操作的角色（默认: superadmin；后端会映射到实际角色）

.PARAMETER FullName
    seed-admin 操作的显示名（默认: 系统管理员）

.PARAMETER SkipMigrate
    seed-admin 操作是否跳过数据库迁移（不推荐）

.EXAMPLE
    .\db-manage.ps1 start
    启动所有数据库服务

.EXAMPLE
    .\db-manage.ps1 init
    执行完整数据库初始化

.EXAMPLE
    .\db-manage.ps1 stop -Service postgres
    仅停止 PostgreSQL 服务

.EXAMPLE
    .\db-manage.ps1 backup -BackupPath "backups\manual"
    手动备份到指定路径

.EXAMPLE
    .\db-manage.ps1 seed-admin
    初始化默认管理员账号与 RBAC 权限数据

.NOTES
    文件名: db-manage.ps1
    作者: 技术团队
    版本: 1.0.0
    创建日期: 2025-12-10
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet("start", "stop", "reset", "backup", "status", "logs", "init", "seed-admin")]
    [string]$Action,
    
    [ValidateSet("postgres", "redis", "all")]
    [string]$Service = "all",
    
    [string]$BackupPath = "backups",

    # seed-admin 参数
    [string]$Username = "admin",
    [string]$Password = "admin123",
    [string]$Email = "admin@admin.com",
    [string]$Role = "superadmin",
    [string]$FullName = "系统管理员",
    [switch]$SkipMigrate
)

# 设置错误处理
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# 脚本根目录（避免在函数内使用 $MyInvocation 导致 Path 为 $null）
$script:ScriptRoot = $PSScriptRoot

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
        "Gray" = [ConsoleColor]::DarkGray
        "DarkGray" = [ConsoleColor]::DarkGray
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
        "postgres" = @("postgres")
        "redis" = @("redis")
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

# 初始化数据库
function Initialize-Database {
    Write-ColorOutput "`n🔧 初始化数据库..." "Blue"
    
    # 获取脚本路径
    $scriptPath = $script:ScriptRoot
    $initScript = Join-Path $scriptPath "db-init-complete.ps1"
    
    if (-not (Test-Path $initScript)) {
        Write-ColorOutput "❌ 找不到初始化脚本: $initScript" "Red"
        throw "初始化脚本不存在"
    }
    
    Write-ColorOutput "📋 执行完整数据库初始化..." "Cyan"
    Write-ColorOutput "  - 基础配置（用户、权限、扩展）" "Gray"
    Write-ColorOutput "  - TimescaleDB 时序数据库配置" "Gray"
    Write-ColorOutput "  - 内置巡检模板（18个厂商模板）" "Gray"
    Write-ColorOutput "  - 测试数据种子" "Gray"
    
    try {
        # 执行初始化脚本
        & $initScript -Force
        Write-ColorOutput "✅ 数据库初始化完成" "Green"
    }
    catch {
        Write-ColorOutput "❌ 数据库初始化失败: $($_.Exception.Message)" "Red"
        throw
    }
}

# 初始化默认管理员账号与 RBAC（原独立脚本已合并到此处）
function Seed-AdminUser {
    Write-ColorOutput "`n👤 初始化默认管理员账号与权限..." "Blue"

    if (-not (Get-Command "go" -ErrorAction SilentlyContinue)) {
        throw "未检测到 Go 环境，请先安装 Go（用于执行 backend-go/cmd/seed）"
    }

    # 计算项目根目录
    $scriptsRoot = Split-Path -Parent $script:ScriptRoot
    $projectRoot = Split-Path -Parent $scriptsRoot
    $backendPath = Join-Path $projectRoot "backend-go"
    if (-not (Test-Path $backendPath)) {
        throw "未找到后端目录: $backendPath"
    }

    # 选择环境文件（优先 .env）
    $envFile = Join-Path $projectRoot ".env"
    if (-not (Test-Path $envFile)) {
        $envFile = Join-Path $projectRoot ".env.development"
    }
    if (Test-Path $envFile) {
        $env:ENV_FILE = $envFile
        Write-ColorOutput "使用环境文件: $envFile" "Gray"
    } else {
        Write-ColorOutput "⚠️ 未找到 .env/.env.development，将使用后端默认配置（可能连接不到数据库）" "Yellow"
    }

    # 兼容受限环境：将 Go 编译缓存放到项目目录，避免写入用户目录失败
    $goCacheRoot = Join-Path $projectRoot ".gocache"
    $goBuildCache = Join-Path $goCacheRoot "build"
    $goTmpDir = Join-Path $goCacheRoot "tmp"
    New-Item -ItemType Directory -Force -Path $goBuildCache, $goTmpDir | Out-Null
    $env:GOCACHE = $goBuildCache
    $env:GOTMPDIR = $goTmpDir

    Push-Location $backendPath
    try {
        $args = @(
            "run",
            "./cmd/seed",
            "--username", $Username,
            "--password", $Password,
            "--email", $Email,
            "--role", $Role,
            "--full-name", $FullName
        )
        if ($SkipMigrate) {
            $args += "--skip-migrate"
        }

        Write-ColorOutput "执行: go $($args -join ' ')" "DarkGray"
        & go @args
        if ($LASTEXITCODE -ne 0) {
            throw "初始化失败，退出代码: $LASTEXITCODE"
        }

        Write-ColorOutput "✅ 初始化完成，可使用 $Username / $Password 登录" "Green"
    }
    finally {
        Pop-Location
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

# 获取 Docker 容器映射到宿主机的端口（优先使用实际映射，其次读取环境变量，最后使用默认值）
function Get-HostPort {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ContainerName,

        [Parameter(Mandatory = $true)]
        [int]$ContainerPort,

        [Parameter(Mandatory = $true)]
        [string]$EnvVarName,

        [Parameter(Mandatory = $true)]
        [int]$DefaultPort
    )

    # 1) 优先从当前 Docker 实际端口映射中解析（避免环境变量未同步导致显示错误）
    try {
        if (Get-Command "docker" -ErrorAction SilentlyContinue) {
            $mapping = docker port $ContainerName "$ContainerPort/tcp" 2>$null
            if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($mapping)) {
                foreach ($line in ($mapping -split "`r?`n")) {
                    $trimmed = $line.Trim()
                    if ($trimmed -match ":(\\d+)\\s*$") {
                        return [int]$matches[1]
                    }
                }
            }
        }
    } catch {
        # 忽略解析失败，进入后续回退逻辑
    }

    # 2) 回退：读取环境变量（docker-compose.dev.yml 使用 POSTGRES_HOST_PORT/REDIS_HOST_PORT 覆盖）
    try {
        $raw = [System.Environment]::GetEnvironmentVariable($EnvVarName)
        $parsed = 0
        if (-not [string]::IsNullOrWhiteSpace($raw) -and [int]::TryParse($raw, [ref]$parsed)) {
            return $parsed
        }
    } catch {
        # 忽略
    }

    # 3) 最后回退：默认端口
    return $DefaultPort
}

# 显示服务信息
function Show-ServiceInfo {
    $postgresHostPort = Get-HostPort -ContainerName "inspect-postgres-dev" -ContainerPort 5432 -EnvVarName "POSTGRES_HOST_PORT" -DefaultPort 15500
    $redisHostPort = Get-HostPort -ContainerName "inspect-redis-dev" -ContainerPort 6379 -EnvVarName "REDIS_HOST_PORT" -DefaultPort 16380

    Write-ColorOutput "`n📊 服务访问地址:" "Blue"
    Write-ColorOutput "  🗄️ PostgreSQL: localhost:$postgresHostPort" "White"
    Write-ColorOutput "    - 用户名: inspect_dev" "Gray"
    Write-ColorOutput "    - 密码: dev_password_2024" "Gray"
    Write-ColorOutput "    - 数据库: inspect_system_dev" "Gray"
    Write-ColorOutput "  🔴 Redis: localhost:$redisHostPort" "White"
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
            "init" { Initialize-Database }
            "seed-admin" { Seed-AdminUser }
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
