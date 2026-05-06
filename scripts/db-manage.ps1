#!/usr/bin/env pwsh
<#
.SYNOPSIS
    数据库管理工具 - 统一的数据库操作脚本

.DESCRIPTION
    提供数据库的启动、停止、重置、备份等管理功能
    支持 PostgreSQL（TimescaleDB）与 Redis 的统一管理
    同时提供数据库初始化脚本的静态验证入口

.PARAMETER Action
    操作类型: start, stop, reset, backup, status, logs, init, verify, seed-admin

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

.PARAMETER InitOnly
    init 操作仅执行基础初始化，不导入内置模板

.PARAMETER TemplatesOnly
    init 操作仅导入内置模板

.PARAMETER Force
    init 操作跳过确认提示

.EXAMPLE
    .\scripts\db-manage.ps1 start
    启动所有数据库服务

.EXAMPLE
    .\scripts\db-manage.ps1 init
    执行完整数据库初始化

.EXAMPLE
    .\scripts\db-manage.ps1 verify
    验证数据库整合文件、文档归档和 Docker 引用

.EXAMPLE
    .\scripts\db-manage.ps1 stop -Service postgres
    仅停止 PostgreSQL 服务

.EXAMPLE
    .\scripts\db-manage.ps1 backup -BackupPath "backups\manual"
    手动备份到指定路径

.EXAMPLE
    .\scripts\db-manage.ps1 seed-admin
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
    [ValidateSet("start", "stop", "reset", "backup", "status", "logs", "init", "verify", "seed-admin")]
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
    [switch]$SkipMigrate,

    # init 参数
    [switch]$InitOnly,
    [switch]$TemplatesOnly,
    [switch]$Force
)

