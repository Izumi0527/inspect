#!/usr/bin/env pwsh
<#
.SYNOPSIS
    开发环境快速启动脚本

.DESCRIPTION
    快速启动开发环境的所有必要服务，包括数据库、后端和前端服务
    提供一键启动和状态检查功能

.PARAMETER Services
    指定要启动的服务: database, backend, frontend, all (默认)

.PARAMETER Wait
    启动后等待服务就绪的时间 (秒)

.PARAMETER SkipHealthCheck
    跳过健康检查

.EXAMPLE
    .\dev-start.ps1
    启动所有开发服务

.EXAMPLE
    .\dev-start.ps1 -Services database
    仅启动数据库服务

.EXAMPLE
    .\dev-start.ps1 -Wait 30
    启动服务并等待30秒

.NOTES
    文件名: dev-start.ps1
    作者: 技术团队
    版本: 1.0.0
    创建日期: 2025-12-10
#>

[CmdletBinding()]
param(
    [ValidateSet("database", "backend", "frontend", "all")]
    [string]$Services = "all",
    
    [int]$Wait = 10,
    
    [switch]$SkipHealthCheck
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
        "Gray" = [ConsoleColor]::DarkGray
    }
    
    Write-Host $Message -ForegroundColor $colorMap[$Color]
}

# 执行命令函数
function Invoke-CommandSafely {
    param(
        [string]$Command,
        [string]$Description,
        [string]$WorkingDirectory = $PWD,
        [switch]$IgnoreErrors,
        [switch]$Background
    )
    
    try {
        $originalLocation = Get-Location
        Set-Location $WorkingDirectory
        
        if ($Background) {
            Write-ColorOutput "🚀 后台启动: $Description" "Cyan"
            Start-Process -FilePath "powershell" -ArgumentList "-Command", $Command -WindowStyle Minimized
            return $true
        } else {
            Write-ColorOutput "🔄 $Description..." "Cyan"
            $result = Invoke-Expression $Command
            
            if ($LASTEXITCODE -eq 0 -or $null -eq $LASTEXITCODE) {
                Write-ColorOutput "✅ $Description 完成" "Green"
                return $true
            } else {
                throw "命令执行失败，退出代码: $LASTEXITCODE"
            }
        }
    }
    catch {
        if ($IgnoreErrors) {
            Write-ColorOutput "⚠️ $Description 失败: $($_.Exception.Message)" "Yellow"
            return $false
        } else {
            Write-ColorOutput "❌ $Description 失败: $($_.Exception.Message)" "Red"
            throw
        }
    }
    finally {
        Set-Location $originalLocation
    }
}

# 检查前置条件
function Test-Prerequisites {
    Write-ColorOutput "🔍 检查前置条件..." "Blue"
    
    $tools = @(
        @{ Command = "docker"; Name = "Docker" }
    )

    if ($Services -in @("backend", "all")) {
        $tools += @{ Command = "go"; Name = "Go 运行时" }
    }

    if ($Services -in @("frontend", "all")) {
        $tools += @{ Command = "pnpm"; Name = "pnpm 包管理器" }
    }
    
    $allOk = $true
    foreach ($tool in $tools) {
        try {
            $null = Get-Command $tool.Command -ErrorAction Stop
            Write-ColorOutput "✅ $($tool.Name) 可用" "Green"
        }
        catch {
            Write-ColorOutput "❌ $($tool.Name) 未安装或不可用" "Red"
            $allOk = $false
        }
    }
    
    if (-not $allOk) {
        throw "前置条件检查失败，请先安装必要的工具"
    }
}

# 检查数据库容器是否已运行
function Test-DatabaseRunning {
    try {
        # 检查 PostgreSQL 容器
        $pgContainer = docker ps --filter "name=inspect-postgres-dev" --format "{{.Names}}" 2>$null
        $pgRunning = $pgContainer -eq "inspect-postgres-dev"
        
        # 检查 Redis 容器
        $redisContainer = docker ps --filter "name=inspect-redis-dev" --format "{{.Names}}" 2>$null
        $redisRunning = $redisContainer -eq "inspect-redis-dev"
        
        return @{
            PostgreSQL = $pgRunning
            Redis = $redisRunning
            Both = $pgRunning -and $redisRunning
        }
    }
    catch {
        return @{
            PostgreSQL = $false
            Redis = $false
            Both = $false
        }
    }
}

