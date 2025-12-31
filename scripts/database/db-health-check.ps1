# 企业级网络设备巡检系统 - 数据库健康检查脚本 (PowerShell 版本)
# 用于检查PostgreSQL、Redis、InfluxDB三种数据库的健康状态

param(
    [switch]$Help
)

# 设置错误处理
$ErrorActionPreference = "Stop"

# 全局变量
$script:TotalChecks = 0
$script:PassedChecks = 0
$script:FailedChecks = 0

# 配置信息
$Config = @{
    PostgreSQL = @{
        Container = "inspect-postgres-dev"
        User = "inspect_dev"
        Database = "inspect_system_dev"
        Port = 5433
    }
    Redis = @{
        Container = "inspect-redis-dev"
        Password = "dev_redis_2024"
        Port = 6380
    }
    InfluxDB = @{
        Container = "inspect-influxdb-dev"
        Token = "dev_token_2024"
        URL = "http://localhost:8087"
        Port = 8087
        Bucket = "device_metrics_dev"
    }
}

# 日志函数
function Write-LogInfo {
    param([string]$Message)
    Write-Host "[信息] $Message" -ForegroundColor Blue
}

function Write-LogSuccess {
    param([string]$Message)
    Write-Host "[成功] $Message" -ForegroundColor Green
}

function Write-LogWarning {
    param([string]$Message)
    Write-Host "[警告] $Message" -ForegroundColor Yellow
}

function Write-LogError {
    param([string]$Message)
    Write-Host "[错误] $Message" -ForegroundColor Red
}

# 记录检查结果
function Record-Check {
    param([bool]$Success)
    
    $script:TotalChecks++
    if ($Success) {
        $script:PassedChecks++
        return $true
    } else {
        $script:FailedChecks++
        return $false
    }
}

# 安全执行命令
function Invoke-SafeCommand {
    param(
        [string]$Command,
        [array]$Arguments = @(),
        [switch]$SuppressOutput
    )
    
    # 临时保存错误处理设置
    $originalErrorAction = $ErrorActionPreference
    
    try {
        if ($SuppressOutput) {
            # 临时改变错误处理，避免 Redis 警告被当作异常
            $ErrorActionPreference = "Continue"
            $result = & $Command @Arguments 2>&1
            $success = $LASTEXITCODE -eq 0
            
            if ($success) {
                # 过滤掉 Redis 密码警告，但保留实际输出
                $filteredResult = $result | Where-Object { $_ -notlike "*Using a password*" }
                return @{ Success = $true; Output = $filteredResult }
            } else {
                return @{ Success = $false; Error = "Command failed with exit code $LASTEXITCODE" }
            }
        } else {
            $result = & $Command @Arguments
            return @{ Success = $true; Output = $result }
        }
    } catch {
        return @{ Success = $false; Error = $_.Exception.Message }
    } finally {
        # 恢复错误处理设置
        $ErrorActionPreference = $originalErrorAction
    }
}

# 检查 Docker 容器是否运行
function Test-DockerContainer {
    param([string]$ContainerName)
    
    $result = Invoke-SafeCommand -Command "docker" -Arguments @("ps", "--format", "table {{.Names}}") -SuppressOutput
    if ($result.Success) {
        return $result.Output -contains $ContainerName
    }
    return $false
}

# 测试端口连通性
function Test-PortConnectivity {
    param(
        [string]$ComputerName = "localhost",
        [int]$Port
    )
    
    try {
        $connection = Test-NetConnection -ComputerName $ComputerName -Port $Port -WarningAction SilentlyContinue
        return $connection.TcpTestSucceeded
    } catch {
        return $false
    }
}

