#!/usr/bin/env pwsh
<#
.SYNOPSIS
    后端开发环境设置脚本

.DESCRIPTION
    专门用于设置和管理后端开发环境的脚本
    包括 Python 环境、虚拟环境、依赖管理、数据库迁移等

.PARAMETER Action
    操作类型: setup, install, dev, migrate, shell, clean, check

.PARAMETER Python
    指定 Python 版本 (默认: 3.12.9)

.PARAMETER SkipMigration
    跳过数据库迁移

.PARAMETER Production
    生产环境模式

.EXAMPLE
    .\backend-setup.ps1 setup
    完整的后端环境设置

.EXAMPLE
    .\backend-setup.ps1 dev
    启动开发服务器

.EXAMPLE
    .\backend-setup.ps1 migrate
    运行数据库迁移

.NOTES
    文件名: backend-setup.ps1
    作者: 技术团队
    版本: 1.0.0
    创建日期: 2025-12-10
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet("setup", "install", "dev", "migrate", "shell", "clean", "check")]
    [string]$Action,
    
    [string]$Python = "3.12.9",
    
    [switch]$SkipMigration,
    
    [switch]$Production
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
        [string]$WorkingDirectory = "backend",
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
    Write-ColorOutput "🔍 检查后端开发前置条件..." "Blue"
    
    $tools = @(
        @{ Command = "python"; Name = "Python"; MinVersion = "3.11.0" },
        @{ Command = "uv"; Name = "uv 包管理器"; MinVersion = "0.8.0" }
    )
    
    $allOk = $true
    
    foreach ($tool in $tools) {
        try {
            $version = & $tool.Command --version 2>$null
            if ($version) {
                Write-ColorOutput "✅ $($tool.Name) 已安装: $version" "Green"
                
                # 版本检查
                if ($tool.MinVersion -and $tool.Command -eq "python") {
                    $currentVersion = [Version]($version -replace 'Python ', '' -replace '[^\d\.]', '')
                    $minVersion = [Version]$tool.MinVersion
                    
                    if ($currentVersion -lt $minVersion) {
                        Write-ColorOutput "⚠️ $($tool.Name) 版本过低，建议升级到 $($tool.MinVersion) 以上" "Yellow"
                    }
                }
            } else {
                throw "版本信息获取失败"
            }
        }
        catch {
            Write-ColorOutput "❌ $($tool.Name) 未安装或不可用" "Red"
            $allOk = $false
        }
    }
    
    if (-not $allOk) {
        Write-ColorOutput "`n安装指南:" "Yellow"
        Write-ColorOutput "  Python: https://www.python.org/downloads/" "Gray"
        Write-ColorOutput "  uv: curl -LsSf https://astral.sh/uv/install.sh | sh" "Gray"
        throw "前置条件检查失败"
    }
}

# 检查后端目录
function Test-BackendDirectory {
    if (-not (Test-Path "backend")) {
        Write-ColorOutput "❌ 后端目录不存在" "Red"
        throw "后端目录不存在，请确认项目结构"
    }
    
    if (-not (Test-Path "backend\pyproject.toml")) {
        Write-ColorOutput "❌ pyproject.toml 不存在" "Red"
        throw "pyproject.toml 不存在，请确认后端项目配置"
    }
    
    Write-ColorOutput "✅ 后端目录结构正常" "Green"
}

# 安装指定版本的 Python
function Install-PythonVersion {
    Write-ColorOutput "🐍 安装 Python $Python..." "Blue"
    
    # 检查是否已安装指定版本
    try {
        $installedVersions = uv python list 2>$null
        if ($installedVersions -match $Python) {
            Write-ColorOutput "✅ Python $Python 已安装" "Green"
            return
        }
    }
    catch {
        Write-ColorOutput "⚠️ 无法检查已安装的 Python 版本" "Yellow"
    }
    
    # 安装指定版本
    Invoke-CommandSafely "uv python install $Python" "安装 Python $Python" "."
}