# 启动数据库服务
function Start-DatabaseServices {
    Write-ColorOutput "`n🗄️ 启动数据库服务..." "Blue"
    
    # 检查数据库是否已运行
    $dbStatus = Test-DatabaseRunning
    
    if ($dbStatus.Both) {
        Write-ColorOutput "✅ 数据库服务已在运行中，跳过启动" "Green"
        Write-ColorOutput "  - PostgreSQL: inspect-postgres-dev" "Gray"
        Write-ColorOutput "  - Redis: inspect-redis-dev" "Gray"
        return
    }
    
    if ($dbStatus.PostgreSQL -or $dbStatus.Redis) {
        Write-ColorOutput "⚠️ 部分数据库服务已运行:" "Yellow"
        if ($dbStatus.PostgreSQL) {
            Write-ColorOutput "  - PostgreSQL: 已运行" "Gray"
        }
        if ($dbStatus.Redis) {
            Write-ColorOutput "  - Redis: 已运行" "Gray"
        }
        Write-ColorOutput "将启动缺失的服务..." "Yellow"
    }
    
    # 检查 Docker Compose 文件（已迁移为“单文件完整配置”）
    $devComposeFile = "docker-compose.dev.yml"
    $legacyComposeFile = "docker-compose.yml"

    $composeFile = $null
    if (Test-Path $devComposeFile) {
        $composeFile = $devComposeFile
    } elseif (Test-Path $legacyComposeFile) {
        # 兼容旧结构（如历史分支/本地遗留文件）
        $composeFile = $legacyComposeFile
        Write-ColorOutput "⚠️ 检测到旧版配置文件: $legacyComposeFile（建议迁移到 docker-compose.dev.yml）" "Yellow"
    } else {
        throw "未找到 Docker Compose 配置文件: $devComposeFile"
    }

    Write-ColorOutput "使用配置文件: $composeFile" "Gray"

    # 启动数据库服务（只启动 postgres 和 redis，不启动其他服务）
    try {
        Write-ColorOutput "🔄 启动数据库容器..." "Cyan"
        $composeCmd = "docker-compose -f $composeFile up -d postgres redis"
        $result = Invoke-Expression $composeCmd 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-ColorOutput "✅ 数据库容器启动成功" "Green"
        } else {
            throw "数据库容器启动失败: $result"
        }
    }
    catch {
        Write-ColorOutput "❌ 启动数据库容器失败: $($_.Exception.Message)" "Red"
        throw
    }
    
    # 等待服务启动
    if ($Wait -gt 0) {
        Write-ColorOutput "⏳ 等待数据库服务启动 ($Wait 秒)..." "Yellow"
        Start-Sleep -Seconds $Wait
    }
    
    # 验证服务状态
    $dbStatus = Test-DatabaseRunning
    if ($dbStatus.Both) {
        Write-ColorOutput "✅ 数据库服务验证通过" "Green"
    } else {
        Write-ColorOutput "⚠️ 数据库服务可能未完全启动" "Yellow"
        if (-not $dbStatus.PostgreSQL) {
            Write-ColorOutput "  - PostgreSQL: 未检测到" "Red"
        }
        if (-not $dbStatus.Redis) {
            Write-ColorOutput "  - Redis: 未检测到" "Red"
        }
    }
}

# 启动后端服务
function Start-BackendService {
    Write-ColorOutput "`n🔧 启动后端服务..." "Blue"
    
    $backendDir = "backend-go"
    
    # 检查后端目录
    if (-not (Test-Path $backendDir)) {
        Write-ColorOutput "⚠️ 后端目录不存在，跳过后端服务启动" "Yellow"
        return
    }
    
    # 检查 Go 是否可用
    try {
        $null = Get-Command "go" -ErrorAction Stop
    }
    catch {
        Write-ColorOutput "❌ Go 运行时不可用，无法启动后端服务" "Red"
        return
    }
    
    # 启动后端开发服务器
    Write-ColorOutput "🚀 启动后端开发服务器..." "Cyan"
    Write-ColorOutput "访问地址: http://localhost:8000" "White"
    Write-ColorOutput "API 说明: docs/api/openapi.json" "White"
    Write-ColorOutput "按 Ctrl+C 停止服务" "Gray"
    
    # 在新窗口中启动后端服务
    # 使用 ENV_FILE 环境变量指定配置文件路径，这样可以从 backend-go 目录运行
    $projectRoot = Get-Location
    $envFilePath = Join-Path $projectRoot ".env"
    $backendCommand = "`$env:ENV_FILE='$envFilePath'; cd '$projectRoot\$backendDir'; go run ./cmd/api"
    Start-Process -FilePath "powershell" -ArgumentList "-NoExit", "-Command", $backendCommand
    
    Write-ColorOutput "✅ 后端服务已在新窗口中启动" "Green"
}