# PostgreSQL 健康检查
function Test-PostgreSQL {
    Write-LogInfo "检查 PostgreSQL 数据库..."
    
    $pgConfig = $Config.PostgreSQL
    
    # 检查容器是否运行
    if (-not (Test-DockerContainer -ContainerName $pgConfig.Container)) {
        Write-LogError "PostgreSQL 容器 $($pgConfig.Container) 未运行"
        Record-Check -Success $false
        return
    }
    
    # 检查数据库连接
    $connectResult = Invoke-SafeCommand -Command "docker" -Arguments @(
        "exec", $pgConfig.Container, 
        "pg_isready", "-U", $pgConfig.User, "-d", $pgConfig.Database
    ) -SuppressOutput
    
    if ($connectResult.Success) {
        Write-LogSuccess "PostgreSQL 连接正常"
        
        # 检查数据库版本
        $versionResult = Invoke-SafeCommand -Command "docker" -Arguments @(
            "exec", $pgConfig.Container,
            "psql", "-U", $pgConfig.User, "-d", $pgConfig.Database, 
            "-t", "-c", "SELECT version();"
        ) -SuppressOutput
        
        if ($versionResult.Success) {
            $version = ($versionResult.Output | Select-Object -First 1).Trim()
            Write-LogInfo "PostgreSQL 版本: $version"
        }
        
        # 检查数据库大小
        $sizeQuery = "SELECT pg_size_pretty(pg_database_size('$($pgConfig.Database)'));"
        $sizeResult = Invoke-SafeCommand -Command "docker" -Arguments @(
            "exec", $pgConfig.Container,
            "psql", "-U", $pgConfig.User, "-d", $pgConfig.Database,
            "-t", "-c", $sizeQuery
        ) -SuppressOutput
        
        if ($sizeResult.Success) {
            $size = ($sizeResult.Output | Select-Object -First 1).Trim()
            Write-LogInfo "数据库大小: $size"
        }
        
        Record-Check -Success $true
    } else {
        Write-LogError "PostgreSQL 连接失败"
        Record-Check -Success $false
    }
    
    # 检查端口连通性
    if (Test-PortConnectivity -Port $pgConfig.Port) {
        Write-LogSuccess "PostgreSQL 端口 $($pgConfig.Port) 可访问"
        Record-Check -Success $true
    } else {
        Write-LogError "PostgreSQL 端口 $($pgConfig.Port) 不可访问"
        Record-Check -Success $false
    }
}

# Redis 健康检查
function Test-Redis {
    Write-LogInfo "检查 Redis 缓存数据库..."
    
    $redisConfig = $Config.Redis
    
    # 检查容器是否运行
    if (-not (Test-DockerContainer -ContainerName $redisConfig.Container)) {
        Write-LogError "Redis 容器 $($redisConfig.Container) 未运行"
        Record-Check -Success $false
        return
    }
    
    # 检查 Redis 连接
    $pingResult = Invoke-SafeCommand -Command "docker" -Arguments @(
        "exec", $redisConfig.Container,
        "redis-cli", "-a", $redisConfig.Password, "ping"
    ) -SuppressOutput
    
    if ($pingResult.Success -and ($pingResult.Output -join " ") -like "*PONG*") {
        Write-LogSuccess "Redis 连接正常"
        
        # 检查 Redis 版本
        $versionResult = Invoke-SafeCommand -Command "docker" -Arguments @(
            "exec", $redisConfig.Container,
            "redis-cli", "-a", $redisConfig.Password, "INFO", "server"
        ) -SuppressOutput
        
        if ($versionResult.Success) {
            $versionLine = $versionResult.Output | Where-Object { $_ -match "redis_version:" }
            if ($versionLine) {
                $version = ($versionLine -split ":")[1].Trim()
                Write-LogInfo "Redis 版本: $version"
            }
        }
        
        # 检查内存使用情况
        $memoryResult = Invoke-SafeCommand -Command "docker" -Arguments @(
            "exec", $redisConfig.Container,
            "redis-cli", "-a", $redisConfig.Password, "INFO", "memory"
        ) -SuppressOutput
        
        if ($memoryResult.Success) {
            $memoryLine = $memoryResult.Output | Where-Object { $_ -match "used_memory_human:" }
            if ($memoryLine) {
                $memory = ($memoryLine -split ":")[1].Trim()
                Write-LogInfo "Redis 内存使用: $memory"
            }
        }
        
        # 检查连接数
        $clientsResult = Invoke-SafeCommand -Command "docker" -Arguments @(
            "exec", $redisConfig.Container,
            "redis-cli", "-a", $redisConfig.Password, "INFO", "clients"
        ) -SuppressOutput
        
        if ($clientsResult.Success) {
            $clientsLine = $clientsResult.Output | Where-Object { $_ -match "connected_clients:" }
            if ($clientsLine) {
                $clients = ($clientsLine -split ":")[1].Trim()
                Write-LogInfo "Redis 连接数: $clients"
            }
        }
        
        Record-Check -Success $true
    } else {
        Write-LogError "Redis 连接失败"
        Record-Check -Success $false
    }
    
    # 检查端口连通性
    if (Test-PortConnectivity -Port $redisConfig.Port) {
        Write-LogSuccess "Redis 端口 $($redisConfig.Port) 可访问"
        Record-Check -Success $true
    } else {
        Write-LogError "Redis 端口 $($redisConfig.Port) 不可访问"
        Record-Check -Success $false
    }
}

