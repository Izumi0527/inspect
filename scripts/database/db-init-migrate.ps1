# 企业级网络设备巡检系统 - 数据库初始化和迁移脚本 (PowerShell 版本)
# 支持 PostgreSQL、Redis、InfluxDB 三种数据库的完整管理

param(
    [switch]$Init,
    [switch]$Migrate,
    [string]$CreateMigration,
    [switch]$ImportData,
    [switch]$Backup,
    [switch]$Restore,
    [switch]$Status,
    [switch]$Clean,
    [switch]$HealthCheck,
    [switch]$SkipTestDevices,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

# 全局变量
$script:ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:ScriptsRoot = Split-Path -Parent $script:ScriptPath
$script:ProjectRoot = Split-Path -Parent $script:ScriptsRoot
$script:BackendPath = Join-Path $script:ProjectRoot "backend"
$script:LogPath = Join-Path $script:ProjectRoot "logs\database"
$script:BackupPath = Join-Path $script:ProjectRoot "backups"

# 数据库配置（从环境变量或配置文件读取）
$script:DatabaseConfig = @{
    PostgreSQL = @{
        Container = "inspect-postgres-dev"
        Host = "localhost"
        Port = 5433
        Database = "inspect_system_dev"
        User = "inspect_dev"
        Password = "dev_password_2024"
        URL = "postgresql+asyncpg://inspect_dev:dev_password_2024@localhost:5433/inspect_system_dev"
    }
    Redis = @{
        Container = "inspect-redis-dev"
        Host = "localhost"
        Port = 6380
        Password = "dev_redis_2024"
        URL = "redis://:dev_redis_2024@localhost:6380/0"
    }
    InfluxDB = @{
        Container = "inspect-influxdb-dev"
        Host = "localhost"
        Port = 8087
        Token = "dev_token_2024"
        Org = "inspect_dev"
        Bucket = "device_metrics_dev"
        URL = "http://localhost:8087"
    }
}

# 初始化UTF-8日志文件
function Initialize-LogFile {
    param([string]$LogFilePath)
    
    try {
        # 确保父目录存在
        $parentDir = Split-Path $LogFilePath -Parent
        if (-not (Test-Path $parentDir)) {
            New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
        }
        
        # 如果日志文件不存在，创建并添加UTF-8 BOM
        if (-not (Test-Path $LogFilePath)) {
            $utf8Bom = [System.Text.Encoding]::UTF8
            $header = "# 企业级网络设备巡检系统 - 数据库管理日志`r`n# 创建时间: $(Get-Date)`r`n`r`n"
            [System.IO.File]::WriteAllText($LogFilePath, $header, $utf8Bom)
        }
    } catch {
        # 忽略日志文件初始化错误
    }
}

# 日志函数
function Write-LogInfo {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] [信息] $Message"
    
    # 简化输出方法，直接使用Write-Host
    Write-Host "🔍 $Message" -ForegroundColor Blue
    
    # 只有当日志文件路径已初始化时才写入文件
    if ($script:LogFile -and (Test-Path (Split-Path $script:LogFile -Parent))) {
        try {
            # 确保使用UTF-8编码写入日志文件
            [System.IO.File]::AppendAllText($script:LogFile, $logMessage + "`r`n", [System.Text.Encoding]::UTF8)
        } catch {
            # 如果写入失败，静默忽略
        }
    }
}

function Write-LogSuccess {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] [成功] $Message"
    
    # 简化输出方法，直接使用Write-Host
    Write-Host "✅ $Message" -ForegroundColor Green
    
    # 只有当日志文件路径已初始化时才写入文件
    if ($script:LogFile -and (Test-Path (Split-Path $script:LogFile -Parent))) {
        try {
            # 确保使用UTF-8编码写入日志文件
            [System.IO.File]::AppendAllText($script:LogFile, $logMessage + "`r`n", [System.Text.Encoding]::UTF8)
        } catch {
            # 如果写入失败，静默忽略
        }
    }
}

function Write-LogWarning {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] [警告] $Message"
    
    # 简化输出方法，直接使用Write-Host
    Write-Host "⚠️ $Message" -ForegroundColor Yellow
    
    # 只有当日志文件路径已初始化时才写入文件
    if ($script:LogFile -and (Test-Path (Split-Path $script:LogFile -Parent))) {
        try {
            # 确保使用UTF-8编码写入日志文件
            [System.IO.File]::AppendAllText($script:LogFile, $logMessage + "`r`n", [System.Text.Encoding]::UTF8)
        } catch {
            # 如果写入失败，静默忽略
        }
    }
}

function Write-LogError {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] [错误] $Message"
    
    # 简化输出方法，直接使用Write-Host
    Write-Host "❌ $Message" -ForegroundColor Red
    
    # 只有当日志文件路径已初始化时才写入文件
    if ($script:LogFile -and (Test-Path (Split-Path $script:LogFile -Parent))) {
        try {
            # 确保使用UTF-8编码写入日志文件
            [System.IO.File]::AppendAllText($script:LogFile, $logMessage + "`r`n", [System.Text.Encoding]::UTF8)
        } catch {
            # 如果写入失败，静默忽略
        }
    }
}

function Write-LogStep {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] [步骤] $Message"
    
    # 简化输出方法，直接使用Write-Host
    Write-Host "🚀 $Message" -ForegroundColor Cyan
    
    # 只有当日志文件路径已初始化时才写入文件
    if ($script:LogFile -and (Test-Path (Split-Path $script:LogFile -Parent))) {
        try {
            # 确保使用UTF-8编码写入日志文件
            [System.IO.File]::AppendAllText($script:LogFile, $logMessage + "`r`n", [System.Text.Encoding]::UTF8)
        } catch {
            # 如果写入失败，静默忽略
        }
    }
}

# 显示帮助信息
function Show-Help {
    Write-Host "企业级网络设备巡检系统 - 数据库初始化和迁移脚本 (PowerShell 版本)" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "用法:"
    Write-Host "    .\db-init-migrate.ps1 [选项]"
    Write-Host ""
    Write-Host "主要选项:"
    Write-Host "    -Init                   初始化所有数据库"
    Write-Host "    -Migrate                运行迁移到最新版本"
    Write-Host "    -CreateMigration <名称> 创建新的迁移文件"
    Write-Host "    -ImportData             导入初始数据和测试数据"
    Write-Host "    -Backup                 备份所有数据库"
    Write-Host "    -Restore                恢复数据库"
    Write-Host "    -Status                 显示迁移状态"
    Write-Host "    -Clean                  清理并重置数据库"
    Write-Host "    -HealthCheck            运行健康检查"
    Write-Host "    -Help                   显示此帮助信息"
    Write-Host ""
    Write-Host "可选修饰符:"
    Write-Host "    -SkipTestDevices        与 -Init 或 -Migrate 一起使用，跳过测试设备数据迁移"
    Write-Host ""
    Write-Host "数据库支持:"
    Write-Host "    📊 PostgreSQL (主数据库) - 用户、设备、巡检数据"
    Write-Host "    🔄 Redis (缓存数据库)    - 会话、临时数据"
    Write-Host "    📈 InfluxDB (时序数据库) - 设备监控指标"
    Write-Host ""
    Write-Host "示例:"
    Write-Host "    .\db-init-migrate.ps1 -Init                    # 初始化所有数据库"
    Write-Host "    .\db-init-migrate.ps1 -Migrate                 # 运行数据库迁移"
    Write-Host "    .\db-init-migrate.ps1 -Migrate -SkipTestDevices # 运行迁移但跳过测试设备数据"
    Write-Host "    .\db-init-migrate.ps1 -CreateMigration 添加设备  # 创建新迁移"
    Write-Host "    .\db-init-migrate.ps1 -Backup                  # 备份所有数据库"
    Write-Host "    .\db-init-migrate.ps1 -HealthCheck             # 健康检查"
    Write-Host ""
    Write-Host "文件位置:"
    Write-Host "    日志文件: logs\database\init-migrate.log"
    Write-Host "    备份目录: backups\{postgres|redis|influxdb}\"
    Write-Host "    迁移文件: backend\migrations\versions\"
    Write-Host ""
}

