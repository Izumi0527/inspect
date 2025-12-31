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
        @{ Command = "docker"; Name = "Docker" },
        @{ Command = "uv"; Name = "uv 包管理器" }
    )
    
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

# 启动数据库服务
function Start-DatabaseServices {
    Write-ColorOutput "`n🗄️ 启动数据库服务..." "Blue"
    
    # 检查 Docker Compose 文件
    $composeFiles = @("docker-compose.db.yml", "docker-compose.dev.yml", "docker-compose.yml")
    $composeFile = $null
    
    foreach ($file in $composeFiles) {
        if (Test-Path $file) {
            $composeFile = $file
            break
        }
    }
    
    if (-not $composeFile) {
        throw "未找到 Docker Compose 配置文件"
    }
    
    Write-ColorOutput "使用配置文件: $composeFile" "Gray"
    
    # 启动数据库服务
    Invoke-CommandSafely "docker-compose -f $composeFile up -d" "启动数据库容器"
    
    # 等待服务启动
    if ($Wait -gt 0) {
        Write-ColorOutput "⏳ 等待数据库服务启动 ($Wait 秒)..." "Yellow"
        Start-Sleep -Seconds $Wait
    }
    
    # 显示服务状态
    Invoke-CommandSafely "docker-compose -f $composeFile ps" "检查服务状态"
}

# 启动后端服务
function Start-BackendService {
    Write-ColorOutput "`n🐍 启动后端服务..." "Blue"
    
    $backendDir = "backend"
    
    # 检查后端目录
    if (-not (Test-Path $backendDir)) {
        Write-ColorOutput "⚠️ 后端目录不存在，跳过后端服务启动" "Yellow"
        return
    }
    
    # 检查虚拟环境
    if (-not (Test-Path "$backendDir\.venv")) {
        Write-ColorOutput "⚠️ 虚拟环境不存在，请先运行环境设置脚本" "Yellow"
        Write-ColorOutput "运行: .\scripts\setup-dev-env.ps1" "Cyan"
        return
    }
    
    # 检查环境配置文件
    if (-not (Test-Path "$backendDir\.env")) {
        Write-ColorOutput "⚠️ 环境配置文件不存在，创建默认配置..." "Yellow"
        
        $envContent = @"
DATABASE_URL=postgresql+asyncpg://inspect_dev:dev_password_2024@localhost:5433/inspect_system_dev
REDIS_URL=redis://:dev_redis_2024@localhost:6380/0
INFLUXDB_URL=http://localhost:8087
INFLUXDB_TOKEN=dev_token_2024
INFLUXDB_ORG=inspect_dev
INFLUXDB_BUCKET=device_metrics_dev
SECRET_KEY=dev_secret_key_2024_very_long_and_secure
ENVIRONMENT=development
DEBUG=true
LOG_LEVEL=debug
PYTHONDONTWRITEBYTECODE=1
PYTHONUNBUFFERED=1
"@
        $envContent | Out-File -FilePath "$backendDir\.env" -Encoding UTF8
        Write-ColorOutput "✅ 已创建默认环境配置文件" "Green"
    }
    
    # 启动后端开发服务器
    Write-ColorOutput "🚀 启动后端开发服务器..." "Cyan"
    Write-ColorOutput "访问地址: http://localhost:8000" "White"
    Write-ColorOutput "API 文档: http://localhost:8000/docs" "White"
    Write-ColorOutput "按 Ctrl+C 停止服务" "Gray"
    
    # 在新窗口中启动后端服务
    $backendCommand = "cd $backendDir; uv run uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload --log-level debug"
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
        @{ Name = "PostgreSQL"; Port = 5433; Host = "localhost" },
        @{ Name = "Redis"; Port = 6380; Host = "localhost" },
        @{ Name = "InfluxDB"; Port = 8087; Host = "localhost" }
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
    
    # 检查 Web 服务
    Start-Sleep -Seconds 5  # 等待服务启动
    
    $webServices = @(
        @{ Name = "后端 API"; Url = "http://localhost:8000/health" },
        @{ Name = "前端应用"; Url = "http://localhost:3000" }
    )
    
    foreach ($service in $webServices) {
        try {
            $response = Invoke-WebRequest -Uri $service.Url -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
            if ($response.StatusCode -eq 200) {
                Write-ColorOutput "✅ $($service.Name) 服务正常" "Green"
            } else {
                Write-ColorOutput "⚠️ $($service.Name) 服务响应异常 (状态码: $($response.StatusCode))" "Yellow"
            }
        }
        catch {
            Write-ColorOutput "⚠️ $($service.Name) 服务暂未就绪" "Yellow"
        }
    }
}

# 显示服务信息
function Show-ServiceInfo {
    Write-ColorOutput "`n📊 开发环境服务信息:" "Blue"
    Write-ColorOutput "$('=' * 50)" "Cyan"
    
    Write-ColorOutput "`n🌐 Web 服务:" "Blue"
    Write-ColorOutput "  🎨 前端应用: http://localhost:3000" "White"
    Write-ColorOutput "  🐍 后端 API: http://localhost:8000" "White"
    Write-ColorOutput "  📚 API 文档: http://localhost:8000/docs" "White"
    Write-ColorOutput "  📊 API 调试: http://localhost:8000/redoc" "White"
    
    Write-ColorOutput "`n🗄️ 数据库服务:" "Blue"
    Write-ColorOutput "  🐘 PostgreSQL: localhost:5433" "White"
    Write-ColorOutput "    - 数据库: inspect_system_dev" "Gray"
    Write-ColorOutput "    - 用户名: inspect_dev" "Gray"
    Write-ColorOutput "    - 密码: dev_password_2024" "Gray"
    Write-ColorOutput "  🔴 Redis: localhost:6380" "White"
    Write-ColorOutput "    - 密码: dev_redis_2024" "Gray"
    Write-ColorOutput "  📈 InfluxDB: http://localhost:8087" "White"
    Write-ColorOutput "    - 用户名: dev_admin" "Gray"
    Write-ColorOutput "    - 密码: dev_admin_2024" "Gray"
    
    Write-ColorOutput "`n🔧 管理工具:" "Blue"
    Write-ColorOutput "  🔧 pgAdmin: http://localhost:5050" "White"
    Write-ColorOutput "  🔧 Redis Commander: http://localhost:8081" "White"
    
    Write-ColorOutput "`n🛠️ 常用命令:" "Blue"
    Write-ColorOutput "  停止数据库: .\scripts\db-manage.ps1 stop" "White"
    Write-ColorOutput "  查看日志: .\scripts\db-manage.ps1 logs" "White"
    Write-ColorOutput "  重置数据库: .\scripts\db-manage.ps1 reset" "White"
    Write-ColorOutput "  运行测试: .\scripts\run-tests.ps1" "White"
    
    Write-ColorOutput "`n💡 提示:" "Yellow"
    Write-ColorOutput "  - 前端和后端服务在独立窗口中运行" "Gray"
    Write-ColorOutput "  - 使用 Ctrl+C 停止对应服务" "Gray"
    Write-ColorOutput "  - 修改代码后服务会自动重载" "Gray"
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