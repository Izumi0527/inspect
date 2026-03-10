#!/usr/bin/env pwsh
<#
.SYNOPSIS
    企业级网络设备巡检系统 - 一键开发环境设置脚本

.DESCRIPTION
    自动化设置完整的开发环境，包括前端、后端、数据库等所有组件
    支持 Windows、Linux、macOS 跨平台运行

.PARAMETER SkipPrerequisites
    跳过前置条件检查

.PARAMETER SkipDatabase
    跳过数据库环境设置

.PARAMETER SkipTests
    跳过测试验证

.EXAMPLE
    .\setup-dev-env.ps1
    完整的环境设置

.EXAMPLE
    .\setup-dev-env.ps1 -SkipTests
    设置环境但跳过测试验证

.NOTES
    文件名: setup-dev-env.ps1
    作者: 技术团队
    版本: 1.0.0
    创建日期: 2025-12-10
#>

[CmdletBinding()]
param(
    [switch]$SkipPrerequisites,
    [switch]$SkipDatabase,
    [switch]$SkipTests
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
function Invoke-CommandWithLogging {
    param(
        [string]$Command,
        [string]$Description,
        [string]$WorkingDirectory = $PWD,
        [switch]$IgnoreErrors
    )
    
    Write-ColorOutput "🔄 $Description..." "Cyan"
    
    try {
        $originalLocation = Get-Location
        Set-Location $WorkingDirectory
        
        $result = Invoke-Expression $Command
        
        if ($LASTEXITCODE -eq 0 -or $null -eq $LASTEXITCODE) {
            Write-ColorOutput "✅ $Description 完成" "Green"
            return $true
        } else {
            throw "命令执行失败，退出代码: $LASTEXITCODE"
        }
    }
    catch {
        if ($IgnoreErrors) {
            Write-ColorOutput "⚠️ $Description 失败，但继续执行: $($_.Exception.Message)" "Yellow"
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
    Write-ColorOutput "`n🔍 检查前置条件..." "Blue"
    
    $prerequisites = @(
        @{ Command = "git"; Name = "Git 版本控制" },
        @{ Command = "docker"; Name = "Docker 容器" },
        @{ Command = "node"; Name = "Node.js 运行时" },
        @{ Command = "pnpm"; Name = "pnpm 包管理器" },
        @{ Command = "go"; Name = "Go 运行时" }
    )
    
    $allOk = $true
    
    foreach ($prereq in $prerequisites) {
        try {
            $null = Get-Command $prereq.Command -ErrorAction Stop
            Write-ColorOutput "✅ $($prereq.Name) 已安装" "Green"
        }
        catch {
            Write-ColorOutput "❌ $($prereq.Name) 未安装" "Red"
            $allOk = $false
        }
    }
    
    if (-not $allOk) {
        Write-ColorOutput "`n❌ 前置条件检查失败，请先安装缺失的工具" "Red"
        Write-ColorOutput "请参考文档: docs/development-environment-guide.md" "Yellow"
        exit 1
    }
    
    Write-ColorOutput "✅ 所有前置条件检查通过" "Green"
}

# 创建环境配置文件
function New-EnvironmentFiles {
    Write-ColorOutput "`n?? 创建环境配置文件..." "Blue"

    $backendEnvCandidates = @(".env.development", ".env")
    $backendEnvExists = $false

    foreach ($candidate in $backendEnvCandidates) {
        if (Test-Path $candidate) {
            $backendEnvExists = $true
            break
        }
    }

    if (-not $backendEnvExists) {
        if (Test-Path ".env.example") {
            Copy-Item -Path ".env.example" -Destination ".env.development"
            Write-ColorOutput "? 已创建后端环境配置文件: .env.development" "Green"
        } else {
            Write-ColorOutput "?? 未找到 .env.example，跳过后端环境文件创建" "Yellow"
        }
    }
    
    # 前端环境配置
    $frontendEnvPath = "frontend\.env.local"
    if (-not (Test-Path $frontendEnvPath)) {
        $frontendEnvContent = @"
# API 配置
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000

# 开发配置
NODE_ENV=development
NEXT_PUBLIC_ENV=development
"@
        $frontendEnvContent | Out-File -FilePath $frontendEnvPath -Encoding UTF8
        Write-ColorOutput "? 前端环境配置文件已创建" "Green"
    }
}

# 设置数据库环境
function Initialize-DatabaseEnvironment {
    Write-ColorOutput "`n🗄️ 设置数据库环境..." "Blue"
    
    # 检查 docker-compose.db.yml 是否存在
    if (-not (Test-Path "docker-compose.db.yml")) {
        Write-ColorOutput "⚠️ docker-compose.db.yml 不存在，使用开发环境配置" "Yellow"
        $composeFile = "docker-compose.dev.yml"
    } else {
        $composeFile = "docker-compose.db.yml"
    }
    
    # 拉取数据库镜像
    Invoke-CommandWithLogging "docker-compose -f $composeFile pull" "拉取数据库镜像"
    
    # 启动数据库服务
    Invoke-CommandWithLogging "docker-compose -f $composeFile up -d" "启动数据库服务"
    
    # 等待数据库启动
    Write-ColorOutput "⏳ 等待数据库服务启动..." "Yellow"
    Start-Sleep -Seconds 15
    
    # 检查服务状态
    Invoke-CommandWithLogging "docker-compose -f $composeFile ps" "检查数据库服务状态"
}

# 设置后端环境
function Initialize-BackendEnvironment {
    Write-ColorOutput "`n?? 设置后端环境..." "Blue"

    $backendDir = "backend-go"

    $envFile = $null
    if (Test-Path ".env.development") {
        $envFile = (Resolve-Path ".env.development").Path
    } elseif (Test-Path ".env") {
        $envFile = (Resolve-Path ".env").Path
    }

    if ($envFile) {
        $env:ENV_FILE = $envFile
    }

    Invoke-CommandWithLogging "go mod download" "下载 Go 依赖" $backendDir
    Invoke-CommandWithLogging "go run ./cmd/migrate" "执行数据库迁移" $backendDir -IgnoreErrors
}

# 设置前端环境
function Initialize-FrontendEnvironment {
    Write-ColorOutput "`n🎨 设置前端环境..." "Blue"
    
    $frontendDir = "frontend"
    
    # 检查前端目录是否存在
    if (-not (Test-Path $frontendDir)) {
        Write-ColorOutput "⚠️ 前端目录不存在，跳过前端环境设置" "Yellow"
        return
    }
    
    # 安装依赖包
    Invoke-CommandWithLogging "pnpm install" "安装依赖包" $frontendDir
    
    # 类型检查
    Invoke-CommandWithLogging "pnpm run type-check" "类型检查" $frontendDir -IgnoreErrors
    
    # 代码检查
    Invoke-CommandWithLogging "pnpm run lint" "代码检查" $frontendDir -IgnoreErrors
}

# 运行测试验证
function Invoke-TestValidation {
    Write-ColorOutput "`n?? 运行测试验证环境..." "Blue"

    # 后端测试
    $backendDir = "backend-go"
    if (Test-Path $backendDir) {
        Invoke-CommandWithLogging "go test ./..." "后端测试" $backendDir -IgnoreErrors
    } else {
        Write-ColorOutput "?? 后端目录不存在，跳过后端测试" "Yellow"
    }

    # 前端测试
    $frontendDir = "frontend"
    if (Test-Path $frontendDir) {
        Invoke-CommandWithLogging "pnpm test --run" "前端测试" $frontendDir -IgnoreErrors
    } else {
        Write-ColorOutput "?? 前端目录不存在，跳过前端测试" "Yellow"
    }
}

# 打印设置摘要
function Show-SetupSummary {
    Write-ColorOutput "`n$('=' * 60)" "Cyan"
    Write-ColorOutput "🎉 开发环境设置完成！" "Green"
    Write-ColorOutput "$('=' * 60)" "Cyan"
    
    Write-ColorOutput "`n📊 服务访问地址:" "Blue"
    Write-ColorOutput "  🎨 前端开发服务器: http://localhost:3000" "White"
    Write-ColorOutput "  🐍 后端 API 服务器: http://localhost:8000" "White"
    Write-ColorOutput "  📚 API 说明: docs/api/openapi.json" "White"
    Write-ColorOutput "  🗄️ PostgreSQL: localhost:15500" "White"
    Write-ColorOutput "  🔴 Redis: localhost:16379" "White"
    Write-ColorOutput "  🔧 pgAdmin: http://localhost:5050" "White"
    Write-ColorOutput "  🔧 Redis Commander: http://localhost:8081" "White"
    
    Write-ColorOutput "`n🚀 启动开发服务器:" "Blue"
    Write-ColorOutput "  前端: cd frontend && pnpm dev" "White"
    Write-ColorOutput "  后端: cd backend-go && go run ./cmd/api" "White"
    
    Write-ColorOutput "`n🛠️ 常用命令:" "Blue"
    Write-ColorOutput "  数据库管理: .\scripts\database\db-manage.ps1 [start|stop|reset|backup]" "White"
    Write-ColorOutput "  代码质量检查: .\scripts\quality-check.ps1" "White"
    Write-ColorOutput "  运行测试: .\scripts\run-tests.ps1" "White"
    
    Write-ColorOutput "`n📖 更多信息请查看 docs\ 目录下的文档" "Yellow"
}

# 主执行流程
function Main {
    try {
        Write-ColorOutput "🚀 开始设置企业级网络设备巡检系统开发环境" "Green"
        Write-ColorOutput "$('=' * 60)" "Cyan"
        
        # 检查前置条件
        if (-not $SkipPrerequisites) {
            Test-Prerequisites
        }
        
        # 创建环境配置文件
        New-EnvironmentFiles
        
        # 设置数据库环境
        if (-not $SkipDatabase) {
            Initialize-DatabaseEnvironment
        }
        
        # 设置后端环境
        Initialize-BackendEnvironment
        
        # 设置前端环境
        Initialize-FrontendEnvironment
        
        # 运行测试验证
        if (-not $SkipTests) {
            Invoke-TestValidation
        }
        
        # 打印设置摘要
        Show-SetupSummary
        
        Write-ColorOutput "`n✅ 开发环境设置成功完成！" "Green"
    }
    catch {
        Write-ColorOutput "`n❌ 开发环境设置失败: $($_.Exception.Message)" "Red"
        Write-ColorOutput "请检查错误信息并重新运行脚本" "Yellow"
        exit 1
    }
}

# 执行主函数
Main