# 初始化环境
function Initialize-Environment {
    Write-LogStep "初始化脚本环境..."
    
    # 创建备份相关目录（日志目录已在Main函数中创建）
    $directories = @(
        $script:BackupPath,
        (Join-Path $script:BackupPath "postgres"),
        (Join-Path $script:BackupPath "redis"),
        (Join-Path $script:BackupPath "influxdb")
    )
    
    foreach ($dir in $directories) {
        if (-not (Test-Path $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
            Write-LogInfo "创建目录: $dir"
        }
    }
    
    # 日志文件已在Main函数中设置，这里验证是否正确初始化
    if (-not $script:LogFile) {
        Write-LogError "日志文件路径未正确初始化"
        throw "日志文件路径未正确初始化"
    }
    
    # 检查后端目录
    if (-not (Test-Path $script:BackendPath)) {
        Write-LogError "后端目录不存在: $script:BackendPath"
        throw "后端目录不存在"
    }
    
    Write-LogSuccess "脚本环境初始化完成"
}

# 检查系统要求
function Test-Requirements {
    Write-LogStep "检查系统要求..."
    
    $requirements = @(
        @{ Name = "docker"; Description = "Docker" },
        @{ Name = "python"; Description = "Python" }
    )
    
    $missing = @()
    foreach ($req in $requirements) {
        if (-not (Get-Command $req.Name -ErrorAction SilentlyContinue)) {
            $missing += $req.Description
        }
    }
    
    if ($missing.Count -gt 0) {
        Write-LogError "缺少必需工具: $($missing -join ', ')"
        throw "系统要求检查失败"
    }
    
    # 检查后端虚拟环境
    $venvPath = Join-Path $script:BackendPath ".venv"
    if (-not (Test-Path $venvPath)) {
        Write-LogWarning "后端虚拟环境不存在，将自动创建"
        Push-Location $script:BackendPath
        try {
            uv venv
            Write-LogSuccess "虚拟环境创建完成"
        } catch {
            Write-LogError "创建虚拟环境失败: $($_.Exception.Message)"
            throw
        } finally {
            Pop-Location
        }
    }
    
    Write-LogSuccess "系统要求检查通过"
}

# 读取配置文件
function Read-Configuration {
    Write-LogStep "读取数据库配置..."
    
    $envFile = Join-Path $script:ProjectRoot ".env.development"
    if (-not (Test-Path $envFile)) {
        $envFile = Join-Path $script:ProjectRoot ".env"
    }
    
    if (Test-Path $envFile) {
        Write-LogInfo "从配置文件读取设置: $envFile"
        $envContent = Get-Content $envFile
        
        foreach ($line in $envContent) {
            if ($line -match "^([^#]+)=(.*)$") {
                $key = $matches[1].Trim()
                $value = $matches[2].Trim()
                
                # 更新数据库配置
                switch ($key) {
                    "DATABASE_URL" {
                        if ($value -match "postgresql\+asyncpg://([^:]+):([^@]+)@([^:]+):(\d+)/(.+)") {
                            $script:DatabaseConfig.PostgreSQL.User = $matches[1]
                            $script:DatabaseConfig.PostgreSQL.Password = $matches[2]
                            $script:DatabaseConfig.PostgreSQL.Host = $matches[3]
                            $script:DatabaseConfig.PostgreSQL.Port = [int]$matches[4]
                            $script:DatabaseConfig.PostgreSQL.Database = $matches[5]
                            $script:DatabaseConfig.PostgreSQL.URL = $value
                        }
                    }
                    "REDIS_URL" {
                        if ($value -match "redis://([^@]*@)?([^:]+):(\d+)/(\d+)") {
                            $script:DatabaseConfig.Redis.Host = $matches[2]
                            $script:DatabaseConfig.Redis.Port = [int]$matches[3]
                            $script:DatabaseConfig.Redis.URL = $value
                        }
                    }
                }
            }
        }
        
        Write-LogSuccess "配置文件读取完成"
    } else {
        Write-LogWarning "配置文件不存在，使用默认配置"
    }
}

# 检查 Docker 容器状态
function Test-DockerContainer {
    param([string]$ContainerName)
    
    try {
        $containers = docker ps --format "{{.Names}}" 2>$null
        return $containers -contains $ContainerName
    } catch {
        return $false
    }
}

# 等待服务就绪
function Wait-ForService {
    param(
        [string]$ServiceName,
        [scriptblock]$TestCommand,
        [int]$MaxAttempts = 60,
        [int]$SleepSeconds = 2
    )
    
    Write-LogInfo "等待 $ServiceName 服务就绪..."
    $attempt = 0
    
    while ($attempt -lt $MaxAttempts) {
        try {
            if (& $TestCommand) {
                Write-LogSuccess "$ServiceName 服务已就绪"
                return $true
            }
        } catch {
            # 继续等待
        }
        
        $attempt++
        if ($attempt % 10 -eq 0) {
            Write-LogInfo "等待 $ServiceName 服务... ($attempt/$MaxAttempts)"
        }
        Start-Sleep -Seconds $SleepSeconds
    }
    
    Write-LogError "$ServiceName 服务启动超时"
    return $false
}

# 主函数
function Main {
    try {
        # 提前初始化日志路径，确保日志函数可以安全使用
        if (-not (Test-Path $script:LogPath)) {
            New-Item -ItemType Directory -Path $script:LogPath -Force | Out-Null
        }
        $script:LogFile = Join-Path $script:LogPath "init-migrate.log"
        
        # 初始化UTF-8日志文件
        Initialize-LogFile -LogFilePath $script:LogFile
        
        # 设置控制台编码为UTF-8（解决中文显示问题）
        try {
            # 方法1: 设置控制台代码页为UTF-8 (65001)
            $null = cmd /c "chcp 65001 >nul 2>&1"
            
            # 方法2: 强制设置控制台编码
            [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
            [Console]::InputEncoding = [System.Text.Encoding]::UTF8
            
            # 方法3: 设置PowerShell相关编码变量
            $OutputEncoding = [System.Text.Encoding]::UTF8
            $PSDefaultParameterValues['*:Encoding'] = 'utf8'

            # 方法5: 设置Python子进程的输出编码（最关键！）
            $env:PYTHONIOENCODING = "utf-8"

            # 方法4: 设置当前线程的文化信息
            $currentCulture = [System.Globalization.CultureInfo]::CurrentCulture
            [System.Threading.Thread]::CurrentThread.CurrentCulture = $currentCulture
            [System.Threading.Thread]::CurrentThread.CurrentUICulture = $currentCulture
            
            # 刷新输出缓冲区
            [System.Console]::Out.Flush()
            
            Write-LogInfo "控制台编码已设置为UTF-8"
        } catch {
            Write-LogWarning "设置控制台编码时出现问题: $($_.Exception.Message)"
            # 继续执行，不中断脚本
        }
        
        # 显示标题
        Write-Host ""
        Write-Host "🗄️ 企业级网络设备巡检系统 - 数据库管理工具" -ForegroundColor Cyan
        Write-Host "========================================================" -ForegroundColor Cyan
        Write-Host ""
        
        # 检查是否提供了参数
        $hasParams = $Init -or $Migrate -or $CreateMigration -or $ImportData -or $Backup -or $Restore -or $Status -or $Clean -or $HealthCheck -or $Help
        
        if (-not $hasParams) {
            Write-LogWarning "未指定操作参数，显示帮助信息"
            Show-Help
            return
        }
        
        if ($Help) {
            Show-Help
            return
        }
        
        # 初始化环境
        Initialize-Environment
        Test-Requirements
        Read-Configuration
        
        # 执行对应的操作
        $operationsExecuted = 0
        
        if ($Init) {
            Write-LogStep "执行数据库初始化..."
            Initialize-Databases
            $operationsExecuted++
        }
        
        if ($Migrate) {
            Write-LogStep "执行数据库迁移..."
            Run-DatabaseMigrations
            $operationsExecuted++
        }
        
        if ($CreateMigration) {
            Write-LogStep "创建新的迁移文件..."
            Create-NewMigration -MigrationName $CreateMigration
            $operationsExecuted++
        }
        
        if ($ImportData) {
            Write-LogStep "导入数据库数据..."
            Import-DatabaseData
            $operationsExecuted++
        }
        
        if ($Backup) {
            Write-LogStep "备份数据库..."
            Backup-AllDatabases
            $operationsExecuted++
        }
        
        if ($Restore) {
            Write-LogStep "恢复数据库..."
            Restore-DatabaseData
            $operationsExecuted++
        }
        
        if ($Status) {
            Write-LogStep "显示迁移状态..."
            Show-MigrationStatus
            $operationsExecuted++
        }
        
        if ($Clean) {
            Write-LogStep "清理数据库..."
            Clean-AllDatabases
            $operationsExecuted++
        }
        
        if ($HealthCheck) {
            Write-LogStep "运行健康检查..."
            Run-HealthCheck
            $operationsExecuted++
        }
        
        # 显示执行总结
        Write-Host ""
        Write-LogSuccess "数据库管理操作完成！执行了 $operationsExecuted 个操作"
        
        if (Test-Path $script:LogFile) {
            Write-Host "详细日志已保存至: $script:LogFile" -ForegroundColor Yellow
        }
        
    } catch {
        Write-LogError "脚本执行失败: $($_.Exception.Message)"
        Write-Host "错误详情: $($_.ScriptStackTrace)" -ForegroundColor Red
        Write-Host "如需帮助，请运行: .\db-init-migrate.ps1 -Help" -ForegroundColor Yellow
        exit 1
    }
}

# PostgreSQL 连接检查
function Test-PostgreSQLConnection {
    param([bool]$UseDocker = $true)
    
    $pgConfig = $script:DatabaseConfig.PostgreSQL
    
    if ($UseDocker) {
        # 检查容器是否运行
        if (-not (Test-DockerContainer -ContainerName $pgConfig.Container)) {
            Write-LogError "PostgreSQL 容器 $($pgConfig.Container) 未运行"
            return $false
        }
        
        # 使用 docker exec 检查连接
        try {
            docker exec $pgConfig.Container pg_isready -U $pgConfig.User -d $pgConfig.Database 2>$null | Out-Null
            if ($LASTEXITCODE -eq 0) {
                Write-LogSuccess "PostgreSQL 容器连接正常"
                return $true
            }
        } catch {
            Write-LogError "PostgreSQL 容器连接检查失败: $($_.Exception.Message)"
        }
    } else {
        # 使用 PowerShell 检查本地 PostgreSQL
        try {
            $testScript = @"
import psycopg2
import sys
try:
    conn = psycopg2.connect(
        host='$($pgConfig.Host)',
        port='$($pgConfig.Port)',
        database='$($pgConfig.Database)',
        user='$($pgConfig.User)',
        password='$($pgConfig.Password)'
    )
    conn.close()
    print('SUCCESS')
except Exception as e:
    print(f'ERROR: {e}')
    sys.exit(1)
"@
            $result = python -c $testScript 2>&1
            if ($result -eq "SUCCESS") {
                Write-LogSuccess "PostgreSQL 本地连接正常"
                return $true
            } else {
                Write-LogError "PostgreSQL 本地连接失败: $result"
            }
        } catch {
            Write-LogError "PostgreSQL 本地连接检查失败: $($_.Exception.Message)"
        }
    }
    
    return $false
}

# Redis 连接检查
function Test-RedisConnection {
    param([bool]$UseDocker = $true)
    
    $redisConfig = $script:DatabaseConfig.Redis
    
    if ($UseDocker) {
        # 检查容器是否运行
        if (-not (Test-DockerContainer -ContainerName $redisConfig.Container)) {
            Write-LogError "Redis 容器 $($redisConfig.Container) 未运行"
            return $false
        }
        
        # 使用环境变量传递密码，避免CLI警告
        try {
            $result = docker exec -e REDISCLI_AUTH=$($redisConfig.Password) $redisConfig.Container redis-cli ping
            
            if ($result -contains "PONG") {
                Write-LogSuccess "Redis 容器连接正常"
                return $true
            } else {
                Write-LogError "Redis 容器无响应，输出: $result"
                return $false
            }
        } catch {
            Write-LogError "Redis 容器连接检查失败: $($_.Exception.Message)"
            return $false
        }
    } else {
        # 使用 PowerShell 检查本地 Redis（需要 redis-py）
        try {
            $testScript = @"
import redis
import sys
try:
    r = redis.Redis(
        host='$($redisConfig.Host)',
        port=$($redisConfig.Port),
        password='$($redisConfig.Password)',
        decode_responses=True
    )
    r.ping()
    print('SUCCESS')
except Exception as e:
    print(f'ERROR: {e}')
    sys.exit(1)
"@
            $result = python -c $testScript 2>&1
            if ($result -eq "SUCCESS") {
                Write-LogSuccess "Redis 本地连接正常"
                return $true
            } else {
                Write-LogError "Redis 本地连接失败: $result"
            }
        } catch {
            Write-LogError "Redis 本地连接检查失败: $($_.Exception.Message)"
        }
    }
    
    return $false
}

# InfluxDB 连接检查
function Test-InfluxDBConnection {
    param([bool]$UseDocker = $true)
    
    $influxConfig = $script:DatabaseConfig.InfluxDB
    
    if ($UseDocker) {
        # 检查容器是否运行
        if (-not (Test-DockerContainer -ContainerName $influxConfig.Container)) {
            Write-LogError "InfluxDB 容器 $($influxConfig.Container) 未运行"
            return $false
        }
    }
    
    # 使用 HTTP API 检查连接
    try {
        $headers = @{ "Authorization" = "Token $($influxConfig.Token)" }
        $response = Invoke-WebRequest -Uri "$($influxConfig.URL)/health" -Headers $headers -Method Get -TimeoutSec 10 -UseBasicParsing
        
        if ($response.StatusCode -eq 200) {
            $healthData = $response.Content | ConvertFrom-Json
            if ($healthData.status -eq "pass") {
                Write-LogSuccess "InfluxDB 连接正常"
                return $true
            } else {
                Write-LogError "InfluxDB 健康检查失败，状态: $($healthData.status)"
            }
        }
    } catch {
        Write-LogError "InfluxDB 连接检查失败: $($_.Exception.Message)"
    }
    
    return $false
}

# 检查所有数据库连接
function Test-AllDatabaseConnections {
    Write-LogStep "检查所有数据库连接状态..."
    
    $results = @{
        PostgreSQL = Test-PostgreSQLConnection
        Redis = Test-RedisConnection
        InfluxDB = Test-InfluxDBConnection
    }
    
    $allHealthy = $true
    foreach ($db in $results.Keys) {
        if (-not $results[$db]) {
            $allHealthy = $false
            Write-LogError "$db 数据库连接异常"
        }
    }
    
    if ($allHealthy) {
        Write-LogSuccess "所有数据库连接检查通过"
    } else {
        Write-LogWarning "部分数据库连接存在问题"
    }
    
    return $results
}

# 检查 Python 虚拟环境和依赖
function Test-PythonEnvironment {
    Write-LogStep "检查 Python 环境和依赖..."
    
    Push-Location $script:BackendPath
    try {
        # 检查虚拟环境
        $venvPath = ".venv"
        if (-not (Test-Path $venvPath)) {
            Write-LogWarning "虚拟环境不存在，正在创建..."
            uv venv
        }
        
        # 激活虚拟环境并检查依赖
        $activateScript = if ($IsWindows -or $env:OS -eq "Windows_NT") {
            ".venv\Scripts\Activate.ps1"
        } else {
            ".venv/bin/activate"
        }
        
        if (Test-Path $activateScript) {
            Write-LogInfo "激活虚拟环境..."
            if ($IsWindows -or $env:OS -eq "Windows_NT") {
                & $activateScript
            } else {
                bash -c "source $activateScript && python --version"
            }
        }
        
        # 安装依赖
        Write-LogInfo "检查并安装 Python 依赖..."
        uv pip install -e .
        
        # 检查关键包
        $requiredPackages = @("alembic", "sqlalchemy", "asyncpg", "psycopg2-binary")
        foreach ($package in $requiredPackages) {
            try {
                uv pip show $package | Out-Null
                Write-LogInfo "已安装包: $package"
            } catch {
                Write-LogWarning "包 $package 可能未正确安装"
            }
        }
        
        Write-LogSuccess "Python 环境检查完成"
        
    } catch {
        Write-LogError "Python 环境检查失败: $($_.Exception.Message)"
        throw
    } finally {
        Pop-Location
    }
}

# 初始化数据库
function Initialize-Databases {
    Write-LogStep "开始初始化数据库..."
    
    # 检查 Python 环境
    Test-PythonEnvironment
    
    # 检查数据库连接
    $connectionResults = Test-AllDatabaseConnections
    
    # 如果有数据库连接失败，提示用户
    $failedDatabases = @()
    foreach ($db in $connectionResults.Keys) {
        if (-not $connectionResults[$db]) {
            $failedDatabases += $db
        }
    }
    
    if ($failedDatabases.Count -gt 0) {
        Write-LogWarning "以下数据库连接失败: $($failedDatabases -join ', ')"
        Write-LogInfo "请确保相关数据库服务已启动"
        Write-LogInfo "可以使用以下命令启动服务:"
        Write-LogInfo "  Docker 模式: .\dev-start.ps1"
        Write-LogInfo "  本地模式: .\dev-start.ps1 -Local"
        
        $continue = Read-Host "是否继续初始化可用的数据库? (y/N)"
        if ($continue -ne "y" -and $continue -ne "Y") {
            Write-LogInfo "用户取消初始化操作"
            return
        }
    }
    
    # 初始化 PostgreSQL
    if ($connectionResults.PostgreSQL) {
        Initialize-PostgreSQL
    }
    
    # 初始化 Redis
    if ($connectionResults.Redis) {
        Initialize-Redis
    }
    
    # 初始化 InfluxDB
    if ($connectionResults.InfluxDB) {
        Initialize-InfluxDB
    }
    
    Write-LogSuccess "数据库初始化完成"
}

# PostgreSQL 初始化
function Initialize-PostgreSQL {
    Write-LogStep "初始化 PostgreSQL 数据库..."
    
    $pgConfig = $script:DatabaseConfig.PostgreSQL
    
    # 检查数据库是否存在
    $dbExists = Test-PostgreSQLDatabase
    
    if ($dbExists) {
        Write-LogInfo "PostgreSQL 数据库已存在"
        
        $recreate = Read-Host "是否要重新创建数据库？这将删除所有现有数据 (y/N)"
        if ($recreate -eq "y" -or $recreate -eq "Y") {
            Drop-PostgreSQLDatabase
            Create-PostgreSQLDatabase
        }
    } else {
        Create-PostgreSQLDatabase
    }
    
    # 运行迁移
    Run-PostgreSQLMigrations
    
    Write-LogSuccess "PostgreSQL 初始化完成"
}

# 检查 PostgreSQL 数据库是否存在
function Test-PostgreSQLDatabase {
    $pgConfig = $script:DatabaseConfig.PostgreSQL
    
    try {
        if (Test-DockerContainer -ContainerName $pgConfig.Container) {
            # Docker 环境
            $result = docker exec $pgConfig.Container psql -U $pgConfig.User -lqt 2>$null | docker exec -i $pgConfig.Container grep -w $pgConfig.Database
            return $LASTEXITCODE -eq 0
        } else {
            # 本地环境
            $testScript = @"
import psycopg2
import sys
try:
    conn = psycopg2.connect(
        host='$($pgConfig.Host)',
        port='$($pgConfig.Port)',
        database='postgres',
        user='$($pgConfig.User)',
        password='$($pgConfig.Password)'
    )
    cursor = conn.cursor()
    cursor.execute("SELECT 1 FROM pg_database WHERE datname = %s", ('$($pgConfig.Database)',))
    exists = cursor.fetchone() is not None
    conn.close()
    print('TRUE' if exists else 'FALSE')
except Exception as e:
    print(f'ERROR: {e}')
    sys.exit(1)
"@
            $result = python -c $testScript
            return $result -eq "TRUE"
        }
    } catch {
        Write-LogError "检查数据库存在性失败: $($_.Exception.Message)"
        return $false
    }
}

# 创建 PostgreSQL 数据库
function Create-PostgreSQLDatabase {
    Write-LogInfo "创建 PostgreSQL 数据库..."
    
    $pgConfig = $script:DatabaseConfig.PostgreSQL
    
    try {
        if (Test-DockerContainer -ContainerName $pgConfig.Container) {
            # Docker 环境
            docker exec $pgConfig.Container createdb -U $pgConfig.User $pgConfig.Database 2>$null
            if ($LASTEXITCODE -eq 0) {
                Write-LogSuccess "数据库创建成功（Docker）"
            } else {
                Write-LogWarning "数据库可能已存在或创建失败"
            }
        } else {
            # 本地环境
            $createScript = @"
import psycopg2
import sys
try:
    # 连接到默认的 postgres 数据库
    conn = psycopg2.connect(
        host='$($pgConfig.Host)',
        port='$($pgConfig.Port)',
        database='postgres',
        user='$($pgConfig.User)',
        password='$($pgConfig.Password)'
    )
    conn.autocommit = True
    cursor = conn.cursor()
    
    # 创建数据库
    cursor.execute('CREATE DATABASE "$($pgConfig.Database)"')
    conn.close()
    print('SUCCESS')
except psycopg2.errors.DuplicateDatabase:
    print('DATABASE_EXISTS')
except Exception as e:
    print(f'ERROR: {e}')
    sys.exit(1)
"@
            $result = python -c $createScript
            
            if ($result -eq "SUCCESS") {
                Write-LogSuccess "数据库创建成功（本地）"
            } elseif ($result -eq "DATABASE_EXISTS") {
                Write-LogInfo "数据库已存在"
            } else {
                Write-LogError "数据库创建失败: $result"
                throw "数据库创建失败"
            }
        }
    } catch {
        Write-LogError "创建数据库时发生错误: $($_.Exception.Message)"
        throw
    }
}

# 删除 PostgreSQL 数据库
function Drop-PostgreSQLDatabase {
    Write-LogWarning "删除 PostgreSQL 数据库..."
    
    $pgConfig = $script:DatabaseConfig.PostgreSQL
    
    try {
        if (Test-DockerContainer -ContainerName $pgConfig.Container) {
            # Docker 环境
            docker exec $pgConfig.Container dropdb -U $pgConfig.User $pgConfig.Database 2>$null
            if ($LASTEXITCODE -eq 0) {
                Write-LogSuccess "数据库删除成功（Docker）"
            }
        } else {
            # 本地环境
            $dropScript = @"
import psycopg2
import sys
try:
    conn = psycopg2.connect(
        host='$($pgConfig.Host)',
        port='$($pgConfig.Port)',
        database='postgres',
        user='$($pgConfig.User)',
        password='$($pgConfig.Password)'
    )
    conn.autocommit = True
    cursor = conn.cursor()
    
    # 断开所有连接
    cursor.execute('''
        SELECT pg_terminate_backend(pg_stat_activity.pid)
        FROM pg_stat_activity
        WHERE pg_stat_activity.datname = %s
          AND pid <> pg_backend_pid()
    ''', ('$($pgConfig.Database)',))
    
    # 删除数据库
    cursor.execute('DROP DATABASE IF EXISTS "$($pgConfig.Database)"')
    conn.close()
    print('SUCCESS')
except Exception as e:
    print(f'ERROR: {e}')
    sys.exit(1)
"@
            $result = python -c $dropScript
            
            if ($result -eq "SUCCESS") {
                Write-LogSuccess "数据库删除成功（本地）"
            } else {
                Write-LogError "数据库删除失败: $result"
            }
        }
    } catch {
        Write-LogError "删除数据库时发生错误: $($_.Exception.Message)"
    }
}

# 运行 PostgreSQL 迁移
function Run-PostgreSQLMigrations {
    Write-LogStep "运行 PostgreSQL 数据库迁移..."
    
    Push-Location $script:BackendPath
    try {
        # 确保环境变量正确设置
        $env:DATABASE_URL = $script:DatabaseConfig.PostgreSQL.URL
        Write-LogInfo "设置数据库URL: $env:DATABASE_URL"
        
        # 激活虚拟环境
        $activateScript = if ($IsWindows -or $env:OS -eq "Windows_NT") {
            ".venv\Scripts\Activate.ps1"
        } else {
            ".venv/bin/activate"
        }
        
        if (Test-Path $activateScript) {
            Write-LogInfo "激活虚拟环境..."
            if ($IsWindows -or $env:OS -eq "Windows_NT") {
                & $activateScript
            }
        }
        
        # 检查 Alembic 配置
        if (-not (Test-Path "alembic.ini")) {
            Write-LogError "未找到 alembic.ini 配置文件"
            throw "Alembic 配置文件缺失"
        }
        
        # 检查迁移目录
        if (-not (Test-Path "migrations")) {
            Write-LogWarning "迁移目录不存在，正在初始化 Alembic..."
            uv run alembic init migrations
        }
        
        # 检查迁移版本目录
        $versionsDir = Join-Path "migrations" "versions"
        if (-not (Test-Path $versionsDir)) {
            Write-LogWarning "迁移版本目录不存在，创建中..."
            New-Item -ItemType Directory -Path $versionsDir -Force | Out-Null
        }
        
        # 运行迁移
        Write-LogInfo "执行数据库迁移到最新版本..."
        Write-LogInfo "使用环境变量 DATABASE_URL: $env:DATABASE_URL"
        
        # 首先确保所有依赖已安装
        Write-LogInfo "确保Python环境依赖完整安装..."
        Write-LogInfo "执行 uv sync 命令..."
        $syncResult = uv sync --quiet 2>&1
        $syncExitCode = $LASTEXITCODE
        Write-LogInfo "uv sync 退出代码: $syncExitCode"
        if ($syncExitCode -ne 0) {
            Write-LogError "uv sync 失败，输出: $($syncResult -join '; ')"
            throw "Python环境同步失败"
        }
        
        # 使用 uv run 确保在正确的环境中运行 alembic

        # 根据 SkipTestDevices 参数决定迁移目标版本
        if ($SkipTestDevices) {
            Write-LogInfo "跳过测试设备数据迁移，升级到 008_create_user_roles_table..."
            $upgradeTarget = "008_create_user_roles_table"
        } else {
            Write-LogInfo "执行完整迁移到最新版本..."
            $upgradeTarget = "head"
        }

        Write-LogInfo "执行 uv run alembic upgrade $upgradeTarget 命令..."
        
        try {
            # 使用不同的方法捕获输出，避免 2>&1 引起的问题
            $alembicResult = @()
            $exitCode = 0
            
            # 使用 Start-Process 来更好地控制输出捕获
            $processStartInfo = New-Object System.Diagnostics.ProcessStartInfo
            $processStartInfo.FileName = "uv"
            $processStartInfo.Arguments = "run alembic upgrade $upgradeTarget"
            $processStartInfo.UseShellExecute = $false
            $processStartInfo.RedirectStandardOutput = $true
            $processStartInfo.RedirectStandardError = $true
            $processStartInfo.WorkingDirectory = $PWD.Path
            
            $process = New-Object System.Diagnostics.Process
            $process.StartInfo = $processStartInfo
            
            # 启动进程
            $process.Start() | Out-Null
            
            # 读取输出
            $stdout = $process.StandardOutput.ReadToEnd()
            $stderr = $process.StandardError.ReadToEnd()
            
            # 等待进程完成
            $process.WaitForExit()
            $exitCode = $process.ExitCode
            
            # 合并输出
            if ($stdout) {
                $alembicResult += $stdout -split "`n" | Where-Object { $_.Trim() -ne "" }
            }
            if ($stderr) {
                $alembicResult += $stderr -split "`n" | Where-Object { $_.Trim() -ne "" }
            }
            
            Write-LogInfo "进程退出代码: $exitCode"
            
        } catch {
            Write-LogError "执行 uv run alembic 时出现异常: $($_.Exception.Message)"
            throw
        }
        
        Write-LogInfo "Alembic 退出代码: $exitCode"
        # 仅在错误时显示详细输出
        if ($exitCode -ne 0) {
            Write-LogInfo "Alembic 输出 (共 $($alembicResult.Count) 行):"
            for ($i = 0; $i -lt $alembicResult.Count; $i++) {
                Write-LogInfo "  [$i] $($alembicResult[$i])"
            }
        }
        
        # 改进的错误检测逻辑：精确识别真正的错误
        $realErrors = @()
        $downloadingPattern = "Downloading|Installing|Prepared|Built|Uninstalled|Installed|Resolved"
        $alembicInfoPattern = "^(INFO|DEBUG|WARNING)\s+\[alembic"
        $alembicSuccessPattern = "Running upgrade.*->.*|Current revision.*|INFO.*Context impl.*|INFO.*Will assume.*"
        $realErrorPattern = "(ERROR|CRITICAL)\s+\[alembic|^Traceback|sqlalchemy\\\.exc\\.|psycopg2\\.|FAILED:|Can't locate revision|No such revision|Target database is not up to date|relation.*does not exist|column.*does not exist"
        
        # 静默分析输出，只记录真正的错误
        foreach ($line in $alembicResult) {
            if ($line -is [string] -and $line.Trim() -ne "") {
                # 跳过下载相关信息、Alembic INFO消息和成功消息
                if ($line -match $downloadingPattern -or $line -match $alembicInfoPattern -or $line -match $alembicSuccessPattern) {
                    continue
                }
                
                # 只捕获真正的错误
                if ($line -match $realErrorPattern) {
                    $realErrors += $line
                }
            }
        }
        
        if ($realErrors.Count -gt 0) {
            Write-LogInfo "发现 $($realErrors.Count) 个真实错误"
        }
        
        # 额外检查：如果退出代码为0，清空错误列表（因为进程成功完成）
        if ($exitCode -eq 0) {
            $realErrors = @()
        }
        
        if ($exitCode -eq 0) {
            Write-LogSuccess "数据库迁移执行成功"
        } elseif ($realErrors.Count -eq 0) {
            # 如果没有检测到真实错误，检查是否有成功指示器
            $successIndicators = $alembicResult | Where-Object { 
                $_ -match "(Running upgrade|Current revision|INFO.*Context impl|已创建|已更新|Migration completed|No change)" 
            }
            
            if ($successIndicators -or ($alembicResult -match "Downloading|Installing")) {
                Write-LogWarning "Alembic进程退出代码非零($exitCode)，但未检测到错误，可能是正常完成"
                Write-LogInfo "尝试重新运行迁移确认状态..."
                
                # 重试一次以确认状态
                $alembicResult2 = uv run alembic upgrade $upgradeTarget 2>&1
                $exitCode2 = $LASTEXITCODE
                
                if ($exitCode2 -eq 0) {
                    Write-LogSuccess "数据库迁移确认成功"
                } else {
                    Write-LogError "数据库迁移重试失败，退出代码: $exitCode2"
                    Write-LogError "重试输出: $($alembicResult2 -join '; ')"
                    throw "Alembic 迁移失败"
                }
            } else {
                Write-LogError "数据库迁移执行失败，退出代码: $exitCode，未找到成功指示器"
                Write-LogError "完整输出已记录在上方"
                throw "Alembic 迁移失败，退出代码: $exitCode"
            }
        } else {
            Write-LogError "数据库迁移执行失败，退出代码: $exitCode"
            if ($realErrors.Count -gt 0) {
                Write-LogError "检测到的错误信息 ($($realErrors.Count) 行)："
                for ($i = 0; $i -lt $realErrors.Count; $i++) {
                    Write-LogError "  错误[$i]: $($realErrors[$i])"
                }
            } else {
                Write-LogError "未检测到具体错误信息，完整输出如上"
            }
            
            # 抛出异常时包含更多信息
            $errorMessage = if ($realErrors.Count -gt 0) {
                "Alembic 迁移失败: $($realErrors[0])"
            } else {
                "Alembic 迁移失败，退出代码: $exitCode"
            }
            throw $errorMessage
        }
        
    } catch {
        Write-LogError "运行迁移时发生错误: $($_.Exception.Message)"
        Write-LogError "错误详细信息: $($_.Exception.ToString())"
        throw
    } finally {
        Pop-Location
    }
}

# 验证迁移结果
function Verify-MigrationResults {
    param([bool]$SkipTestDevices = $false)

    Write-LogStep "验证数据库迁移结果..."

    Push-Location $script:BackendPath
    try {
        # 设置环境变量
        $env:DATABASE_URL = $script:DatabaseConfig.PostgreSQL.URL

        # 验证脚本
        $verifyScript = @"
import psycopg2
import sys
from datetime import datetime

try:
    # 连接数据库
    conn = psycopg2.connect(
        host='$($script:DatabaseConfig.PostgreSQL.Host)',
        port='$($script:DatabaseConfig.PostgreSQL.Port)',
        database='$($script:DatabaseConfig.PostgreSQL.Database)',
        user='$($script:DatabaseConfig.PostgreSQL.User)',
        password='$($script:DatabaseConfig.PostgreSQL.Password)'
    )
    cursor = conn.cursor()

    # 检查管理员用户
    cursor.execute("SELECT COUNT(*) FROM users WHERE username = 'admin' AND is_active = true")
    admin_count = cursor.fetchone()[0]

    # 检查总用户数
    cursor.execute("SELECT COUNT(*) FROM users")
    total_users = cursor.fetchone()[0]

    # 检查设备数量
    cursor.execute("SELECT COUNT(*) FROM devices")
    device_count = cursor.fetchone()[0]

    # 检查角色数量
    cursor.execute("SELECT COUNT(*) FROM roles")
    role_count = cursor.fetchone()[0]

    # 检查权限数量
    cursor.execute("SELECT COUNT(*) FROM permissions")
    permission_count = cursor.fetchone()[0]

    # 获取当前迁移版本
    cursor.execute("SELECT version_num FROM alembic_version")
    current_version = cursor.fetchone()[0] if cursor.rowcount > 0 else 'none'

    cursor.close()
    conn.close()

    # 输出结果
    print(f"VERIFICATION_RESULTS:")
    print(f"admin_user:{admin_count}")
    print(f"total_users:{total_users}")
    print(f"devices:{device_count}")
    print(f"roles:{role_count}")
    print(f"permissions:{permission_count}")
    print(f"migration_version:{current_version}")

except Exception as e:
    print(f"VERIFICATION_ERROR: {e}")
    sys.exit(1)
"@

        $result = python -c $verifyScript

        if ($result -match "VERIFICATION_ERROR:") {
            Write-LogError "数据验证失败: $result"
            return $false
        }

        # 解析验证结果
        $verificationData = @{}
        $result | ForEach-Object {
            if ($_ -match "^([^:]+):(.+)$") {
                $verificationData[$matches[1]] = $matches[2]
            }
        }

        # 显示验证报告
        Write-Host ""
        Write-Host "📊 数据库迁移验证报告" -ForegroundColor Cyan
        Write-Host "========================" -ForegroundColor Cyan

        # 基础数据验证
        $adminExists = [int]$verificationData["admin_user"] -gt 0
        $adminStatus = if ($adminExists) { "✅ 存在" } else { "❌ 缺失" }
        $adminColor = if ($adminExists) { "Green" } else { "Red" }

        Write-Host "管理员用户 (admin): " -NoNewline
        Write-Host $adminStatus -ForegroundColor $adminColor

        Write-Host "用户总数: $($verificationData["total_users"])" -ForegroundColor White
        Write-Host "角色数量: $($verificationData["roles"])" -ForegroundColor White
        Write-Host "权限数量: $($verificationData["permissions"])" -ForegroundColor White

        # 设备数据验证
        $deviceCount = [int]$verificationData["devices"]
        if ($SkipTestDevices) {
            $expectedDevices = 0
            $deviceStatus = if ($deviceCount -eq 0) { "✅ 正确跳过" } else { "⚠️ 可能有遗留数据" }
            $deviceColor = if ($deviceCount -eq 0) { "Green" } else { "Yellow" }
        } else {
            $expectedDevices = 14
            $deviceStatus = if ($deviceCount -eq 14) { "✅ 完整导入" } else { "⚠️ 数量异常" }
            $deviceColor = if ($deviceCount -eq 14) { "Green" } else { "Yellow" }
        }

        Write-Host "测试设备数量: $deviceCount " -NoNewline -ForegroundColor White
        Write-Host "($deviceStatus)" -ForegroundColor $deviceColor

        Write-Host "当前迁移版本: $($verificationData["migration_version"])" -ForegroundColor White

        # 登录信息提示
        if ($adminExists) {
            Write-Host ""
            Write-Host "🔐 默认登录信息:" -ForegroundColor Yellow
            Write-Host "   用户名: admin" -ForegroundColor White
            Write-Host "   密码: Admin123!" -ForegroundColor White
            Write-Host "   邮箱: admin@inspect.local" -ForegroundColor White
        }

        Write-Host ""

        # 返回验证状态
        return $adminExists -and ($verificationData["roles"] -gt 0) -and ($verificationData["permissions"] -gt 0)

    } catch {
        Write-LogError "验证过程中发生错误: $($_.Exception.Message)"
        return $false
    } finally {
        Pop-Location
    }
}

# 运行数据库迁移（主入口）
function Run-DatabaseMigrations {
    Write-LogStep "开始数据库迁移..."

    # 检查数据库连接
    if (-not (Test-PostgreSQLConnection)) {
        Write-LogError "PostgreSQL 连接失败，无法运行迁移"
        Write-LogInfo "请确保 PostgreSQL 服务已启动"
        return
    }

    # 运行 PostgreSQL 迁移
    Run-PostgreSQLMigrations

    # 验证迁移结果
    Verify-MigrationResults -SkipTestDevices:$SkipTestDevices

    Write-LogSuccess "数据库迁移完成"
}

# 创建新迁移
function Create-NewMigration {
    param([string]$MigrationName)
    
    if ([string]::IsNullOrWhiteSpace($MigrationName)) {
        Write-LogError "迁移名称不能为空"
        Write-LogInfo "用法: .\db-init-migrate.ps1 -CreateMigration '添加用户表'"
        return
    }
    
    Write-LogStep "创建新的迁移文件: $MigrationName"
    
    Push-Location $script:BackendPath
    try {
        # 设置环境变量
        $env:DATABASE_URL = $script:DatabaseConfig.PostgreSQL.URL
        
        # 激活虚拟环境
        $activateScript = if ($IsWindows -or $env:OS -eq "Windows_NT") {
            ".venv\Scripts\Activate.ps1"
        } else {
            ".venv/bin/activate"
        }
        
        if ((Test-Path $activateScript) -and ($IsWindows -or $env:OS -eq "Windows_NT")) {
            & $activateScript
        }
        
        # 创建迁移文件
        Write-LogInfo "正在生成迁移文件..."
        $alembicResult = alembic revision --autogenerate -m $MigrationName 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-LogSuccess "迁移文件创建成功"
            Write-LogInfo "迁移输出: $alembicResult"
            
            # 显示新创建的迁移文件
            $migrationFiles = Get-ChildItem "migrations\versions" -Filter "*.py" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
            if ($migrationFiles) {
                Write-LogInfo "新迁移文件: $($migrationFiles.Name)"
            }
        } else {
            Write-LogError "迁移文件创建失败"
            Write-LogError "错误信息: $alembicResult"
        }
        
    } catch {
        Write-LogError "创建迁移时发生错误: $($_.Exception.Message)"
    } finally {
        Pop-Location
    }
}

# 显示迁移状态
function Show-MigrationStatus {
    Write-LogStep "显示数据库迁移状态..."
    
    Push-Location $script:BackendPath
    try {
        # 设置环境变量
        $env:DATABASE_URL = $script:DatabaseConfig.PostgreSQL.URL
        
        # 激活虚拟环境
        $activateScript = if ($IsWindows -or $env:OS -eq "Windows_NT") {
            ".venv\Scripts\Activate.ps1"
        } else {
            ".venv/bin/activate"
        }
        
        if ((Test-Path $activateScript) -and ($IsWindows -or $env:OS -eq "Windows_NT")) {
            & $activateScript
        }
        
        # 检查数据库连接
        if (-not (Test-PostgreSQLConnection)) {
            Write-LogError "PostgreSQL 连接失败，无法查看迁移状态"
            return
        }
        
        Write-Host ""
        Write-Host "📊 当前迁移状态:" -ForegroundColor Cyan
        Write-Host "===================" -ForegroundColor Cyan
        
        # 显示当前版本
        Write-LogInfo "当前数据库版本:"
        $currentOutput = $null
        $currentVersion = $null
        $previousErrorAction = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'  # 临时允许错误继续执行
            $currentOutput = uv run alembic current 2>$null | Out-String
            $ErrorActionPreference = $previousErrorAction
        } catch {
            $ErrorActionPreference = $previousErrorAction
            # 命令执行失败,忽略错误继续
        }

        # 检查是否有输出
        if ($currentOutput) {
            # 过滤掉 INFO/DEBUG/WARNING 日志行,只保留版本信息
            $lines = $currentOutput -split "`r?`n" | Where-Object {
                $_ -notmatch "^\s*(INFO|DEBUG|WARNING|ERROR)" -and $_.Trim()
            }

            # 匹配第一行的版本号
            $firstLine = $lines | Select-Object -First 1
            if ($firstLine) {
                Write-Host $firstLine -ForegroundColor Green
            } else {
                Write-Host "无迁移版本记录" -ForegroundColor Yellow
            }
        } else {
            Write-Host "无迁移版本记录" -ForegroundColor Yellow
        }

        Write-Host ""

        # 显示迁移历史
        Write-LogInfo "迁移历史:"
        $historyOutput = @()
        try {
            $historyOutput = & uv run alembic history 2>&1
            $historyExitCode = $LASTEXITCODE
        } catch {
            $historyExitCode = 1
        }

        if ($historyExitCode -eq 0 -and $historyOutput) {
            # 过滤掉 INFO/DEBUG/WARNING 日志行
            $filteredHistory = $historyOutput | Where-Object {
                ($_ -notmatch "^\s*(INFO|DEBUG|WARNING|ERROR)") -and ($_ -match "\S")
            }
            if ($filteredHistory) {
                Write-Host ($filteredHistory -join "`n") -ForegroundColor Yellow
            } else {
                Write-Host "无迁移历史记录" -ForegroundColor Yellow
            }
        } else {
            Write-Host "无迁移历史记录" -ForegroundColor Yellow
        }

        Write-Host ""

        # 显示待执行的迁移
        Write-LogInfo "检查待执行的迁移:"
        $headOutput = @()
        try {
            $headOutput = & uv run alembic show head 2>&1
            $headExitCode = $LASTEXITCODE
        } catch {
            $headExitCode = 1
        }

        if ($headExitCode -eq 0 -and $headOutput) {
            # 过滤掉 INFO/DEBUG/WARNING 日志行
            $filteredHead = $headOutput | Where-Object {
                ($_ -notmatch "^\s*(INFO|DEBUG|WARNING|ERROR)") -and ($_ -match "\S")
            }
            if ($filteredHead) {
                Write-Host "最新版本: $($filteredHead -join ' ')" -ForegroundColor Blue
            }
        }
        
    } catch {
        Write-LogError "查看迁移状态时发生错误: $($_.Exception.Message)"
    } finally {
        Pop-Location
    }
}