# 创建虚拟环境
function New-VirtualEnvironment {
    Write-ColorOutput "🌐 创建虚拟环境..." "Blue"
    
    $backendDir = "backend"
    
    # 删除旧的虚拟环境
    if (Test-Path "$backendDir\.venv") {
        Write-ColorOutput "🗑️ 删除旧的虚拟环境..." "Yellow"
        Remove-Item -Recurse -Force "$backendDir\.venv"
    }
    
    # 创建新的虚拟环境
    Invoke-CommandSafely "uv venv --python $Python" "创建虚拟环境" $backendDir
    
    # 验证虚拟环境
    if (Test-Path "$backendDir\.venv") {
        Write-ColorOutput "✅ 虚拟环境创建成功" "Green"
    } else {
        throw "虚拟环境创建失败"
    }
}

# 安装依赖
function Install-Dependencies {
    Write-ColorOutput "`n📦 安装后端依赖..." "Blue"
    
    $backendDir = "backend"
    
    # 检查虚拟环境
    if (-not (Test-Path "$backendDir\.venv")) {
        Write-ColorOutput "⚠️ 虚拟环境不存在，先创建虚拟环境" "Yellow"
        New-VirtualEnvironment
    }
    
    # 安装依赖
    if ($Production) {
        Invoke-CommandSafely "uv sync --no-dev" "安装生产依赖" $backendDir
    } else {
        Invoke-CommandSafely "uv sync --all-extras" "安装所有依赖" $backendDir
    }
    
    # 验证关键依赖
    Write-ColorOutput "🔍 验证关键依赖..." "Cyan"
    
    $keyDependencies = @("fastapi", "sqlalchemy", "redis", "pydantic")
    
    foreach ($dep in $keyDependencies) {
        try {
            $result = Invoke-CommandSafely "uv run python -c `"import $dep; print('$dep 导入成功')`"" "验证 $dep" $backendDir -IgnoreErrors
            if (-not $result) {
                Write-ColorOutput "⚠️ $dep 可能未正确安装" "Yellow"
            }
        }
        catch {
            Write-ColorOutput "⚠️ $dep 验证失败" "Yellow"
        }
    }
}

# 创建环境配置文件
function New-EnvironmentConfig {
    Write-ColorOutput "📝 创建后端环境配置..." "Blue"
    
    $backendDir = "backend"
    
    $envConfigs = @{
        ".env" = @"
# 数据库配置
DATABASE_URL=postgresql+asyncpg://inspect_dev:dev_password_2024@localhost:5433/inspect_system_dev
REDIS_URL=redis://:dev_redis_2024@localhost:6380/0
INFLUXDB_URL=http://localhost:8087
INFLUXDB_TOKEN=dev_token_2024
INFLUXDB_ORG=inspect_dev
INFLUXDB_BUCKET=device_metrics_dev

# 应用配置
SECRET_KEY=dev_secret_key_2024_very_long_and_secure_for_development_only
ENVIRONMENT=development
DEBUG=true
LOG_LEVEL=debug

# Python 配置
PYTHONDONTWRITEBYTECODE=1
PYTHONUNBUFFERED=1

# 安全配置
ALLOWED_HOSTS=localhost,127.0.0.1,0.0.0.0
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

# 邮件配置 (开发环境)
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASSWORD=
SMTP_TLS=false

# 文件上传配置
MAX_UPLOAD_SIZE=10485760
UPLOAD_PATH=uploads
"@
        ".env.production" = @"
# 生产环境配置
DATABASE_URL=postgresql+asyncpg://\${POSTGRES_USER}:\${POSTGRES_PASSWORD}@postgres:5432/\${POSTGRES_DB}
REDIS_URL=redis://:\${REDIS_PASSWORD}@redis:6379/0
INFLUXDB_URL=http://influxdb:8086
INFLUXDB_TOKEN=\${INFLUXDB_TOKEN}
INFLUXDB_ORG=\${INFLUXDB_ORG}
INFLUXDB_BUCKET=\${INFLUXDB_BUCKET}

# 应用配置
SECRET_KEY=\${SECRET_KEY}
ENVIRONMENT=production
DEBUG=false
LOG_LEVEL=info

# Python 配置
PYTHONDONTWRITEBYTECODE=1
PYTHONUNBUFFERED=1

# 安全配置
ALLOWED_HOSTS=\${ALLOWED_HOSTS}
CORS_ORIGINS=\${CORS_ORIGINS}

# 邮件配置
SMTP_HOST=\${SMTP_HOST}
SMTP_PORT=\${SMTP_PORT}
SMTP_USER=\${SMTP_USER}
SMTP_PASSWORD=\${SMTP_PASSWORD}
SMTP_TLS=true

# 文件上传配置
MAX_UPLOAD_SIZE=52428800
UPLOAD_PATH=/app/uploads
"@
        ".env.example" = @"
# 环境配置示例文件
# 复制此文件为 .env 并修改相应配置

# 数据库配置
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/database
REDIS_URL=redis://:password@localhost:6379/0
INFLUXDB_URL=http://localhost:8086
INFLUXDB_TOKEN=your_influxdb_token
INFLUXDB_ORG=your_org
INFLUXDB_BUCKET=your_bucket

# 应用配置
SECRET_KEY=your_very_long_and_secure_secret_key
ENVIRONMENT=development
DEBUG=true
LOG_LEVEL=debug

# Python 配置
PYTHONDONTWRITEBYTECODE=1
PYTHONUNBUFFERED=1
"@
    }
    
    foreach ($file in $envConfigs.Keys) {
        $filePath = "$backendDir\$file"
        if (-not (Test-Path $filePath)) {
            $envConfigs[$file] | Out-File -FilePath $filePath -Encoding UTF8
            Write-ColorOutput "✅ 已创建 $file" "Green"
        } else {
            Write-ColorOutput "⚠️ $file 已存在，跳过创建" "Yellow"
        }
    }
}

# 初始化数据库
function Initialize-Database {
    Write-ColorOutput "`n🗄️ 初始化数据库..." "Blue"
    
    $backendDir = "backend"
    
    # 检查数据库连接
    Write-ColorOutput "🔍 检查数据库连接..." "Cyan"
    try {
        $dbCheck = Test-NetConnection -ComputerName localhost -Port 5433 -WarningAction SilentlyContinue
        if (-not $dbCheck.TcpTestSucceeded) {
            Write-ColorOutput "⚠️ 数据库服务未运行，请先启动数据库" "Yellow"
            Write-ColorOutput "运行: .\scripts\db-manage.ps1 start" "Cyan"
            return
        }
    }
    catch {
        Write-ColorOutput "⚠️ 无法检查数据库连接" "Yellow"
    }
    
    # 运行数据库迁移
    if (-not $SkipMigration) {
        if (Test-Path "$backendDir\alembic.ini") {
            Write-ColorOutput "🔄 运行数据库迁移..." "Cyan"
            Invoke-CommandSafely "uv run alembic upgrade head" "数据库迁移" $backendDir -IgnoreErrors
        } else {
            Write-ColorOutput "⚠️ Alembic 配置不存在，跳过数据库迁移" "Yellow"
        }
    }
    
    # 创建初始数据
    if (Test-Path "$backendDir\scripts\init_data.py") {
        Write-ColorOutput "📊 创建初始数据..." "Cyan"
        Invoke-CommandSafely "uv run python scripts/init_data.py" "创建初始数据" $backendDir -IgnoreErrors
    }
}

# 启动开发服务器
function Start-DevelopmentServer {
    Write-ColorOutput "`n🚀 启动后端开发服务器..." "Blue"
    
    $backendDir = "backend"
    
    # 检查虚拟环境
    if (-not (Test-Path "$backendDir\.venv")) {
        Write-ColorOutput "❌ 虚拟环境不存在，请先运行环境设置" "Red"
        throw "虚拟环境不存在"
    }
    
    # 检查环境配置
    if (-not (Test-Path "$backendDir\.env")) {
        Write-ColorOutput "⚠️ 环境配置文件不存在，创建默认配置" "Yellow"
        New-EnvironmentConfig
    }
    
    # 检查端口占用
    try {
        $portCheck = Test-NetConnection -ComputerName localhost -Port 8000 -WarningAction SilentlyContinue
        if ($portCheck.TcpTestSucceeded) {
            Write-ColorOutput "⚠️ 端口 8000 已被占用" "Yellow"
        }
    }
    catch {
        # 端口检查失败，继续执行
    }
    
    Write-ColorOutput "🌐 后端服务将在以下地址启动:" "Cyan"
    Write-ColorOutput "  API 服务器: http://localhost:8000" "White"
    Write-ColorOutput "  API 文档: http://localhost:8000/docs" "White"
    Write-ColorOutput "  ReDoc 文档: http://localhost:8000/redoc" "White"
    Write-ColorOutput "`n💡 提示:" "Yellow"
    Write-ColorOutput "  - 修改代码后会自动重载" "Gray"
    Write-ColorOutput "  - 按 Ctrl+C 停止服务" "Gray"
    Write-ColorOutput "  - 查看日志: tail -f logs/app.log" "Gray"
    
    # 启动开发服务器
    try {
        Set-Location $backendDir
        Write-ColorOutput "`n🎯 正在启动..." "Cyan"
        uv run uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload --log-level debug
    }
    catch {
        Write-ColorOutput "❌ 开发服务器启动失败: $($_.Exception.Message)" "Red"
        throw
    }
}

# 运行数据库迁移
function Invoke-DatabaseMigration {
    Write-ColorOutput "`n🔄 数据库迁移管理..." "Blue"
    
    $backendDir = "backend"
    
    # 检查 Alembic 配置
    if (-not (Test-Path "$backendDir\alembic.ini")) {
        Write-ColorOutput "❌ Alembic 配置文件不存在" "Red"
        Write-ColorOutput "初始化 Alembic: uv run alembic init migrations" "Cyan"
        return
    }
    
    # 显示当前迁移状态
    Write-ColorOutput "📊 当前迁移状态:" "Cyan"
    Invoke-CommandSafely "uv run alembic current" "查看当前迁移版本" $backendDir -IgnoreErrors
    
    # 显示待执行的迁移
    Write-ColorOutput "📋 待执行的迁移:" "Cyan"
    Invoke-CommandSafely "uv run alembic heads" "查看最新迁移版本" $backendDir -IgnoreErrors
    
    # 执行迁移
    $confirmation = Read-Host "是否执行数据库迁移? (y/N)"
    if ($confirmation -eq "y" -or $confirmation -eq "Y") {
        Invoke-CommandSafely "uv run alembic upgrade head" "执行数据库迁移" $backendDir
        Write-ColorOutput "✅ 数据库迁移完成" "Green"
    } else {
        Write-ColorOutput "⏭️ 跳过数据库迁移" "Yellow"
    }
    
    # 显示迁移历史
    Write-ColorOutput "`n📜 迁移历史:" "Cyan"
    Invoke-CommandSafely "uv run alembic history --verbose" "查看迁移历史" $backendDir -IgnoreErrors
}

# 启动 Python Shell
function Start-PythonShell {
    Write-ColorOutput "`n🐍 启动 Python 交互式 Shell..." "Blue"
    
    $backendDir = "backend"
    
    # 检查虚拟环境
    if (-not (Test-Path "$backendDir\.venv")) {
        Write-ColorOutput "❌ 虚拟环境不存在，请先运行环境设置" "Red"
        return
    }
    
    Write-ColorOutput "💡 提示:" "Yellow"
    Write-ColorOutput "  - 已加载项目环境变量" "Gray"
    Write-ColorOutput "  - 可以直接导入项目模块" "Gray"
    Write-ColorOutput "  - 输入 exit() 退出 Shell" "Gray"
    
    try {
        Set-Location $backendDir
        Write-ColorOutput "`n🎯 启动 Python Shell..." "Cyan"
        uv run python
    }
    catch {
        Write-ColorOutput "❌ Python Shell 启动失败: $($_.Exception.Message)" "Red"
    }
}

# 清理项目
function Clear-Project {
    Write-ColorOutput "`n🧹 清理后端项目..." "Blue"
    
    $backendDir = "backend"
    
    $cleanTargets = @(
        "$backendDir\.venv",
        "$backendDir\__pycache__",
        "$backendDir\.pytest_cache",
        "$backendDir\.mypy_cache",
        "$backendDir\htmlcov",
        "$backendDir\coverage.xml",
        "$backendDir\.coverage",
        "$backendDir\dist",
        "$backendDir\build",
        "$backendDir\*.egg-info"
    )
    
    foreach ($target in $cleanTargets) {
        if (Test-Path $target) {
            Remove-Item -Recurse -Force $target
            Write-ColorOutput "🗑️ 已删除 $target" "Gray"
        }
    }
    
    # 清理 Python 缓存
    Get-ChildItem -Path $backendDir -Recurse -Name "__pycache__" -Directory | ForEach-Object {
        $fullPath = Join-Path $backendDir $_
        Remove-Item -Recurse -Force $fullPath
        Write-ColorOutput "🗑️ 已删除 $fullPath" "Gray"
    }
    
    # 清理 .pyc 文件
    Get-ChildItem -Path $backendDir -Recurse -Filter "*.pyc" | Remove-Item -Force
    
    Write-ColorOutput "✅ 项目清理完成" "Green"
}

# 健康检查
function Invoke-HealthCheck {
    Write-ColorOutput "`n🏥 后端环境健康检查..." "Blue"
    
    $backendDir = "backend"
    
    # 检查 Python 版本
    Write-ColorOutput "🐍 Python 环境检查:" "Cyan"
    if (Test-Path "$backendDir\.venv") {
        Invoke-CommandSafely "uv run python --version" "Python 版本" $backendDir -IgnoreErrors
        Invoke-CommandSafely "uv run python -c `"import sys; print(f'Python 路径: {sys.executable}')`"" "Python 路径" $backendDir -IgnoreErrors
    } else {
        Write-ColorOutput "❌ 虚拟环境不存在" "Red"
    }
    
    # 检查依赖
    Write-ColorOutput "`n📦 依赖检查:" "Cyan"
    $criticalDeps = @("fastapi", "sqlalchemy", "redis", "pydantic", "uvicorn")
    
    foreach ($dep in $criticalDeps) {
        Invoke-CommandSafely "uv run python -c `"import $dep; print(f'$dep: {$dep.__version__}')`"" "$dep 版本" $backendDir -IgnoreErrors
    }
    
    # 检查配置文件
    Write-ColorOutput "`n📝 配置文件检查:" "Cyan"
    $configFiles = @(".env", "pyproject.toml", "alembic.ini")
    
    foreach ($file in $configFiles) {
        $filePath = "$backendDir\$file"
        if (Test-Path $filePath) {
            Write-ColorOutput "✅ $file 存在" "Green"
        } else {
            Write-ColorOutput "❌ $file 不存在" "Red"
        }
    }
    
    # 检查数据库连接
    Write-ColorOutput "`n🗄️ 数据库连接检查:" "Cyan"
    $dbServices = @(
        @{ Name = "PostgreSQL"; Port = 5433 },
        @{ Name = "Redis"; Port = 6380 },
        @{ Name = "InfluxDB"; Port = 8087 }
    )
    
    foreach ($service in $dbServices) {
        try {
            $connection = Test-NetConnection -ComputerName localhost -Port $service.Port -WarningAction SilentlyContinue
            if ($connection.TcpTestSucceeded) {
                Write-ColorOutput "✅ $($service.Name) 连接正常 (端口: $($service.Port))" "Green"
            } else {
                Write-ColorOutput "❌ $($service.Name) 连接失败 (端口: $($service.Port))" "Red"
            }
        }
        catch {
            Write-ColorOutput "❌ $($service.Name) 连接检查失败" "Red"
        }
    }
    
    # 检查项目结构
    Write-ColorOutput "`n📁 项目结构检查:" "Cyan"
    $requiredDirs = @("src", "tests", "migrations")
    
    foreach ($dir in $requiredDirs) {
        $dirPath = "$backendDir\$dir"
        if (Test-Path $dirPath) {
            Write-ColorOutput "✅ $dir 目录存在" "Green"
        } else {
            Write-ColorOutput "⚠️ $dir 目录不存在" "Yellow"
        }
    }
}

# 显示项目信息
function Show-ProjectInfo {
    Write-ColorOutput "`n📋 后端项目信息:" "Blue"
    Write-ColorOutput "$('=' * 50)" "Cyan"
    
    $backendDir = "backend"
    
    # 项目基本信息
    if (Test-Path "$backendDir\pyproject.toml") {
        try {
            $pyprojectContent = Get-Content "$backendDir\pyproject.toml" -Raw
            if ($pyprojectContent -match 'name\s*=\s*"([^"]+)"') {
                Write-ColorOutput "📦 项目名称: $($Matches[1])" "White"
            }
            if ($pyprojectContent -match 'version\s*=\s*"([^"]+)"') {
                Write-ColorOutput "🏷️ 版本: $($Matches[1])" "White"
            }
            if ($pyprojectContent -match 'description\s*=\s*"([^"]+)"') {
                Write-ColorOutput "📝 描述: $($Matches[1])" "White"
            }
        }
        catch {
            Write-ColorOutput "⚠️ pyproject.toml 解析失败" "Yellow"
        }
    }
    
    # Python 环境信息
    Write-ColorOutput "`n🐍 Python 环境:" "Blue"
    if (Test-Path "$backendDir\.venv") {
        try {
            Set-Location $backendDir
            $pythonVersion = uv run python --version
            Write-ColorOutput "  版本: $pythonVersion" "White"
            
            $venvPath = Resolve-Path ".venv"
            Write-ColorOutput "  虚拟环境: $venvPath" "White"
        }
        catch {
            Write-ColorOutput "  ⚠️ 无法获取 Python 环境信息" "Yellow"
        }
        finally {
            Set-Location ..
        }
    } else {
        Write-ColorOutput "  ❌ 虚拟环境未创建" "Red"
    }
    
    # 可用命令
    Write-ColorOutput "`n🛠️ 可用命令:" "Blue"
    Write-ColorOutput "  uv run uvicorn src.main:app --reload  - 启动开发服务器" "White"
    Write-ColorOutput "  uv run pytest                        - 运行测试" "White"
    Write-ColorOutput "  uv run alembic upgrade head           - 数据库迁移" "White"
    Write-ColorOutput "  uv run python                        - Python Shell" "White"
    Write-ColorOutput "  uv run black src/ tests/              - 代码格式化" "White"
    Write-ColorOutput "  uv run mypy src/                      - 类型检查" "White"
    
    # 服务地址
    Write-ColorOutput "`n🔗 服务地址:" "Blue"
    Write-ColorOutput "  API 服务器: http://localhost:8000" "Cyan"
    Write-ColorOutput "  API 文档: http://localhost:8000/docs" "Cyan"
    Write-ColorOutput "  ReDoc 文档: http://localhost:8000/redoc" "Cyan"
    
    # 数据库连接
    Write-ColorOutput "`n🗄️ 数据库连接:" "Blue"
    Write-ColorOutput "  PostgreSQL: localhost:5433" "Cyan"
    Write-ColorOutput "  Redis: localhost:6380" "Cyan"
    Write-ColorOutput "  InfluxDB: http://localhost:8087" "Cyan"
}

# 主执行函数
function Main {
    try {
        Write-ColorOutput "🐍 后端开发环境管理工具" "Green"
        Write-ColorOutput "操作: $Action" "Cyan"
        Write-ColorOutput "Python 版本: $Python" "Cyan"
        if ($Production) { Write-ColorOutput "模式: 生产环境" "Yellow" }
        Write-ColorOutput "$('=' * 50)" "Cyan"
        
        # 检查前置条件
        Test-Prerequisites
        Test-BackendDirectory
        
        # 根据操作执行相应功能
        switch ($Action) {
            "setup" {
                Install-PythonVersion
                New-VirtualEnvironment
                New-EnvironmentConfig
                Install-Dependencies
                Initialize-Database
                Show-ProjectInfo
            }
            "install" {
                Install-Dependencies
            }
            "dev" {
                Start-DevelopmentServer
            }
            "migrate" {
                Invoke-DatabaseMigration
            }
            "shell" {
                Start-PythonShell
            }
            "clean" {
                Clear-Project
            }
            "check" {
                Invoke-HealthCheck
            }
        }
        
        Write-ColorOutput "`n✅ 后端操作完成！" "Green"
        
    }
    catch {
        Write-ColorOutput "`n❌ 后端操作失败: $($_.Exception.Message)" "Red"
        Write-ColorOutput "请检查错误信息并重新运行" "Yellow"
        exit 1
    }
}

# 执行主函数
Main