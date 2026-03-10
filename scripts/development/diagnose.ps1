# 开发环境诊断脚本
# 用于快速诊断开发环境问题

param(
    [switch]$Verbose
)

$ErrorActionPreference = "Continue"

function Write-Status {
    param(
        [string]$Message,
        [string]$Status,
        [string]$Detail = ""
    )
    
    $icon = switch ($Status) {
        "OK" { "✅"; $color = "Green" }
        "WARN" { "⚠️"; $color = "Yellow" }
        "ERROR" { "❌"; $color = "Red" }
        "INFO" { "ℹ️"; $color = "Cyan" }
        default { "•"; $color = "White" }
    }
    
    Write-Host "$icon $Message" -ForegroundColor $color
    if ($Detail -and $Verbose) {
        Write-Host "   $Detail" -ForegroundColor Gray
    }
}

Write-Host "`n🔍 开发环境诊断工具" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan

# 1. 检查必需工具
Write-Host "`n📦 检查必需工具..." -ForegroundColor Blue

$tools = @(
    @{ Name = "Docker"; Command = "docker" },
    @{ Name = "Docker Compose"; Command = "docker-compose" },
    @{ Name = "Go"; Command = "go" },
    @{ Name = "Node.js"; Command = "node" },
    @{ Name = "pnpm"; Command = "pnpm" }
)

foreach ($tool in $tools) {
    try {
        $version = & $tool.Command --version 2>&1
        Write-Status "$($tool.Name)" "OK" $version
    }
    catch {
        Write-Status "$($tool.Name)" "ERROR" "未安装或不可用"
    }
}

# 2. 检查 Docker 服务
Write-Host "`n🐳 检查 Docker 服务..." -ForegroundColor Blue

try {
    $dockerInfo = docker info 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Status "Docker 服务" "OK"
    } else {
        Write-Status "Docker 服务" "ERROR" "Docker 未运行"
    }
}
catch {
    Write-Status "Docker 服务" "ERROR" $_.Exception.Message
}

# 3. 检查数据库容器
Write-Host "`n🗄️ 检查数据库容器..." -ForegroundColor Blue

$containers = @(
    @{ Name = "PostgreSQL"; Container = "inspect-postgres-dev"; Port = 15500 },
    @{ Name = "Redis"; Container = "inspect-redis-dev"; Port = 16379 }
)

foreach ($container in $containers) {
    $running = docker ps --filter "name=$($container.Container)" --format "{{.Names}}" 2>$null
    if ($running -eq $container.Container) {
        Write-Status "$($container.Name) 容器" "OK" "$($container.Container) 运行中"
        
        # 测试端口
        try {
            $connection = Test-NetConnection -ComputerName localhost -Port $container.Port -WarningAction SilentlyContinue
            if ($connection.TcpTestSucceeded) {
                Write-Status "  端口 $($container.Port)" "OK" "可访问"
            } else {
                Write-Status "  端口 $($container.Port)" "WARN" "不可访问"
            }
        }
        catch {
            Write-Status "  端口 $($container.Port)" "ERROR" $_.Exception.Message
        }
    } else {
        Write-Status "$($container.Name) 容器" "WARN" "未运行"
    }
}

# 4. 检查配置文件
Write-Host "`n📄 检查配置文件..." -ForegroundColor Blue

$configFiles = @(
    @{ Name = "docker-compose.dev.yml"; Path = "docker-compose.dev.yml" },
    @{ Name = "docker-compose.prod.yml"; Path = "docker-compose.prod.yml" },
    @{ Name = "docker-compose.yml (旧版/已迁移)"; Path = "docker-compose.yml" },
    @{ Name = ".env"; Path = ".env" },
    @{ Name = ".env.development"; Path = ".env.development" },
    @{ Name = "frontend/.env.local"; Path = "frontend/.env.local" }
)

foreach ($file in $configFiles) {
    if (Test-Path $file.Path) {
        Write-Status "$($file.Name)" "OK" "存在"
    } else {
        Write-Status "$($file.Name)" "WARN" "不存在"
    }
}

# 5. 检查目录结构
Write-Host "`n📁 检查目录结构..." -ForegroundColor Blue

$directories = @(
    @{ Name = "backend-go"; Path = "backend-go" },
    @{ Name = "frontend"; Path = "frontend" },
    @{ Name = "database"; Path = "database" },
    @{ Name = "logs"; Path = "logs" },
    @{ Name = "data"; Path = "data" }
)

foreach ($dir in $directories) {
    if (Test-Path $dir.Path) {
        Write-Status "$($dir.Name)" "OK" "存在"
    } else {
        Write-Status "$($dir.Name)" "WARN" "不存在"
    }
}

# 6. 检查端口占用
Write-Host "`n🔌 检查端口占用..." -ForegroundColor Blue

$ports = @(3000, 8000, 15500, 16379, 5050, 8081)

foreach ($port in $ports) {
    $connection = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($connection) {
        $process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
        Write-Status "端口 $port" "WARN" "被占用 (进程: $($process.ProcessName))"
    } else {
        Write-Status "端口 $port" "OK" "可用"
    }
}

# 7. 检查 Docker 网络
Write-Host "`n🌐 检查 Docker 网络..." -ForegroundColor Blue

try {
    $networks = docker network ls --format "{{.Name}}" 2>$null
    if ($networks -match "inspect") {
        $inspectNetworks = $networks | Select-String "inspect"
        foreach ($network in $inspectNetworks) {
            Write-Status "网络: $network" "OK"
        }
    } else {
        Write-Status "inspect_network" "INFO" "未创建（首次启动时会自动创建）"
    }
}
catch {
    Write-Status "Docker 网络" "ERROR" $_.Exception.Message
}

# 8. 总结和建议
Write-Host "`n📊 诊断总结" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan

Write-Host "`n💡 建议操作:" -ForegroundColor Yellow

# 检查是否有数据库运行
$pgRunning = docker ps --filter "name=inspect-postgres-dev" --format "{{.Names}}" 2>$null
$redisRunning = docker ps --filter "name=inspect-redis-dev" --format "{{.Names}}" 2>$null

if ($pgRunning -and $redisRunning) {
    Write-Host "  ✅ 数据库已运行，可以直接启动后端和前端" -ForegroundColor Green
    Write-Host "     .\scripts\development\dev-start.ps1 -Services backend" -ForegroundColor White
} elseif (-not $pgRunning -and -not $redisRunning) {
    Write-Host "  🚀 数据库未运行，建议启动完整开发环境" -ForegroundColor Cyan
    Write-Host "     .\scripts\development\dev-start.ps1" -ForegroundColor White
} else {
    Write-Host "  ⚠️ 部分数据库服务运行中，建议重启" -ForegroundColor Yellow
    Write-Host "     .\scripts\database\db-manage.ps1 stop" -ForegroundColor White
    Write-Host "     .\scripts\database\db-manage.ps1 start" -ForegroundColor White
}

Write-Host "`n📚 更多帮助:" -ForegroundColor Yellow
Write-Host "  - 查看开发文档: .\scripts\development\README.md" -ForegroundColor White
Write-Host "  - 数据库管理: .\scripts\database\db-manage.ps1 -h" -ForegroundColor White
Write-Host "  - 测试数据库: .\scripts\development\test-db-status.ps1" -ForegroundColor White

Write-Host ""