# Redis 初始化
function Initialize-Redis {
    Write-LogStep "初始化 Redis 缓存数据库..."
    
    $redisConfig = $script:DatabaseConfig.Redis
    
    # 检查 Redis 连接
    if (-not (Test-RedisConnection)) {
        Write-LogError "Redis 连接失败，跳过初始化"
        return
    }
    
    try {
        # 获取 Redis 信息
        $redisInfo = Get-RedisInfo
        Write-LogInfo "Redis 版本: $($redisInfo.Version)"
        Write-LogInfo "Redis 内存使用: $($redisInfo.Memory)"
        
        # 检查是否有现有数据
        $keyCount = Get-RedisKeyCount
        if ($keyCount -gt 0) {
            Write-LogWarning "Redis 中存在 $keyCount 个键"
            $clearCache = Read-Host "是否清理所有缓存数据? (y/N)"
            if ($clearCache -eq "y" -or $clearCache -eq "Y") {
                Clear-RedisCache
            }
        } else {
            Write-LogInfo "Redis 缓存为空"
        }
        
        # 设置一些基础配置（如果需要）
        Set-RedisConfiguration
        
        # 测试基本操作
        Test-RedisOperations
        
        Write-LogSuccess "Redis 初始化完成"
        
    } catch {
        Write-LogError "Redis 初始化失败: $($_.Exception.Message)"
    }
}