# 设置错误处理
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# 脚本根目录（避免在函数内使用 $MyInvocation 导致 Path 为 $null）
$script:ScriptRoot = $PSScriptRoot
$script:ProjectRoot = Split-Path -Parent $script:ScriptRoot
$script:DatabasePath = Join-Path $script:ProjectRoot "database"
$script:InitCompleteFile = Join-Path $script:DatabasePath "database-init-complete.sql"
$script:TemplatesCompleteFile = Join-Path $script:DatabasePath "builtin-templates-complete.sql"

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
        $path = Join-Path $script:ProjectRoot $file
        if (Test-Path $path) {
            return $path
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

# 数据库整合静态验证
function Invoke-ConsolidationVerification {
    function Test-ConsolidationCondition {
        param(
            [string]$Description,
            [bool]$Condition,
            [string]$Details = ""
        )

        $script:TotalChecksForConsolidation++
        if ($Condition) {
            Write-ColorOutput "[通过] $Description" "Green"
            $script:PassedChecksForConsolidation++
            if ($Details) {
                Write-ColorOutput "       $Details" "DarkGray"
            }
        } else {
            Write-ColorOutput "[失败] $Description" "Red"
            $script:FailedChecksForConsolidation++
            if ($Details) {
                Write-ColorOutput "       $Details" "Yellow"
            }
        }
    }

    $script:TotalChecksForConsolidation = 0
    $script:PassedChecksForConsolidation = 0
    $script:FailedChecksForConsolidation = 0

    Write-ColorOutput "数据库整合静态验证" "Cyan"
    Write-ColorOutput "==================================================" "Cyan"

    $docsReport = Join-Path $script:ProjectRoot "docs/datebase/database-sql-consolidation-report.md"
    $oldReport = Join-Path $script:DatabasePath "COMPLETION_REPORT.md"
    $oldVerifyScript = Join-Path $script:DatabasePath "verify-consolidation.ps1"

    Write-ColorOutput "`n[文件结构]" "Blue"
    Test-ConsolidationCondition "完整初始化脚本存在" (Test-Path $script:InitCompleteFile) "database/database-init-complete.sql"
    Test-ConsolidationCondition "完整模板脚本存在" (Test-Path $script:TemplatesCompleteFile) "database/builtin-templates-complete.sql"
    Test-ConsolidationCondition "整合报告已归档到 docs/datebase" (Test-Path $docsReport) "docs/datebase/database-sql-consolidation-report.md"
    Test-ConsolidationCondition "database 目录不再保留旧完成报告" (-not (Test-Path $oldReport)) "COMPLETION_REPORT.md 已迁出 database/"
    Test-ConsolidationCondition "database 目录不再保留旧验证脚本" (-not (Test-Path $oldVerifyScript)) "验证功能已合并到 scripts/db-manage.ps1"
    Test-ConsolidationCondition "旧数据库脚本子目录已移除" (-not (Test-Path (Join-Path $script:ScriptRoot "database"))) "统一入口: scripts/db-manage.ps1"

    Write-ColorOutput "`n[初始化 SQL 内容]" "Blue"
    $initContent = ""
    if (Test-Path $script:InitCompleteFile) {
        $initContent = Get-Content $script:InitCompleteFile -Raw
    }
    Test-ConsolidationCondition "包含 PostgreSQL 扩展创建" ($initContent -match "CREATE EXTENSION IF NOT EXISTS") "uuid-ossp、pg_stat_statements、timescaledb"
    Test-ConsolidationCondition "包含 TimescaleDB hypertable 配置" ($initContent -match "create_hypertable") "时序表初始化"
    Test-ConsolidationCondition "包含压缩策略" ($initContent -match "add_compression_policy") "TimescaleDB 压缩策略"
    Test-ConsolidationCondition "包含保留策略" ($initContent -match "add_retention_policy") "TimescaleDB 数据保留策略"
    Test-ConsolidationCondition "包含带宽单位迁移" ($initContent -match "1000000\.0") "bps 到 Mbps 转换"

    Write-ColorOutput "`n[模板 SQL 内容]" "Blue"
    $templatesContent = ""
    if (Test-Path $script:TemplatesCompleteFile) {
        $templatesContent = Get-Content $script:TemplatesCompleteFile -Raw
    }
    $templateCount = ([regex]::Matches($templatesContent, "INSERT INTO inspection_templates")).Count
    Test-ConsolidationCondition "包含 18 个内置模板插入语句" ($templateCount -eq 18) "实际数量: $templateCount"
    foreach ($vendor in @("Cisco", "Huawei", "H3C", "Juniper", "Arista", "Fortinet")) {
        $vendorMarker = '"vendors": ["' + $vendor + '"]'
        $vendorCount = ([regex]::Matches($templatesContent, [regex]::Escape($vendorMarker))).Count
        Test-ConsolidationCondition "包含 ${vendor} 设备模板" ($vendorCount -eq 3) "实际数量: $vendorCount"
    }

    Write-ColorOutput "`n[脚本与 Docker 引用]" "Blue"
    $manageContent = if (Test-Path $PSCommandPath) { Get-Content $PSCommandPath -Raw } else { "" }
    Test-ConsolidationCondition "db-manage.ps1 提供 verify 入口" ($manageContent -match '"verify"') "统一入口: scripts/db-manage.ps1 verify"

    foreach ($composeName in @("docker-compose.dev.yml", "docker-compose.prod.yml")) {
        $composeFile = Join-Path $script:ProjectRoot $composeName
        $composeContent = if (Test-Path $composeFile) { Get-Content $composeFile -Raw } else { "" }
        Test-ConsolidationCondition "$composeName 引用完整初始化脚本" ($composeContent -match "database/database-init-complete\.sql") $composeName
        Test-ConsolidationCondition "$composeName 引用内置模板脚本" ($composeContent -match "database/builtin-templates-complete\.sql") $composeName
    }

    Write-ColorOutput "`n[验证结果]" "Blue"
    Write-ColorOutput "总检查项: $script:TotalChecksForConsolidation" "White"
    Write-ColorOutput "通过检查: $script:PassedChecksForConsolidation" "Green"
    Write-ColorOutput "失败检查: $script:FailedChecksForConsolidation" $(if ($script:FailedChecksForConsolidation -eq 0) { "Green" } else { "Red" })

    if ($script:FailedChecksForConsolidation -eq 0) {
        Write-ColorOutput "`n[成功] 数据库整合静态验证通过" "Green"
        return
    }

    throw "数据库整合静态验证未通过"
}

function Invoke-DatabaseSql {
    param(
        [PSCustomObject]$Connection,
        [string]$Command,
        [string]$File
    )

    if ($Connection.UseDocker) {
        if ($File) {
            $sqlContent = Get-Content $File -Raw
            return $sqlContent | docker exec -i $Connection.DockerContainer psql -U $Connection.User -d $Connection.Database 2>&1
        }
        return docker exec -i $Connection.DockerContainer psql -U $Connection.User -d $Connection.Database -c $Command 2>&1
    }

    if ($File) {
        return psql -h $Connection.Host -p $Connection.Port -U $Connection.User -d $Connection.Database -f $File 2>&1
    }
    return psql -h $Connection.Host -p $Connection.Port -U $Connection.User -d $Connection.Database -c $Command 2>&1
}

function Get-DatabaseConnection {
    $dockerContainer = "inspect-postgres-dev"
    $useDocker = $false

    if (-not (Get-Command "psql" -ErrorAction SilentlyContinue)) {
        Write-ColorOutput "[信息] 未检测到本地 psql 命令，尝试使用 Docker..." "Blue"
        if (-not (Get-Command "docker" -ErrorAction SilentlyContinue)) {
            throw "未检测到 psql 或 docker 命令，请安装 PostgreSQL 客户端或 Docker"
        }

        $containerStatus = docker ps --filter "name=$dockerContainer" --format "{{.Names}}" 2>&1
        if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($containerStatus)) {
            throw "Docker 容器 '$dockerContainer' 未运行，请先启动数据库容器"
        }

        Write-ColorOutput "[信息] 将使用 Docker 容器执行 SQL 命令" "Blue"
        $useDocker = $true
    }

    $envFile = Join-Path $script:ProjectRoot ".env"
    if (-not (Test-Path $envFile)) {
        $envFile = Join-Path $script:ProjectRoot ".env.development"
    }

    $dbHost = "localhost"
    $dbPort = "15500"
    $dbName = "inspect_system_dev"
    $dbUser = "inspect_dev"
    $dbPassword = "dev_password_2024"

    if ($useDocker) {
        $dbHost = "localhost"
        $dbPort = "5432"
    }

    if (Test-Path $envFile) {
        Write-ColorOutput "[信息] 读取环境文件: $envFile" "Blue"
        foreach ($line in (Get-Content $envFile)) {
            if ($line -match "^DB_HOST=(.+)$") { $dbHost = $matches[1] }
            if ($line -match "^DB_PORT=(.+)$") { $dbPort = $matches[1] }
            if ($line -match "^DB_NAME=(.+)$") { $dbName = $matches[1] }
            if ($line -match "^DB_USER=(.+)$") { $dbUser = $matches[1] }
            if ($line -match "^DB_PASSWORD=(.+)$") { $dbPassword = $matches[1] }
        }
    } else {
        Write-ColorOutput "[警告] 未找到 .env 文件，使用默认配置" "Yellow"
    }

    [PSCustomObject]@{
        UseDocker       = $useDocker
        DockerContainer = $dockerContainer
        Host            = $dbHost
        Port            = $dbPort
        Database        = $dbName
        User            = $dbUser
        Password        = $dbPassword
    }
}