# 启动前端服务
function Start-FrontendService {
    Write-ColorOutput "`n🎨 启动前端服务..." "Blue"
    
    $frontendDir = "frontend"
    
    # 检查前端目录
    if (-not (Test-Path $frontendDir)) {
        Write-ColorOutput "⚠️ 前端目录不存在，跳过前端服务启动" "Yellow"
        return
    }
    
    # 检查 node_modules
    if (-not (Test-Path "$frontendDir\node_modules")) {
        Write-ColorOutput "⚠️ 前端依赖未安装，正在安装..." "Yellow"
        Invoke-CommandSafely "pnpm install" "安装前端依赖" $frontendDir
    }
    
    # 检查环境配置文件
    if (-not (Test-Path "$frontendDir\.env.local")) {
        Write-ColorOutput "⚠️ 前端环境配置文件不存在，创建默认配置..." "Yellow"
        
        $envContent = @"
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
NODE_ENV=development
NEXT_PUBLIC_ENV=development
"@
        $envContent | Out-File -FilePath "$frontendDir\.env.local" -Encoding UTF8
        Write-ColorOutput "✅ 已创建默认前端环境配置文件" "Green"
    }
    
    # 启动前端开发服务器
    Write-ColorOutput "🚀 启动前端开发服务器..." "Cyan"
    Write-ColorOutput "访问地址: http://localhost:3000" "White"
    Write-ColorOutput "按 Ctrl+C 停止服务" "Gray"
    
    # 在新窗口中启动前端服务
    $frontendCommand = "cd $frontendDir; pnpm dev"
    Start-Process -FilePath "powershell" -ArgumentList "-NoExit", "-Command", $frontendCommand
    
    Write-ColorOutput "✅ 前端服务已在新窗口中启动" "Green"
}

# 健康检查
function Test-ServicesHealth {
    if ($SkipHealthCheck) {
        return
    }
    
    Write-ColorOutput "`n🏥 服务健康检查..." "Blue"
    
    # 检查数据库服务
    $dbServices = @(
        @{ Name = "PostgreSQL"; Port = 15500; Host = "localhost" },
        @{ Name = "Redis"; Port = 16379; Host = "localhost" }
    )
    
    foreach ($service in $dbServices) {
        try {
            $connection = Test-NetConnection -ComputerName $service.Host -Port $service.Port -WarningAction SilentlyContinue
            if ($connection.TcpTestSucceeded) {
                Write-ColorOutput "✅ $($service.Name) 服务正常 ($($service.Host):$($service.Port))" "Green"
            } else {
                Write-ColorOutput "❌ $($service.Name) 服务不可达 ($($service.Host):$($service.Port))" "Red"
            }
        }
        catch {
            Write-ColorOutput "❌ $($service.Name) 服务检查失败: $($_.Exception.Message)" "Red"
        }
    }
    
    # 等待后端服务启动
    Write-ColorOutput "`n⏳ 等待后端服务启动..." "Yellow"
    Start-Sleep -Seconds 5
    
    # 检查后端健康状态（带重试）
    $backendHealthUrl = "http://localhost:8000/health"
    $maxRetries = 3
    $retryDelay = 3
    $backendHealthy = $false
    
    for ($i = 1; $i -le $maxRetries; $i++) {
        try {
            $response = Invoke-WebRequest -Uri $backendHealthUrl -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
            if ($response.StatusCode -eq 200) {
                $healthData = $response.Content | ConvertFrom-Json
                Write-ColorOutput "✅ 后端 API 服务正常" "Green"
                Write-ColorOutput "   - 状态: $($healthData.status)" "Gray"
                Write-ColorOutput "   - 版本: $($healthData.version)" "Gray"
                Write-ColorOutput "   - 端点: $backendHealthUrl" "Gray"
                $backendHealthy = $true
                break
            }
        }
        catch {
            if ($i -lt $maxRetries) {
                Write-ColorOutput "⏳ 后端服务尚未就绪，等待重试 ($i/$maxRetries)..." "Yellow"
                Start-Sleep -Seconds $retryDelay
            } else {
                Write-ColorOutput "⚠️ 后端 API 服务暂未就绪（可能仍在启动中）" "Yellow"
                Write-ColorOutput "   - 端点: $backendHealthUrl" "Gray"
                Write-ColorOutput "   - 请稍后手动检查: Invoke-WebRequest $backendHealthUrl" "Gray"
            }
        }
    }
    
    # 检查前端服务
    $frontendUrl = "http://localhost:3000"
    try {
        $response = Invoke-WebRequest -Uri $frontendUrl -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            Write-ColorOutput "✅ 前端应用服务正常" "Green"
            Write-ColorOutput "   - 端点: $frontendUrl" "Gray"
        } else {
            Write-ColorOutput "⚠️ 前端应用服务响应异常 (状态码: $($response.StatusCode))" "Yellow"
        }
    }
    catch {
        Write-ColorOutput "⚠️ 前端应用服务暂未就绪（可能仍在启动中）" "Yellow"
        Write-ColorOutput "   - 端点: $frontendUrl" "Gray"
    }
}