# 获取 Redis 信息
function Get-RedisInfo {
    try {
        if (Test-DockerContainer -ContainerName $script:DatabaseConfig.Redis.Container) {
            # Docker 环境，使用环境变量传递密码
            $serverInfo = docker exec -e REDISCLI_AUTH=$($script:DatabaseConfig.Redis.Password) $script:DatabaseConfig.Redis.Container redis-cli INFO server
            $memoryInfo = docker exec -e REDISCLI_AUTH=$($script:DatabaseConfig.Redis.Password) $script:DatabaseConfig.Redis.Container redis-cli INFO memory
            
            $version = ($serverInfo | Select-String "redis_version:(.+)" | ForEach-Object { $_.Matches[0].Groups[1].Value }).Trim()
            $memory = ($memoryInfo | Select-String "used_memory_human:(.+)" | ForEach-Object { $_.Matches[0].Groups[1].Value }).Trim()
            
            return @{
                Version = if ($version) { $version } else { "未知" }
                Memory = if ($memory) { $memory } else { "未知" }
            }
        }
    } catch {
        Write-LogWarning "获取 Redis 信息失败: $($_.Exception.Message)"
        return @{ Version = "未知"; Memory = "未知" }
    }
}

# 获取 Redis 键数量
function Get-RedisKeyCount {
    try {
        if (Test-DockerContainer -ContainerName $script:DatabaseConfig.Redis.Container) {
            $result = docker exec -e REDISCLI_AUTH=$($script:DatabaseConfig.Redis.Password) $script:DatabaseConfig.Redis.Container redis-cli DBSIZE
            # 从结果中提取数字
            if ($result -match "(\d+)") {
                return [int]$matches[1]
            }
        }
        return 0
    } catch {
        Write-LogWarning "获取 Redis 键数量失败: $($_.Exception.Message)"
        return 0
    }
}