# 初始化数据库
function Initialize-Database {
    Write-ColorOutput "`n🔧 初始化数据库..." "Blue"

    if (-not (Test-Path $script:InitCompleteFile)) {
        throw "找不到完整初始化文件: $script:InitCompleteFile"
    }
    if (-not (Test-Path $script:TemplatesCompleteFile)) {
        throw "找不到完整模板文件: $script:TemplatesCompleteFile"
    }

    Write-ColorOutput "📋 执行数据库初始化..." "Cyan"
    Write-ColorOutput "  - 基础配置（用户、权限、扩展）" "Gray"
    Write-ColorOutput "  - TimescaleDB 时序数据库配置" "Gray"
    Write-ColorOutput "  - 内置巡检模板（18个厂商模板）" "Gray"
    Write-ColorOutput "  - 测试数据种子" "Gray"

    $connection = Get-DatabaseConnection
    $env:PGPASSWORD = $connection.Password

    try {
        Write-ColorOutput "数据库连接信息:" "Cyan"
        if ($connection.UseDocker) {
            Write-ColorOutput "  连接方式: Docker 容器 ($($connection.DockerContainer))" "Gray"
        } else {
            Write-ColorOutput "  连接方式: 本地 psql" "Gray"
            Write-ColorOutput "  主机: $($connection.Host)" "Gray"
            Write-ColorOutput "  端口: $($connection.Port)" "Gray"
        }
        Write-ColorOutput "  数据库: $($connection.Database)" "Gray"
        Write-ColorOutput "  用户: $($connection.User)" "Gray"

        if (-not $Force) {
            $confirmation = Read-Host "确认执行数据库初始化？(y/N)"
            if ($confirmation -ne "y" -and $confirmation -ne "Y") {
                Write-ColorOutput "操作已取消" "Yellow"
                return
            }
        }

        Write-ColorOutput "[信息] 测试数据库连接..." "Blue"
        $testResult = Invoke-DatabaseSql -Connection $connection -Command "SELECT 1;"
        if ($LASTEXITCODE -ne 0) {
            throw "数据库连接失败: $testResult"
        }
        Write-ColorOutput "[成功] 数据库连接正常" "Green"

        if (-not $TemplatesOnly) {
            Write-ColorOutput "[信息] 执行基础数据库初始化..." "Blue"
            $result = Invoke-DatabaseSql -Connection $connection -File $script:InitCompleteFile
            if ($LASTEXITCODE -ne 0) {
                throw "基础初始化失败: $result"
            }
            Write-ColorOutput "[成功] 基础数据库初始化完成" "Green"
        }

        if (-not $InitOnly) {
            Write-ColorOutput "[信息] 执行内置模板初始化..." "Blue"
            $result = Invoke-DatabaseSql -Connection $connection -File $script:TemplatesCompleteFile
            if ($LASTEXITCODE -ne 0) {
                throw "模板初始化失败: $result"
            }
            Write-ColorOutput "[成功] 内置模板初始化完成" "Green"
        }

        Write-ColorOutput "[信息] 验证初始化结果..." "Blue"
        $tableCheck = Invoke-DatabaseSql -Connection $connection -Command "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';"
        if ($LASTEXITCODE -eq 0) {
            $tableCount = ($tableCheck | Select-String -Pattern "\d+" | Select-Object -First 1).Matches.Value
            if ($tableCount) {
                Write-ColorOutput "  数据库表数量: $tableCount" "Gray"
            }
        }

        if (-not $InitOnly) {
            $templateCheck = Invoke-DatabaseSql -Connection $connection -Command "SELECT COUNT(*) FROM inspection_templates WHERE is_default = true;"
            if ($LASTEXITCODE -eq 0) {
                $templateCount = ($templateCheck | Select-String -Pattern "\d+" | Select-Object -First 1).Matches.Value
                if ($templateCount) {
                    Write-ColorOutput "  内置模板数量: $templateCount" "Gray"
                }
            }
        }

        Write-ColorOutput "✅ 数据库初始化完成" "Green"
    }
    finally {
        Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    }
}

# 验证数据库整合状态
function Verify-DatabaseConsolidation {
    Write-ColorOutput "`n🔍 验证数据库整合状态..." "Blue"
    Invoke-ConsolidationVerification
    Write-ColorOutput "✅ 数据库整合验证完成" "Green"
}

# 初始化默认管理员账号与 RBAC（原独立脚本已合并到此处）
function Seed-AdminUser {
    Write-ColorOutput "`n👤 初始化默认管理员账号与权限..." "Blue"

    if (-not (Get-Command "go" -ErrorAction SilentlyContinue)) {
        throw "未检测到 Go 环境，请先安装 Go（用于执行 backend-go/cmd/seed）"
    }

    # 计算项目根目录
    $projectRoot = $script:ProjectRoot
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
            "verify" { Verify-DatabaseConsolidation }
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