# InfluxDB 健康检查
function Test-InfluxDB {
    Write-LogInfo "检查 InfluxDB 时序数据库..."
    
    $influxConfig = $Config.InfluxDB
    
    # 检查容器是否运行
    if (-not (Test-DockerContainer -ContainerName $influxConfig.Container)) {
        Write-LogError "InfluxDB 容器 $($influxConfig.Container) 未运行"
        Record-Check -Success $false
        return
    }
    
    # 检查 InfluxDB 健康状态
    try {
        $headers = @{ "Authorization" = "Token $($influxConfig.Token)" }
        $healthResponse = Invoke-RestMethod -Uri "$($influxConfig.URL)/health" -Headers $headers -Method Get -TimeoutSec 10
        
        if ($healthResponse.status -eq "pass") {
            Write-LogSuccess "InfluxDB 健康检查通过"
            
            if ($healthResponse.version) {
                Write-LogInfo "InfluxDB 版本: $($healthResponse.version)"
            }
            
            Record-Check -Success $true
        } else {
            Write-LogError "InfluxDB 健康检查失败，状态: $($healthResponse.status)"
            Record-Check -Success $false
        }
    } catch {
        Write-LogError "InfluxDB 健康检查API无响应: $($_.Exception.Message)"
        Record-Check -Success $false
    }
    
    # 检查端口连通性
    if (Test-PortConnectivity -Port $influxConfig.Port) {
        Write-LogSuccess "InfluxDB 端口 $($influxConfig.Port) 可访问"
        Record-Check -Success $true
    } else {
        Write-LogError "InfluxDB 端口 $($influxConfig.Port) 不可访问"
        Record-Check -Success $false
    }
    
    # 检查存储桶
    try {
        $headers = @{ "Authorization" = "Token $($influxConfig.Token)" }
        $bucketsResponse = Invoke-RestMethod -Uri "$($influxConfig.URL)/api/v2/buckets" -Headers $headers -Method Get -TimeoutSec 10
        
        $bucketExists = $bucketsResponse.buckets | Where-Object { $_.name -eq $influxConfig.Bucket }
        if ($bucketExists) {
            Write-LogSuccess "InfluxDB 存储桶 '$($influxConfig.Bucket)' 存在"
            Record-Check -Success $true
        } else {
            Write-LogWarning "InfluxDB 存储桶 '$($influxConfig.Bucket)' 不存在或无法访问"
            Record-Check -Success $false
        }
    } catch {
        Write-LogWarning "InfluxDB 存储桶 '$($influxConfig.Bucket)' 不存在或无法访问: $($_.Exception.Message)"
        Record-Check -Success $false
    }
}

# 检查必要工具
function Test-Dependencies {
    Write-LogInfo "检查必要工具..."
    
    # 检查 docker
    if (-not (Get-Command "docker" -ErrorAction SilentlyContinue)) {
        Write-LogError "Docker 未安装"
        exit 1
    }
    
    # 检查 curl（可选，因为使用了 Invoke-RestMethod）
    if (-not (Get-Command "curl" -ErrorAction SilentlyContinue)) {
        Write-LogWarning "curl 未安装，使用 PowerShell 内置的 Web 请求功能"
    }
}

# 显示检查结果汇总
function Show-Summary {
    Write-Host ""
    Write-LogInfo "====== 数据库健康检查汇总 ======"
    Write-Host "总检查项: $TotalChecks"
    Write-Host "通过: " -NoNewline
    Write-Host "$PassedChecks" -ForegroundColor Green
    Write-Host "失败: " -NoNewline
    Write-Host "$FailedChecks" -ForegroundColor Red
    
    if ($FailedChecks -eq 0) {
        Write-LogSuccess "所有数据库健康检查通过！"
        exit 0
    } else {
        Write-LogError "$FailedChecks 项检查失败"
        exit 1
    }
}

# 显示帮助信息
function Show-Help {
    Write-Host @"
企业级网络设备巡检系统 - 数据库健康检查脚本 (PowerShell 版本)

用法: 
    .\db-health-check-cn.ps1 [-Help]

参数:
    -Help           显示此帮助信息

功能:
    - 检查 PostgreSQL 数据库连接和状态
    - 检查 Redis 缓存数据库连接和状态  
    - 检查 InfluxDB 时序数据库连接和状态
    - 检查各服务的端口连通性
    - 提供详细的健康状态报告

要求:
    - Docker 已安装并运行
    - PowerShell 5.1 或更高版本
    - 相关数据库容器正在运行

示例:
    .\db-health-check-cn.ps1
    .\db-health-check-cn.ps1 -Help
"@
}

# 主函数
function Main {
    if ($Help) {
        Show-Help
        return
    }
    
    Write-Host "?? 企业级网络设备巡检系统 - 数据库健康检查" -ForegroundColor Cyan
    Write-Host "==================================================" -ForegroundColor Cyan
    
    Test-Dependencies
    
    Write-Host ""
    Test-PostgreSQL
    Write-Host ""
    Test-Redis  
    Write-Host ""
    Test-InfluxDB
    
    Show-Summary
}

# 执行主函数
Main