# 清理 Redis 缓存
function Clear-RedisCache {
    Write-LogWarning "清理 Redis 缓存数据..."
    
    try {
        if (Test-DockerContainer -ContainerName $script:DatabaseConfig.Redis.Container) {
            $result = docker exec -e REDISCLI_AUTH=$($script:DatabaseConfig.Redis.Password) $script:DatabaseConfig.Redis.Container redis-cli FLUSHALL
            if ($result -eq "OK") {
                Write-LogSuccess "Redis 缓存清理完成"
            } else {
                Write-LogWarning "Redis 缓存清理结果: $result"
            }
        }
    } catch {
        Write-LogError "Redis 缓存清理失败: $($_.Exception.Message)"
    }
}

# 设置 Redis 配置
function Set-RedisConfiguration {
    Write-LogInfo "设置 Redis 配置..."
    
    try {
        if (Test-DockerContainer -ContainerName $script:DatabaseConfig.Redis.Container) {
            # 设置一些推荐的配置
            $result1 = docker exec -e REDISCLI_AUTH=$($script:DatabaseConfig.Redis.Password) $script:DatabaseConfig.Redis.Container redis-cli CONFIG SET save "900 1 300 10 60 10000"
            $result2 = docker exec -e REDISCLI_AUTH=$($script:DatabaseConfig.Redis.Password) $script:DatabaseConfig.Redis.Container redis-cli CONFIG SET maxmemory-policy "allkeys-lru"
            
            if ($result1 -eq "OK" -and $result2 -eq "OK") {
                Write-LogSuccess "Redis 配置设置完成"
            } else {
                Write-LogWarning "Redis 配置设置部分失败。结果1: $result1, 结果2: $result2"
            }
        }
    } catch {
        Write-LogWarning "Redis 配置设置失败: $($_.Exception.Message)"
    }
}

# 测试 Redis 基本操作
function Test-RedisOperations {
    Write-LogInfo "测试 Redis 基本操作..."
    
    try {
        if (Test-DockerContainer -ContainerName $script:DatabaseConfig.Redis.Container) {
            $testKey = "test_key_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
            $testValue = "test_value"
            
            # SET 操作
            $setResult = docker exec -e REDISCLI_AUTH=$($script:DatabaseConfig.Redis.Password) $script:DatabaseConfig.Redis.Container redis-cli SET $testKey $testValue EX 60
            
            if ($setResult -eq "OK") {
                # GET 操作
                $getResult = docker exec -e REDISCLI_AUTH=$($script:DatabaseConfig.Redis.Password) $script:DatabaseConfig.Redis.Container redis-cli GET $testKey
                
                if ($getResult -eq $testValue) {
                    Write-LogSuccess "Redis 基本操作测试通过"
                    
                    # 清理测试键
                    docker exec -e REDISCLI_AUTH=$($script:DatabaseConfig.Redis.Password) $script:DatabaseConfig.Redis.Container redis-cli DEL $testKey | Out-Null
                } else {
                    Write-LogWarning "Redis GET 操作失败。期望: $testValue, 实际: $getResult"
                }
            } else {
                Write-LogWarning "Redis SET 操作失败。结果: $setResult"
            }
        }
    } catch {
        Write-LogWarning "Redis 操作测试失败: $($_.Exception.Message)"
    }
}

# InfluxDB 初始化
function Initialize-InfluxDB {
    Write-LogStep "初始化 InfluxDB 时序数据库..."
    
    $influxConfig = $script:DatabaseConfig.InfluxDB
    
    # 检查 InfluxDB 连接
    if (-not (Test-InfluxDBConnection)) {
        Write-LogError "InfluxDB 连接失败，跳过初始化"
        return
    }
    
    try {
        # 获取 InfluxDB 信息
        $influxInfo = Get-InfluxDBInfo
        Write-LogInfo "InfluxDB 版本: $($influxInfo.Version)"
        
        # 检查组织是否存在
        $orgExists = Test-InfluxDBOrganization
        if (-not $orgExists) {
            Create-InfluxDBOrganization
        }
        
        # 检查存储桶是否存在
        $bucketExists = Test-InfluxDBBucket
        if (-not $bucketExists) {
            Create-InfluxDBBucket
        }
        
        # 测试写入操作
        Test-InfluxDBOperations
        
        Write-LogSuccess "InfluxDB 初始化完成"
        
    } catch {
        Write-LogError "InfluxDB 初始化失败: $($_.Exception.Message)"
    }
}

# 获取 InfluxDB 信息
function Get-InfluxDBInfo {
    try {
        $headers = @{ "Authorization" = "Token $($script:DatabaseConfig.InfluxDB.Token)" }
        $response = Invoke-RestMethod -Uri "$($script:DatabaseConfig.InfluxDB.URL)/health" -Headers $headers -Method Get -TimeoutSec 10
        
        return @{
            Version = $response.version
            Status = $response.status
        }
    } catch {
        Write-LogWarning "获取 InfluxDB 信息失败: $($_.Exception.Message)"
        return @{ Version = "未知"; Status = "未知" }
    }
}

# 检查 InfluxDB 组织是否存在
function Test-InfluxDBOrganization {
    try {
        $headers = @{ "Authorization" = "Token $($script:DatabaseConfig.InfluxDB.Token)" }
        $response = Invoke-RestMethod -Uri "$($script:DatabaseConfig.InfluxDB.URL)/api/v2/orgs" -Headers $headers -Method Get -TimeoutSec 10
        
        $orgExists = $response.orgs | Where-Object { $_.name -eq $script:DatabaseConfig.InfluxDB.Org }
        return $null -ne $orgExists
    } catch {
        Write-LogWarning "检查 InfluxDB 组织失败: $($_.Exception.Message)"
        return $false
    }
}

# 创建 InfluxDB 组织
function Create-InfluxDBOrganization {
    Write-LogInfo "创建 InfluxDB 组织: $($script:DatabaseConfig.InfluxDB.Org)"
    
    try {
        $headers = @{ 
            "Authorization" = "Token $($script:DatabaseConfig.InfluxDB.Token)"
            "Content-Type" = "application/json"
        }
        $body = @{
            name = $script:DatabaseConfig.InfluxDB.Org
        } | ConvertTo-Json
        
        Invoke-RestMethod -Uri "$($script:DatabaseConfig.InfluxDB.URL)/api/v2/orgs" -Headers $headers -Method Post -Body $body -TimeoutSec 10
        Write-LogSuccess "InfluxDB 组织创建成功"
    } catch {
        if ($_.Exception.Response.StatusCode -eq 422) {
            Write-LogInfo "InfluxDB 组织已存在"
        } else {
            Write-LogError "创建 InfluxDB 组织失败: $($_.Exception.Message)"
        }
    }
}

# 检查 InfluxDB 存储桶是否存在
function Test-InfluxDBBucket {
    try {
        $headers = @{ "Authorization" = "Token $($script:DatabaseConfig.InfluxDB.Token)" }
        $response = Invoke-RestMethod -Uri "$($script:DatabaseConfig.InfluxDB.URL)/api/v2/buckets" -Headers $headers -Method Get -TimeoutSec 10
        
        $bucketExists = $response.buckets | Where-Object { $_.name -eq $script:DatabaseConfig.InfluxDB.Bucket }
        return $null -ne $bucketExists
    } catch {
        Write-LogWarning "检查 InfluxDB 存储桶失败: $($_.Exception.Message)"
        return $false
    }
}

# 创建 InfluxDB 存储桶
function Create-InfluxDBBucket {
    Write-LogInfo "创建 InfluxDB 存储桶: $($script:DatabaseConfig.InfluxDB.Bucket)"
    
    try {
        $headers = @{ 
            "Authorization" = "Token $($script:DatabaseConfig.InfluxDB.Token)"
            "Content-Type" = "application/json"
        }
        $body = @{
            name = $script:DatabaseConfig.InfluxDB.Bucket
            orgID = (Get-InfluxDBOrgId)
            retentionRules = @(@{
                type = "expire"
                everySeconds = 2592000  # 30 days
            })
        } | ConvertTo-Json
        
        Invoke-RestMethod -Uri "$($script:DatabaseConfig.InfluxDB.URL)/api/v2/buckets" -Headers $headers -Method Post -Body $body -TimeoutSec 10
        Write-LogSuccess "InfluxDB 存储桶创建成功"
    } catch {
        if ($_.Exception.Response.StatusCode -eq 422) {
            Write-LogInfo "InfluxDB 存储桶已存在"
        } else {
            Write-LogError "创建 InfluxDB 存储桶失败: $($_.Exception.Message)"
        }
    }
}

# 获取 InfluxDB 组织 ID
function Get-InfluxDBOrgId {
    try {
        $headers = @{ "Authorization" = "Token $($script:DatabaseConfig.InfluxDB.Token)" }
        $response = Invoke-RestMethod -Uri "$($script:DatabaseConfig.InfluxDB.URL)/api/v2/orgs" -Headers $headers -Method Get -TimeoutSec 10
        
        $org = $response.orgs | Where-Object { $_.name -eq $script:DatabaseConfig.InfluxDB.Org }
        return $org.id
    } catch {
        Write-LogError "获取 InfluxDB 组织 ID 失败: $($_.Exception.Message)"
        return $null
    }
}