# 显示服务信息
function Show-ServiceInfo {
    Write-ColorOutput "`n📊 开发环境服务信息:" "Blue"
    Write-ColorOutput "$('=' * 50)" "Cyan"
    
    Write-ColorOutput "`n🌐 Web 服务:" "Blue"
    Write-ColorOutput "  🎨 前端应用: http://localhost:3000" "White"
    Write-ColorOutput "  🔧 后端 API: http://localhost:8000" "White"
    Write-ColorOutput "  💚 健康检查: http://localhost:8000/health" "White"
    Write-ColorOutput "  📚 API 说明: docs/api/openapi.json" "White"
    Write-ColorOutput "  🔌 WS 约定: docs/api/websocket-contract.md" "White"
    
    Write-ColorOutput "`n🗄️ 数据库服务:" "Blue"
    Write-ColorOutput "  🐘 PostgreSQL: localhost:15500" "White"
    Write-ColorOutput "    - 数据库: inspect_system_dev" "Gray"
    Write-ColorOutput "    - 用户名: inspect_dev" "Gray"
    Write-ColorOutput "    - 密码: dev_password_2024" "Gray"
    Write-ColorOutput "  🔴 Redis: localhost:16379" "White"
    Write-ColorOutput "    - 密码: dev_redis_2024" "Gray"
    
    Write-ColorOutput "`n🔧 管理工具:" "Blue"
    Write-ColorOutput "  🔧 pgAdmin: http://localhost:5050" "White"
    Write-ColorOutput "  🔧 Redis Commander: http://localhost:8081" "White"
    
    Write-ColorOutput "`n🛠️ 常用命令:" "Blue"
    Write-ColorOutput "  停止数据库: .\scripts\database\db-manage.ps1 stop" "White"
    Write-ColorOutput "  查看日志: .\scripts\database\db-manage.ps1 logs" "White"
    Write-ColorOutput "  重置数据库: .\scripts\database\db-manage.ps1 reset" "White"
    Write-ColorOutput "  运行测试: .\scripts\testing\run-all-tests.ps1" "White"
    Write-ColorOutput "  健康检查: Invoke-WebRequest http://localhost:8000/health" "White"
    
    Write-ColorOutput "`n💡 提示:" "Yellow"
    Write-ColorOutput "  - 前端和后端服务在独立窗口中运行" "Gray"
    Write-ColorOutput "  - 使用 Ctrl+C 停止对应服务" "Gray"
    Write-ColorOutput "  - 修改代码后服务会自动重载" "Gray"
    Write-ColorOutput "  - 后端健康检查返回 JSON: {status, version, timestamp}" "Gray"
}

# 主执行函数
function Main {
    try {
        Write-ColorOutput "🚀 启动企业级网络设备巡检系统开发环境" "Green"
        Write-ColorOutput "服务范围: $Services" "Cyan"
        Write-ColorOutput "$('=' * 60)" "Cyan"
        
        # 检查前置条件
        Test-Prerequisites
        
        # 根据参数启动相应服务
        switch ($Services) {
            "database" {
                Start-DatabaseServices
            }
            "backend" {
                Start-DatabaseServices
                Start-BackendService
            }
            "frontend" {
                Start-FrontendService
            }
            "all" {
                Start-DatabaseServices
                Start-BackendService
                Start-FrontendService
            }
        }
        
        # 健康检查
        Test-ServicesHealth
        
        # 显示服务信息
        Show-ServiceInfo
        
        Write-ColorOutput "`n✅ 开发环境启动完成！" "Green"
        Write-ColorOutput "🎯 开始愉快的开发吧！" "Magenta"
        
    }
    catch {
        Write-ColorOutput "`n❌ 开发环境启动失败: $($_.Exception.Message)" "Red"
        Write-ColorOutput "请检查错误信息并重新运行脚本" "Yellow"
        Write-ColorOutput "或运行完整环境设置: .\scripts\setup-dev-env.ps1" "Cyan"
        exit 1
    }
}

# 执行主函数
Main