# 测试 InfluxDB 基本操作
function Test-InfluxDBOperations {
    Write-LogInfo "测试 InfluxDB 基本操作..."
    
    try {
        $headers = @{ 
            "Authorization" = "Token $($script:DatabaseConfig.InfluxDB.Token)"
            "Content-Type" = "text/plain"
        }
        
        # 写入测试数据
        # 计算Unix纳秒时间戳（兼容旧版.NET Framework）
        $unixEpoch = [DateTimeOffset]::new(1970, 1, 1, 0, 0, 0, [TimeSpan]::Zero)
        $nanoseconds = ([DateTimeOffset]::UtcNow - $unixEpoch).Ticks * 100
        $testData = "test_measurement,source=test_script value=1.0 $nanoseconds"
        
        $writeUrl = "$($script:DatabaseConfig.InfluxDB.URL)/api/v2/write?org=$($script:DatabaseConfig.InfluxDB.Org)&bucket=$($script:DatabaseConfig.InfluxDB.Bucket)"
        Invoke-RestMethod -Uri $writeUrl -Headers $headers -Method Post -Body $testData -TimeoutSec 10
        
        Write-LogSuccess "InfluxDB 基本操作测试通过"
        
    } catch {
        Write-LogWarning "InfluxDB 操作测试失败: $($_.Exception.Message)"
    }
}

# 数据导入功能
function Import-DatabaseData {
    Write-LogStep "开始数据库数据导入..."
    
    # 检查数据库连接
    $connectionResults = Test-AllDatabaseConnections
    if (-not $connectionResults.PostgreSQL) {
        Write-LogError "PostgreSQL 连接失败，无法导入数据"
        return
    }
    
    # 显示导入选项菜单
    Show-ImportDataMenu
}

# 显示数据导入菜单
function Show-ImportDataMenu {
    Write-Host ""
    Write-Host "📊 数据库数据导入选项" -ForegroundColor Cyan
    Write-Host "========================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "1. 跳过数据导入"
    Write-Host "2. 导入基础初始数据"
    Write-Host "3. 导入示例数据"
    Write-Host "4. 导入完整测试数据集"
    Write-Host "5. 导入 InfluxDB 监控数据"
    Write-Host "6. 导入所有数据（初始+示例+测试）"
    Write-Host ""
    
    $choice = Read-Host "请选择导入选项 (1-6，默认 1)"
    if ([string]::IsNullOrWhiteSpace($choice)) {
        $choice = "1"
    }
    
    switch ($choice) {
        "1" {
            Write-LogSuccess "跳过数据导入"
            return
        }
        "2" {
            Import-InitialData
        }
        "3" {
            Import-SampleData
        }
        "4" {
            Import-TestDataset
        }
        "5" {
            Import-InfluxDBData
        }
        "6" {
            Import-AllData
        }
        default {
            Write-LogWarning "无效选择，跳过数据导入"
        }
    }
}

# 导入基础初始数据
function Import-InitialData {
    Write-LogStep "导入基础初始数据..."
    
    try {
        # 检查初始化 SQL 文件
        $initSqlPath = Join-Path $script:ProjectRoot "database\init.sql"
        if (Test-Path $initSqlPath) {
            Write-LogInfo "执行数据库初始化 SQL..."
            Execute-PostgreSQLScript -ScriptPath $initSqlPath
        } else {
            Write-LogWarning "未找到初始化 SQL 文件: $initSqlPath"
        }
        
        # 通过迁移系统导入默认数据（如果存在 002_insert_default_data 迁移）
        Write-LogInfo "检查默认数据迁移..."
        $defaultDataMigration = Join-Path $script:BackendPath "migrations\versions\002_insert_default_data.py"
        if (Test-Path $defaultDataMigration) {
            Write-LogInfo "默认数据将通过迁移系统自动导入"
        } else {
            # 手动创建基础管理员用户和角色
            Create-DefaultAdminUser
        }
        
        Write-LogSuccess "基础初始数据导入完成"
        
    } catch {
        Write-LogError "基础初始数据导入失败: $($_.Exception.Message)"
        throw
    }
}

# 导入示例数据
function Import-SampleData {
    Write-LogStep "导入示例数据..."
    
    try {
        # 首先导入基础数据
        Import-InitialData
        
        # 检查示例数据文件
        $sampleDataPath = Join-Path $script:ProjectRoot "database\sample_data.sql"
        if (Test-Path $sampleDataPath) {
            Write-LogInfo "执行示例数据 SQL..."
            Execute-PostgreSQLScript -ScriptPath $sampleDataPath
        } else {
            Write-LogInfo "创建示例数据..."
            Create-SampleData
        }
        
        Write-LogSuccess "示例数据导入完成"
        
    } catch {
        Write-LogError "示例数据导入失败: $($_.Exception.Message)"
        throw
    }
}

# 导入完整测试数据集
function Import-TestDataset {
    Write-LogStep "导入完整测试数据集..."
    
    try {
        # 首先导入示例数据
        Import-SampleData
        
        # 检查测试数据文件
        $testDataPath = Join-Path $script:ProjectRoot "database\test_data.sql"
        if (Test-Path $testDataPath) {
            Write-LogInfo "执行测试数据 SQL..."
            Execute-PostgreSQLScript -ScriptPath $testDataPath
        } else {
            Write-LogInfo "创建测试数据集..."
            Create-TestDataset
        }
        
        Write-LogSuccess "完整测试数据集导入完成"
        
    } catch {
        Write-LogError "测试数据集导入失败: $($_.Exception.Message)"
        throw
    }
}

# 导入 InfluxDB 监控数据
function Import-InfluxDBData {
    Write-LogStep "导入 InfluxDB 监控数据..."
    
    if (-not (Test-InfluxDBConnection)) {
        Write-LogError "InfluxDB 连接失败，跳过监控数据导入"
        return
    }
    
    try {
        # 检查 InfluxDB 测试数据文件
        $influxTestDataPath = Join-Path $script:ProjectRoot "database\influx_test_data.txt"
        if (Test-Path $influxTestDataPath) {
            Write-LogInfo "导入 InfluxDB 测试数据文件..."
            Import-InfluxDBFromFile -FilePath $influxTestDataPath
        } else {
            Write-LogInfo "生成 InfluxDB 测试数据..."
            Generate-InfluxDBTestData
        }
        
        Write-LogSuccess "InfluxDB 监控数据导入完成"
        
    } catch {
        Write-LogError "InfluxDB 监控数据导入失败: $($_.Exception.Message)"
        throw
    }
}

# 导入所有数据
function Import-AllData {
    Write-LogStep "导入所有数据（完整数据集）..."
    
    try {
        Import-TestDataset  # 这会包含基础数据和示例数据
        Import-InfluxDBData
        
        Write-LogSuccess "所有数据导入完成"
        
    } catch {
        Write-LogError "完整数据导入失败: $($_.Exception.Message)"
        throw
    }
}

# 执行 PostgreSQL 脚本
function Execute-PostgreSQLScript {
    param([string]$ScriptPath)
    
    if (-not (Test-Path $ScriptPath)) {
        Write-LogError "SQL 脚本文件不存在: $ScriptPath"
        return $false
    }
    
    Write-LogInfo "执行 SQL 脚本: $(Split-Path -Leaf $ScriptPath)"
    
    $pgConfig = $script:DatabaseConfig.PostgreSQL
    
    try {
        if (Test-DockerContainer -ContainerName $pgConfig.Container) {
            # Docker 环境
            Get-Content $ScriptPath | docker exec -i $pgConfig.Container psql -U $pgConfig.User -d $pgConfig.Database
            
            if ($LASTEXITCODE -eq 0) {
                Write-LogSuccess "SQL 脚本执行成功"
                return $true
            } else {
                Write-LogError "SQL 脚本执行失败"
                return $false
            }
        } else {
            # 本地环境
            $executeScript = @"
import psycopg2
import sys
try:
    conn = psycopg2.connect(
        host='$($pgConfig.Host)',
        port='$($pgConfig.Port)',
        database='$($pgConfig.Database)',
        user='$($pgConfig.User)',
        password='$($pgConfig.Password)'
    )
    cursor = conn.cursor()
    
    with open('$($ScriptPath.Replace('\', '\\'))', 'r', encoding='utf-8') as f:
        sql_content = f.read()
    
    cursor.execute(sql_content)
    conn.commit()
    cursor.close()
    conn.close()
    print('SUCCESS')
except Exception as e:
    print(f'ERROR: {e}')
    sys.exit(1)
"@
            $result = python -c $executeScript
            
            if ($result -eq "SUCCESS") {
                Write-LogSuccess "SQL 脚本执行成功"
                return $true
            } else {
                Write-LogError "SQL 脚本执行失败: $result"
                return $false
            }
        }
    } catch {
        Write-LogError "执行 SQL 脚本时发生错误: $($_.Exception.Message)"
        return $false
    }
}

# 创建默认管理员用户
function Create-DefaultAdminUser {
    Write-LogInfo "创建默认管理员用户..."
    
    $createAdminScript = @"
-- 创建默认管理员用户和角色
INSERT INTO roles (id, name, display_name, description, is_built_in, created_at, updated_at)
VALUES (
    gen_random_uuid(),
    'admin',
    '系统管理员',
    '系统管理员角色，拥有所有权限',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
) ON CONFLICT (name) DO NOTHING;

INSERT INTO users (
    id, username, email, password_hash, display_name, 
    role, status, is_superuser, created_at, updated_at
)
VALUES (
    gen_random_uuid(),
    'admin',
    'admin@inspect.local',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewaBxPFPF/v.wpXm', -- password: admin123
    '系统管理员',
    'admin',
    'active',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
) ON CONFLICT (username) DO NOTHING;
"@
    
    $tempScriptPath = Join-Path $env:TEMP "create_admin.sql"
    $createAdminScript | Out-File -FilePath $tempScriptPath -Encoding UTF8
    
    try {
        $result = Execute-PostgreSQLScript -ScriptPath $tempScriptPath
        if ($result) {
            Write-LogSuccess "默认管理员用户创建完成"
            Write-LogInfo "默认登录信息: admin / admin123"
        }
    } finally {
        Remove-Item -Path $tempScriptPath -ErrorAction SilentlyContinue
    }
}

# 创建示例数据
function Create-SampleData {
    Write-LogInfo "生成示例数据..."
    
    $sampleDataScript = @"
-- 插入示例设备数据
INSERT INTO devices (id, name, ip_address, device_type, location, description, status, created_at, updated_at)
VALUES 
    (gen_random_uuid(), 'Core-Switch-01', '192.168.1.1', 'switch', '数据中心A', '核心交换机01', 'online', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Core-Router-01', '192.168.1.2', 'router', '数据中心A', '核心路由器01', 'online', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Firewall-01', '192.168.1.3', 'firewall', '数据中心A', '防火墙01', 'online', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Access-Switch-01', '192.168.2.1', 'switch', '办公区A', '接入交换机01', 'offline', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Wireless-AP-01', '192.168.2.10', 'wireless', '办公区A', '无线接入点01', 'warning', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (ip_address) DO NOTHING;

-- 插入示例用户数据
INSERT INTO users (id, username, email, display_name, role, status, created_at, updated_at)
VALUES 
    (gen_random_uuid(), 'operator01', 'operator01@inspect.local', '运维人员01', 'operator', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'viewer01', 'viewer01@inspect.local', '观察员01', 'viewer', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'testuser', 'test@inspect.local', '测试用户', 'viewer', 'inactive', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (username) DO NOTHING;
"@
    
    $tempScriptPath = Join-Path $env:TEMP "sample_data.sql"
    $sampleDataScript | Out-File -FilePath $tempScriptPath -Encoding UTF8
    
    try {
        Execute-PostgreSQLScript -ScriptPath $tempScriptPath
        Write-LogSuccess "示例数据创建完成"
    } finally {
        Remove-Item -Path $tempScriptPath -ErrorAction SilentlyContinue
    }
}

# 创建测试数据集
function Create-TestDataset {
    Write-LogInfo "生成完整测试数据集..."
    
    # 生成更多的测试数据（设备、用户、巡检记录等）
    $testDataScript = @"
-- 批量插入测试设备数据
DO `$`$
DECLARE
    i INTEGER;
    device_id UUID;
    device_types TEXT[] := ARRAY['switch', 'router', 'firewall', 'server', 'wireless'];
    locations TEXT[] := ARRAY['数据中心A', '数据中心B', '办公区A', '办公区B', '机房01', '机房02'];
    statuses TEXT[] := ARRAY['online', 'offline', 'warning', 'error'];
BEGIN
    FOR i IN 1..50 LOOP
        device_id := gen_random_uuid();
        INSERT INTO devices (
            id, name, ip_address, device_type, location, description, status, created_at, updated_at
        ) VALUES (
            device_id,
            'TestDevice-' || LPAD(i::TEXT, 3, '0'),
            '10.0.' || (i / 256) || '.' || (i % 256),
            device_types[1 + (i % array_length(device_types, 1))],
            locations[1 + (i % array_length(locations, 1))],
            '测试设备 ' || i,
            statuses[1 + (i % array_length(statuses, 1))],
            CURRENT_TIMESTAMP - INTERVAL '1 day' * (random() * 30),
            CURRENT_TIMESTAMP
        ) ON CONFLICT (ip_address) DO NOTHING;
    END LOOP;
END`$`$;

-- 批量插入测试用户数据  
DO `$`$
DECLARE
    i INTEGER;
    user_roles TEXT[] := ARRAY['admin', 'operator', 'viewer'];
    user_statuses TEXT[] := ARRAY['active', 'inactive'];
BEGIN
    FOR i IN 1..20 LOOP
        INSERT INTO users (
            id, username, email, display_name, role, status, created_at, updated_at
        ) VALUES (
            gen_random_uuid(),
            'testuser' || LPAD(i::TEXT, 3, '0'),
            'testuser' || i || '@inspect.local',
            '测试用户' || LPAD(i::TEXT, 3, '0'),
            user_roles[1 + (i % array_length(user_roles, 1))],
            user_statuses[1 + (i % array_length(user_statuses, 1))],
            CURRENT_TIMESTAMP - INTERVAL '1 day' * (random() * 60),
            CURRENT_TIMESTAMP
        ) ON CONFLICT (username) DO NOTHING;
    END LOOP;
END`$`$;
"@
    
    $tempScriptPath = Join-Path $env:TEMP "test_dataset.sql"
    $testDataScript | Out-File -FilePath $tempScriptPath -Encoding UTF8
    
    try {
        Execute-PostgreSQLScript -ScriptPath $tempScriptPath
        Write-LogSuccess "测试数据集创建完成"
    } finally {
        Remove-Item -Path $tempScriptPath -ErrorAction SilentlyContinue
    }
}

# 从文件导入 InfluxDB 数据
function Import-InfluxDBFromFile {
    param([string]$FilePath)
    
    Write-LogInfo "从文件导入 InfluxDB 数据: $(Split-Path -Leaf $FilePath)"
    
    try {
        if (Test-DockerContainer -ContainerName $script:DatabaseConfig.InfluxDB.Container) {
            # 使用 Docker 导入
            Get-Content $FilePath | docker exec -i $script:DatabaseConfig.InfluxDB.Container influx write --bucket $script:DatabaseConfig.InfluxDB.Bucket --org $script:DatabaseConfig.InfluxDB.Org --token $script:DatabaseConfig.InfluxDB.Token --format lp
            
            if ($LASTEXITCODE -eq 0) {
                Write-LogSuccess "InfluxDB 数据文件导入成功"
            } else {
                Write-LogError "InfluxDB 数据文件导入失败"
            }
        } else {
            Write-LogWarning "InfluxDB 容器未运行，跳过文件导入"
        }
    } catch {
        Write-LogError "InfluxDB 数据导入失败: $($_.Exception.Message)"
    }
}

# 生成 InfluxDB 测试数据
function Generate-InfluxDBTestData {
    Write-LogInfo "生成 InfluxDB 测试监控数据..."
    
    try {
        $headers = @{ 
            "Authorization" = "Token $($script:DatabaseConfig.InfluxDB.Token)"
            "Content-Type" = "text/plain"
        }
        
        # 生成过去24小时的测试数据
        $writeUrl = "$($script:DatabaseConfig.InfluxDB.URL)/api/v2/write?org=$($script:DatabaseConfig.InfluxDB.Org)&bucket=$($script:DatabaseConfig.InfluxDB.Bucket)"
        
        $dataPoints = @()
        $now = [DateTimeOffset]::UtcNow
        
        # 生成 CPU 使用率数据
        for ($i = 0; $i -lt 288; $i++) {  # 24小时，每5分钟一个点
            $timestamp = $now.AddMinutes(-($i * 5))
            $cpuUsage = 20 + (Get-Random -Minimum 0 -Maximum 60)
            $memoryUsage = 40 + (Get-Random -Minimum 0 -Maximum 40)
            
            # 计算Unix纳秒时间戳（兼容旧版.NET Framework）
            $unixEpoch = [DateTimeOffset]::new(1970, 1, 1, 0, 0, 0, [TimeSpan]::Zero)
            $nanoseconds = ($timestamp - $unixEpoch).Ticks * 100
            
            $dataPoints += "system_metrics,host=test-server-01,type=cpu value=$cpuUsage $nanoseconds"
            $dataPoints += "system_metrics,host=test-server-01,type=memory value=$memoryUsage $nanoseconds"
        }
        
        # 分批写入数据（每次100个点）
        $batchSize = 100
        for ($i = 0; $i -lt $dataPoints.Count; $i += $batchSize) {
            $batch = $dataPoints[$i..([Math]::Min($i + $batchSize - 1, $dataPoints.Count - 1))]
            $batchData = $batch -join "`n"
            
            Invoke-RestMethod -Uri $writeUrl -Headers $headers -Method Post -Body $batchData -TimeoutSec 30
        }
        
        Write-LogSuccess "InfluxDB 测试数据生成完成"
        
    } catch {
        Write-LogError "InfluxDB 测试数据生成失败: $($_.Exception.Message)"
    }
}

# 数据库备份功能
function Backup-AllDatabases {
    Write-LogStep "开始备份所有数据库..."
    
    # 创建备份目录
    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $dateDir = Get-Date -Format "yyyyMMdd"
    
    $backupResults = @{
        PostgreSQL = $false
        Redis = $false
        InfluxDB = $false
    }
    
    # 备份 PostgreSQL
    if (Test-PostgreSQLConnection) {
        try {
            $backupResults.PostgreSQL = Backup-PostgreSQLDatabase -Timestamp $timestamp -DateDir $dateDir
        } catch {
            Write-LogError "PostgreSQL 备份失败: $($_.Exception.Message)"
        }
    } else {
        Write-LogWarning "PostgreSQL 连接失败，跳过备份"
    }
    
    # 备份 Redis
    if (Test-RedisConnection) {
        try {
            $backupResults.Redis = Backup-RedisDatabase -Timestamp $timestamp -DateDir $dateDir
        } catch {
            Write-LogError "Redis 备份失败: $($_.Exception.Message)"
        }
    } else {
        Write-LogWarning "Redis 连接失败，跳过备份"
    }
    
    # 备份 InfluxDB
    if (Test-InfluxDBConnection) {
        try {
            $backupResults.InfluxDB = Backup-InfluxDBDatabase -Timestamp $timestamp -DateDir $dateDir
        } catch {
            Write-LogError "InfluxDB 备份失败: $($_.Exception.Message)"
        }
    } else {
        Write-LogWarning "InfluxDB 连接失败，跳过备份"
    }
    
    # 显示备份结果
    Show-BackupSummary -Results $backupResults -Timestamp $timestamp
    
    # 清理旧备份
    Cleanup-OldBackups
}

# 备份 PostgreSQL 数据库
function Backup-PostgreSQLDatabase {
    param([string]$Timestamp, [string]$DateDir)
    
    Write-LogInfo "备份 PostgreSQL 数据库..."
    
    $pgConfig = $script:DatabaseConfig.PostgreSQL
    $backupDir = Join-Path $script:BackupPath "postgres\$DateDir"
    
    if (-not (Test-Path $backupDir)) {
        New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    }
    
    $sqlBackupFile = Join-Path $backupDir "inspect_db_backup_${Timestamp}.sql"
    $customBackupFile = Join-Path $backupDir "inspect_db_backup_${Timestamp}.custom"
    
    try {
        if (Test-DockerContainer -ContainerName $pgConfig.Container) {
            # Docker 环境备份
            Write-LogInfo "创建 SQL 格式备份..."
            $sqlResult = docker exec $pgConfig.Container pg_dump -U $pgConfig.User -d $pgConfig.Database --clean --if-exists --no-owner --no-privileges 2>$null
            
            if ($LASTEXITCODE -eq 0) {
                $sqlResult | Out-File -FilePath $sqlBackupFile -Encoding UTF8
                
                # 压缩 SQL 备份
                Compress-Archive -Path $sqlBackupFile -DestinationPath "${sqlBackupFile}.zip" -Force
                Remove-Item -Path $sqlBackupFile
                
                Write-LogSuccess "PostgreSQL SQL 备份完成: ${sqlBackupFile}.zip"
            } else {
                Write-LogError "PostgreSQL SQL 备份失败"
                return $false
            }
            
            Write-LogInfo "创建 Custom 格式备份..."
            $customResult = docker exec $pgConfig.Container pg_dump -U $pgConfig.User -d $pgConfig.Database -Fc --no-owner --no-privileges 2>$null
            
            if ($LASTEXITCODE -eq 0) {
                $customResult | Set-Content -Path $customBackupFile -Encoding Byte
                Write-LogSuccess "PostgreSQL Custom 备份完成: $customBackupFile"
            } else {
                Write-LogError "PostgreSQL Custom 备份失败"
            }
            
        } else {
            # 本地环境备份
            Write-LogInfo "本地环境 PostgreSQL 备份..."
            $backupScript = @"
import subprocess
import sys
import os

try:
    # SQL 格式备份
    sql_cmd = [
        'pg_dump',
        '-h', '$($pgConfig.Host)',
        '-p', '$($pgConfig.Port)',
        '-U', '$($pgConfig.User)',
        '-d', '$($pgConfig.Database)',
        '--clean', '--if-exists', '--no-owner', '--no-privileges'
    ]
    
    env = os.environ.copy()
    env['PGPASSWORD'] = '$($pgConfig.Password)'
    
    with open('$($sqlBackupFile.Replace('\', '\\'))', 'w', encoding='utf-8') as f:
        result = subprocess.run(sql_cmd, stdout=f, stderr=subprocess.PIPE, env=env, text=True)
    
    if result.returncode == 0:
        print('SQL backup successful')
    else:
        print(f'SQL backup failed: {result.stderr}')
        sys.exit(1)
        
    # Custom 格式备份
    custom_cmd = sql_cmd[:-4] + ['-Fc']  # 移除最后4个参数，添加 -Fc
    
    with open('$($customBackupFile.Replace('\', '\\'))', 'wb') as f:
        result = subprocess.run(custom_cmd, stdout=f, stderr=subprocess.PIPE, env=env)
    
    if result.returncode == 0:
        print('Custom backup successful')
    else:
        print(f'Custom backup failed: {result.stderr}')
        
except Exception as e:
    print(f'Backup failed: {e}')
    sys.exit(1)
"@
            $result = python -c $backupScript
            Write-LogInfo "备份结果: $result"
            
            if (Test-Path $sqlBackupFile) {
                # 压缩 SQL 备份
                Compress-Archive -Path $sqlBackupFile -DestinationPath "${sqlBackupFile}.zip" -Force
                Remove-Item -Path $sqlBackupFile
            }
        }
        
        # 显示备份文件大小
        if (Test-Path "${sqlBackupFile}.zip") {
            $size = (Get-Item "${sqlBackupFile}.zip").Length / 1MB
            Write-LogInfo "SQL 备份文件大小: $([math]::Round($size, 2)) MB"
        }
        
        if (Test-Path $customBackupFile) {
            $size = (Get-Item $customBackupFile).Length / 1MB
            Write-LogInfo "Custom 备份文件大小: $([math]::Round($size, 2)) MB"
        }
        
        return $true
        
    } catch {
        Write-LogError "PostgreSQL 备份过程中发生错误: $($_.Exception.Message)"
        return $false
    }
}

# 备份 Redis 数据库
function Backup-RedisDatabase {
    param([string]$Timestamp, [string]$DateDir)
    
    Write-LogInfo "备份 Redis 数据库..."
    
    $redisConfig = $script:DatabaseConfig.Redis
    $backupDir = Join-Path $script:BackupPath "redis\$DateDir"
    
    if (-not (Test-Path $backupDir)) {
        New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    }
    
    $rdbBackupFile = Join-Path $backupDir "redis_dump_${Timestamp}.rdb"
    $configBackupFile = Join-Path $backupDir "redis_config_${Timestamp}.txt"
    
    try {
        if (Test-DockerContainer -ContainerName $redisConfig.Container) {
            # 触发 Redis BGSAVE
            Write-LogInfo "触发 Redis BGSAVE..."
            docker exec -e REDISCLI_AUTH=$($redisConfig.Password) $redisConfig.Container redis-cli BGSAVE 2>$null | Out-Null
            
            if ($LASTEXITCODE -eq 0) {
                Write-LogInfo "BGSAVE 已触发，等待完成..."
                
                # 等待 BGSAVE 完成
                $initialSave = docker exec -e REDISCLI_AUTH=$($redisConfig.Password) $redisConfig.Container redis-cli LASTSAVE 2>$null
                do {
                    Start-Sleep -Seconds 2
                    $currentSave = docker exec -e REDISCLI_AUTH=$($redisConfig.Password) $redisConfig.Container redis-cli LASTSAVE 2>$null
                } while ($initialSave -eq $currentSave)
                
                # 复制 RDB 文件
                docker cp "${redisConfig.Container}:/data/dump.rdb" $rdbBackupFile
                
                if (Test-Path $rdbBackupFile) {
                    # 压缩 RDB 文件
                    Compress-Archive -Path $rdbBackupFile -DestinationPath "${rdbBackupFile}.zip" -Force
                    Remove-Item -Path $rdbBackupFile
                    
                    $size = (Get-Item "${rdbBackupFile}.zip").Length / 1MB
                    Write-LogSuccess "Redis 备份完成: ${rdbBackupFile}.zip ($([math]::Round($size, 2)) MB)"
                } else {
                    Write-LogError "Redis RDB 文件复制失败"
                    return $false
                }
                
                # 备份 Redis 配置
                $configResult = docker exec -e REDISCLI_AUTH=$($redisConfig.Password) $redisConfig.Container redis-cli CONFIG GET "*" 2>$null
                $configResult | Out-File -FilePath $configBackupFile -Encoding UTF8
                Write-LogSuccess "Redis 配置备份完成: $configBackupFile"
                
                return $true
            } else {
                Write-LogError "Redis BGSAVE 失败"
                return $false
            }
        } else {
            Write-LogWarning "Redis 容器未运行，跳过备份"
            return $false
        }
        
    } catch {
        Write-LogError "Redis 备份过程中发生错误: $($_.Exception.Message)"
        return $false
    }
}

# 备份 InfluxDB 数据库
function Backup-InfluxDBDatabase {
    param([string]$Timestamp, [string]$DateDir)
    
    Write-LogInfo "备份 InfluxDB 数据库..."
    
    $influxConfig = $script:DatabaseConfig.InfluxDB
    $backupDir = Join-Path $script:BackupPath "influxdb\$DateDir"
    
    if (-not (Test-Path $backupDir)) {
        New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    }
    
    $influxBackupDir = Join-Path $backupDir "influxdb_backup_${Timestamp}"
    $configBackupFile = Join-Path $backupDir "influxdb_config_${Timestamp}.json"
    
    try {
        if (Test-DockerContainer -ContainerName $influxConfig.Container) {
            # 使用 InfluxDB CLI 备份
            Write-LogInfo "使用 influx CLI 备份数据..."
            
            $backupCmd = @(
                "influx", "backup",
                "--host", "http://localhost:8086",
                "--token", $influxConfig.Token,
                "--org", $influxConfig.Org,
                "--bucket", $influxConfig.Bucket,
                "/tmp/backup_${Timestamp}"
            )
            
            docker exec $influxConfig.Container @backupCmd 2>$null
            
            if ($LASTEXITCODE -eq 0) {
                # 从容器复制备份文件
                docker cp "${influxConfig.Container}:/tmp/backup_${Timestamp}" $influxBackupDir 2>$null
                
                if (Test-Path $influxBackupDir) {
                    # 压缩备份目录
                    $zipFile = "${influxBackupDir}.zip"
                    Compress-Archive -Path $influxBackupDir -DestinationPath $zipFile -Force
                    Remove-Item -Path $influxBackupDir -Recurse -Force
                    
                    $size = (Get-Item $zipFile).Length / 1MB
                    Write-LogSuccess "InfluxDB 备份完成: $zipFile ($([math]::Round($size, 2)) MB)"
                } else {
                    Write-LogError "从容器复制 InfluxDB 备份失败"
                    return $false
                }
                
                # 清理容器内临时文件
                docker exec $influxConfig.Container rm -rf "/tmp/backup_${Timestamp}" 2>$null | Out-Null
                
            } else {
                Write-LogError "InfluxDB 备份失败"
                return $false
            }
            
            # 备份 InfluxDB 配置
            try {
                $headers = @{ "Authorization" = "Token $($influxConfig.Token)" }
                $configData = Invoke-RestMethod -Uri "$($influxConfig.URL)/api/v2/config" -Headers $headers -Method Get -TimeoutSec 10
                $configData | ConvertTo-Json -Depth 10 | Out-File -FilePath $configBackupFile -Encoding UTF8
                Write-LogSuccess "InfluxDB 配置备份完成: $configBackupFile"
            } catch {
                Write-LogWarning "InfluxDB 配置备份失败: $($_.Exception.Message)"
            }
            
            return $true
            
        } else {
            Write-LogWarning "InfluxDB 容器未运行，跳过备份"
            return $false
        }
        
    } catch {
        Write-LogError "InfluxDB 备份过程中发生错误: $($_.Exception.Message)"
        return $false
    }
}

# 显示备份结果汇总
function Show-BackupSummary {
    param($Results, [string]$Timestamp)
    
    Write-Host ""
    Write-Host "📊 备份结果汇总 - $Timestamp" -ForegroundColor Cyan
    Write-Host "=================================" -ForegroundColor Cyan
    
    $successCount = 0
    $totalCount = $Results.Keys.Count
    
    foreach ($db in $Results.Keys) {
        $status = if ($Results[$db]) { "✅ 成功" } else { "❌ 失败" }
        $color = if ($Results[$db]) { "Green" } else { "Red" }
        Write-Host "${db}: " -NoNewline
        Write-Host $status -ForegroundColor $color
        
        if ($Results[$db]) { $successCount++ }
    }
    
    Write-Host ""
    Write-Host "备份统计: $successCount/$totalCount 成功" -ForegroundColor $(if ($successCount -eq $totalCount) { "Green" } else { "Yellow" })
    
    # 显示备份目录总大小
    if (Test-Path $script:BackupPath) {
        try {
            $totalSize = (Get-ChildItem $script:BackupPath -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB
            Write-Host "备份总大小: $([math]::Round($totalSize, 2)) MB"
        } catch {
            Write-LogWarning "无法计算备份总大小"
        }
    }
    
    Write-Host ""
    Write-Host "备份文件位置: $script:BackupPath"
}

# 清理旧备份
function Cleanup-OldBackups {
    param([int]$RetentionDays = 7)
    
    Write-LogInfo "清理 $RetentionDays 天前的备份文件..."
    
    try {
        $cutoffDate = (Get-Date).AddDays(-$RetentionDays)
        
        $oldFiles = Get-ChildItem $script:BackupPath -Recurse -File | Where-Object { $_.LastWriteTime -lt $cutoffDate }
        
        if ($oldFiles.Count -gt 0) {
            foreach ($file in $oldFiles) {
                Remove-Item $file.FullName -Force
                Write-LogInfo "删除旧备份文件: $($file.Name)"
            }
            
            Write-LogSuccess "清理了 $($oldFiles.Count) 个旧备份文件"
        } else {
            Write-LogInfo "没有需要清理的旧备份文件"
        }
        
        # 清理空目录
        $emptyDirs = Get-ChildItem $script:BackupPath -Recurse -Directory | Where-Object { (Get-ChildItem $_.FullName -Force).Count -eq 0 }
        foreach ($dir in $emptyDirs) {
            Remove-Item $dir.FullName -Force
        }
        
    } catch {
        Write-LogWarning "清理旧备份时发生错误: $($_.Exception.Message)"
    }
}

# 数据库恢复功能
function Restore-DatabaseData {
    Write-LogStep "数据库恢复功能..."
    
    Write-Host ""
    Write-Host "🔄 数据库恢复选项" -ForegroundColor Cyan
    Write-Host "==================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "1. 恢复 PostgreSQL 数据库"
    Write-Host "2. 恢复 Redis 数据库"
    Write-Host "3. 恢复 InfluxDB 数据库"
    Write-Host "4. 列出可用的备份文件"
    Write-Host "5. 取消恢复操作"
    Write-Host ""
    
    $choice = Read-Host "请选择恢复选项 (1-5，默认 5)"
    if ([string]::IsNullOrWhiteSpace($choice)) {
        $choice = "5"
    }
    
    switch ($choice) {
        "1" {
            Restore-PostgreSQLFromBackup
        }
        "2" {
            Restore-RedisFromBackup
        }
        "3" {
            Restore-InfluxDBFromBackup
        }
        "4" {
            List-AvailableBackups
        }
        "5" {
            Write-LogInfo "取消恢复操作"
        }
        default {
            Write-LogWarning "无效选择，取消恢复操作"
        }
    }
}

# 列出可用的备份文件
function List-AvailableBackups {
    Write-LogInfo "列出可用的备份文件..."
    
    if (-not (Test-Path $script:BackupPath)) {
        Write-LogWarning "备份目录不存在: $script:BackupPath"
        return
    }
    
    Write-Host ""
    Write-Host "📁 可用备份文件:" -ForegroundColor Cyan
    Write-Host ""
    
    # PostgreSQL 备份
    $pgBackups = Get-ChildItem (Join-Path $script:BackupPath "postgres") -Recurse -Filter "*.zip" -ErrorAction SilentlyContinue
    if ($pgBackups) {
        Write-Host "PostgreSQL 备份:" -ForegroundColor Green
        $pgBackups | ForEach-Object {
            $size = [math]::Round($_.Length / 1MB, 2)
            Write-Host "  $($_.Name) (${size} MB) - $($_.LastWriteTime)"
        }
        Write-Host ""
    }
    
    # Redis 备份
    $redisBackups = Get-ChildItem (Join-Path $script:BackupPath "redis") -Recurse -Filter "*.zip" -ErrorAction SilentlyContinue
    if ($redisBackups) {
        Write-Host "Redis 备份:" -ForegroundColor Green
        $redisBackups | ForEach-Object {
            $size = [math]::Round($_.Length / 1MB, 2)
            Write-Host "  $($_.Name) (${size} MB) - $($_.LastWriteTime)"
        }
        Write-Host ""
    }
    
    # InfluxDB 备份
    $influxBackups = Get-ChildItem (Join-Path $script:BackupPath "influxdb") -Recurse -Filter "*.zip" -ErrorAction SilentlyContinue
    if ($influxBackups) {
        Write-Host "InfluxDB 备份:" -ForegroundColor Green
        $influxBackups | ForEach-Object {
            $size = [math]::Round($_.Length / 1MB, 2)
            Write-Host "  $($_.Name) (${size} MB) - $($_.LastWriteTime)"
        }
        Write-Host ""
    }
    
    if (-not ($pgBackups -or $redisBackups -or $influxBackups)) {
        Write-LogWarning "没有找到任何备份文件"
    }
}

# 从备份恢复 PostgreSQL
function Restore-PostgreSQLFromBackup {
    Write-LogWarning "PostgreSQL 数据库恢复功能需要谨慎操作"
    Write-LogInfo "此功能将在未来版本中实现完整的恢复向导"
    Write-LogInfo "当前建议手动使用 pg_restore 或 psql 命令进行恢复"
    
    List-AvailableBackups
}

# 从备份恢复 Redis
function Restore-RedisFromBackup {
    Write-LogWarning "Redis 数据库恢复功能需要谨慎操作"
    Write-LogInfo "此功能将在未来版本中实现完整的恢复向导"
    Write-LogInfo "当前建议手动替换 dump.rdb 文件并重启 Redis"
    
    List-AvailableBackups
}

# 从备份恢复 InfluxDB
function Restore-InfluxDBFromBackup {
    Write-LogWarning "InfluxDB 数据库恢复功能需要谨慎操作"
    Write-LogInfo "此功能将在未来版本中实现完整的恢复向导"
    Write-LogInfo "当前建议使用 influx restore 命令手动恢复"
    
    List-AvailableBackups
}

function Clean-AllDatabases {
    Write-LogStep "清理所有数据库..."
    
    $confirm = Read-Host "⚠️ 警告: 这将删除所有数据库数据。是否确认继续? (yes/N)"
    if ($confirm -ne "yes") {
        Write-LogInfo "用户取消清理操作"
        return
    }
    
    # 清理 PostgreSQL
    if (Test-PostgreSQLConnection) {
        Write-LogInfo "清理 PostgreSQL 数据库..."
        Drop-PostgreSQLDatabase
        Write-LogSuccess "PostgreSQL 数据库已清理"
    }
    
    # 清理 Redis（如果需要）
    if (Test-RedisConnection) {
        Write-LogInfo "清理 Redis 缓存..."
        try {
            if (Test-DockerContainer -ContainerName $script:DatabaseConfig.Redis.Container) {
                docker exec -e REDISCLI_AUTH=$($script:DatabaseConfig.Redis.Password) $script:DatabaseConfig.Redis.Container redis-cli FLUSHALL
                Write-LogSuccess "Redis 缓存已清理"
            }
        } catch {
            Write-LogWarning "Redis 清理失败: $($_.Exception.Message)"
        }
    }
    
    Write-LogSuccess "数据库清理完成"
}

function Run-HealthCheck {
    Write-LogStep "运行数据库健康检查..."
    
    # 使用现有的健康检查脚本
    $healthCheckScript = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "db-health-check.ps1"
    if (Test-Path $healthCheckScript) {
        Write-LogInfo "执行专用健康检查脚本..."
        & $healthCheckScript
    } else {
        Write-LogInfo "使用内置健康检查..."
        Test-AllDatabaseConnections
    }
}

# 执行主函数
Main