# 企业级网络设备巡检系统 - 后端服务启动脚本
# 支持虚拟环境自动管理、依赖安装和服务启动的一键式解决方案

param(
    [switch]$Dev,                   # 开发模式启动（默认，带热重载）
    [switch]$Prod,                 # 生产模式启动
    [int]$Port = 8000,             # 服务端口（默认8000）
    [switch]$Migrate,              # 启动前运行数据库迁移
    [switch]$NoDeps,               # 跳过依赖安装
    [switch]$ForceDeps,            # 强制重新安装所有依赖
    [switch]$Debug,                # 启用调试日志
    [switch]$CleanEnv,             # 清理环境变量
    [switch]$Help                  # 显示帮助信息
)

$ErrorActionPreference = "Stop"

# 全局变量
$script:ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:ProjectRoot = Split-Path -Parent $script:ScriptPath
$script:BackendPath = Join-Path $script:ProjectRoot "backend"
$script:LogsPath = Join-Path $script:ProjectRoot "logs"
$script:BackendLogsPath = Join-Path $script:LogsPath "backend"
$script:VenvPath = Join-Path $script:BackendPath ".venv"

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

function Write-LogStep {
    param([string]$Message)
    Write-Host "[步骤] $Message" -ForegroundColor Cyan
}

function Write-LogDebug {
    param([string]$Message)
    if ($Debug) {
        Write-Host "[调试] $Message" -ForegroundColor Magenta
    }
}

# 显示帮助信息
function Show-Help {
    Write-Host "企业级网络设备巡检系统 - 后端服务启动脚本" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "用法:"
    Write-Host "    .\start-backend.ps1 [选项]"
    Write-Host ""
    Write-Host "启动模式:"
    Write-Host "    -Dev                开发模式启动（默认，带热重载）"
    Write-Host "    -Prod               生产模式启动"
    Write-Host ""
    Write-Host "配置选项:"
    Write-Host "    -Port <端口>         指定服务端口（默认：8000）"
    Write-Host "    -Migrate            启动前运行数据库迁移"
    Write-Host "    -NoDeps             跳过依赖安装检查"
    Write-Host "    -ForceDeps          强制重新安装所有依赖包"
    Write-Host "    -CleanEnv           清理可能冲突的环境变量"
    Write-Host ""
    Write-Host "调试选项:"
    Write-Host "    -Debug              启用详细调试输出"
    Write-Host "    -Help               显示此帮助信息"
    Write-Host ""
    Write-Host "示例:"
    Write-Host "    .\start-backend.ps1                    # 开发模式启动"
    Write-Host "    .\start-backend.ps1 -Dev -Port 8001    # 指定端口启动"
    Write-Host "    .\start-backend.ps1 -Prod              # 生产模式启动"
    Write-Host "    .\start-backend.ps1 -Migrate -Debug    # 运行迁移并启用调试"
    Write-Host "    .\start-backend.ps1 -ForceDeps         # 强制重装依赖后启动"
    Write-Host "    .\start-backend.ps1 -CleanEnv          # 清理环境变量后启动"
    Write-Host ""
    Write-Host "说明:"
    Write-Host "    🐍 自动管理Python虚拟环境（.venv）"
    Write-Host "    📦 使用uv进行高效依赖管理"
    Write-Host "    🔄 支持开发模式热重载"
    Write-Host "    🗃️ 可选数据库迁移"
    Write-Host "    📋 详细的启动日志"
    Write-Host ""
}

# 检查环境依赖
function Test-Environment {
    Write-LogStep "检查环境依赖..."
    
    $missingTools = @()
    
    # 检查Python
    if (-not (Get-Command "python" -ErrorAction SilentlyContinue)) {
        $missingTools += "Python"
    } else {
        $pythonVersion = python --version 2>&1
        Write-LogDebug "发现Python: $pythonVersion"
    }
    
    # 检查uv
    if (-not (Get-Command "uv" -ErrorAction SilentlyContinue)) {
        $missingTools += "uv"
    } else {
        $uvVersion = uv --version 2>&1
        Write-LogDebug "发现uv: $uvVersion"
    }
    
    # 检查后端目录
    if (-not (Test-Path $script:BackendPath)) {
        Write-LogError "后端目录不存在: $script:BackendPath"
        throw "项目结构错误"
    }
    
    # 检查requirements.txt
    $requirementsFile = Join-Path $script:BackendPath "requirements.txt"
    if (-not (Test-Path $requirementsFile)) {
        Write-LogError "requirements.txt文件不存在: $requirementsFile"
        throw "依赖配置文件缺失"
    }
    
    if ($missingTools.Count -gt 0) {
        Write-LogError "缺少必需工具: $($missingTools -join ', ')"
        Write-LogInfo "请安装以下工具："
        foreach ($tool in $missingTools) {
            switch ($tool) {
                "Python" { Write-LogInfo "  - Python 3.8+: https://www.python.org/downloads/" }
                "uv" { Write-LogInfo "  - uv: pip install uv" }
            }
        }
        throw "环境依赖检查失败"
    }
    
    Write-LogSuccess "环境依赖检查通过"
}

# 创建必要目录
function Initialize-Directories {
    Write-LogStep "初始化目录结构..."
    
    $directories = @(
        $script:LogsPath,
        $script:BackendLogsPath
    )
    
    foreach ($dir in $directories) {
        if (-not (Test-Path $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
            Write-LogDebug "创建目录: $dir"
        }
    }
    
    Write-LogSuccess "目录结构初始化完成"
}

# 设置虚拟环境
function Initialize-VirtualEnvironment {
    Write-LogStep "设置Python虚拟环境..."
    
    Push-Location $script:BackendPath
    try {
        # 检查虚拟环境是否存在
        if (-not (Test-Path $script:VenvPath)) {
            Write-LogInfo "创建新的虚拟环境..."
            python -m venv .venv
            Write-LogSuccess "虚拟环境创建完成"
        } else {
            Write-LogDebug "虚拟环境已存在: $script:VenvPath"
        }
        
        # 激活虚拟环境
        $activateScript = Join-Path $script:VenvPath "Scripts\Activate.ps1"
        if (Test-Path $activateScript) {
            Write-LogInfo "激活虚拟环境..."
            & $activateScript
            Write-LogSuccess "虚拟环境激活成功"
        } else {
            Write-LogError "虚拟环境激活脚本不存在: $activateScript"
            throw "虚拟环境配置错误"
        }
        
    } finally {
        Pop-Location
    }
}

# 安装依赖包
function Install-Dependencies {
    if ($NoDeps) {
        Write-LogInfo "跳过依赖安装（-NoDeps参数已指定）"
        return
    }
    
    Write-LogStep "安装Python依赖包..."
    
    Push-Location $script:BackendPath
    try {
        # 检查uv是否已在虚拟环境中可用
        Write-LogInfo "检查uv工具状态..."
        $uvInVenv = $false
        try {
            $uvVersion = uv --version 2>&1
            if ($uvVersion -match "uv \d+\.\d+\.\d+") {
                Write-LogDebug "uv工具已可用: $uvVersion"
                $uvInVenv = $true
            }
        } catch {
            Write-LogDebug "uv工具需要安装到虚拟环境中"
        }
        
        # 仅在需要时安装uv
        if (-not $uvInVenv) {
            Write-LogInfo "安装uv工具到虚拟环境..."
            pip install uv --quiet
            Write-LogDebug "uv工具安装完成"
        }
        
        # 检查是否已安装依赖（避免重复安装）
        if ($ForceDeps) {
            Write-LogInfo "强制重新安装模式，将重装所有依赖包..."
            $missingPackages = Get-Content requirements.txt | Where-Object { $_ -notmatch "^\s*#" -and $_ -notmatch "^\s*$" }
        } else {
            Write-LogInfo "检查现有依赖安装状态..."
            $installedPackages = uv pip list --format json 2>$null | ConvertFrom-Json
            $requiredPackages = Get-Content requirements.txt | Where-Object { $_ -notmatch "^\s*#" -and $_ -notmatch "^\s*$" }
            $missingPackages = @()
            
            foreach ($req in $requiredPackages) {
                $packageName = ($req -split ">=|==|>|<|~=|\[")[0].Trim()
                if (-not ($installedPackages | Where-Object { $_.name -eq $packageName })) {
                    $missingPackages += $req
                }
            }
        }
        
        if ($missingPackages.Count -eq 0) {
            Write-LogSuccess "所有依赖包已安装，跳过安装步骤"
            return
        }
        
        Write-LogInfo "需要安装 $($missingPackages.Count) 个依赖包..."
        Write-LogInfo "使用uv高效安装项目依赖（这可能需要几分钟时间）..."
        
        # 使用uv的高性能安装选项
        $uvArgs = @(
            "pip", "install",
            "-r", "requirements.txt",
            "--quiet"  # 减少输出噪音
        )
        
        if ($Debug) {
            $uvArgs = $uvArgs | Where-Object { $_ -ne "--quiet" }
            Write-LogDebug "执行命令: uv $($uvArgs -join ' ')"
        }
        
        # 显示进度提示
        $installJob = Start-Job -ScriptBlock {
            param($uvArgs, $backendPath)
            Set-Location $backendPath
            & uv @uvArgs
        } -ArgumentList $uvArgs, $script:BackendPath
        
        # 进度显示
        $dots = 0
        while ($installJob.State -eq "Running") {
            $progressChar = @(".", "..", "...")[($dots % 3)]
            Write-Host "`r[信息] 正在安装依赖包$progressChar" -ForegroundColor Blue -NoNewline
            Start-Sleep -Seconds 2
            $dots++
        }
        Write-Host ""  # 换行
        
        # 获取安装结果
        $installResult = Receive-Job -Job $installJob -Wait
        Remove-Job -Job $installJob
        
        if ($LASTEXITCODE -eq 0) {
            Write-LogSuccess "依赖包安装完成"
        } else {
            throw "uv安装失败，退出代码: $LASTEXITCODE"
        }
        
        # 显示已安装包列表（调试模式）
        if ($Debug) {
            Write-LogDebug "已安装包列表:"
            uv pip list
        }
        
    } catch {
        Write-LogError "依赖包安装失败: $($_.Exception.Message)"
        Write-LogInfo "建议解决方案:"
        Write-LogInfo "  1. 检查网络连接"
        Write-LogInfo "  2. 尝试使用 -NoDeps 参数跳过依赖安装"
        Write-LogInfo "  3. 手动运行: cd backend && uv pip install -r requirements.txt"
        throw
    } finally {
        Pop-Location
    }
}

# 清理环境变量
function Clear-ConflictingEnvironmentVariables {
    Write-LogStep "清理可能冲突的环境变量..."
    
    $variablesToClear = @(
        "CORS_ORIGINS",
        "ALLOWED_HOSTS"
    )
    
    foreach ($var in $variablesToClear) {
        if (Test-Path "Env:$var") {
            Remove-Item "Env:$var" -ErrorAction SilentlyContinue
            Write-LogDebug "清理环境变量: $var"
        }
    }
    
    Write-LogSuccess "环境变量清理完成"
}

# 加载环境配置
function Load-EnvironmentConfiguration {
    Write-LogStep "加载环境配置..."
    
    # 查找.env文件
    $envFiles = @(
        (Join-Path $script:ProjectRoot ".env"),
        (Join-Path $script:BackendPath ".env"),
        (Join-Path $script:ProjectRoot ".env.dev")
    )
    
    $envFileFound = $false
    foreach ($envFile in $envFiles) {
        if (Test-Path $envFile) {
            Write-LogInfo "发现环境配置文件: $envFile"
            $envFileFound = $true
            
            # 简单的.env文件解析（仅用于验证）
            $envContent = Get-Content $envFile -ErrorAction SilentlyContinue
            if ($Debug -and $envContent) {
                $configCount = ($envContent | Where-Object { $_ -match '^[^#].*=.*' }).Count
                Write-LogDebug "配置项数量: $configCount"
            }
            break
        }
    }
    
    if (-not $envFileFound) {
        Write-LogWarning "未找到.env配置文件，将使用默认配置"
        Write-LogInfo "建议从 .env.example 复制并配置 .env 文件"
    }
    
    # 设置关键环境变量（如果未设置）
    if (-not $env:DATABASE_URL) {
        $env:DATABASE_URL = "postgresql+asyncpg://inspect_dev:dev_password_2024@localhost:5433/inspect_system_dev"
        Write-LogDebug "设置默认DATABASE_URL"
    }
    
    Write-LogSuccess "环境配置加载完成"
}

# 运行数据库迁移
function Invoke-DatabaseMigration {
    if (-not $Migrate) {
        Write-LogDebug "跳过数据库迁移（未指定-Migrate参数）"
        return
    }
    
    Write-LogStep "运行数据库迁移..."
    
    Push-Location $script:BackendPath
    try {
        # 检查Alembic配置
        $alembicIni = Join-Path $script:BackendPath "alembic.ini"
        if (-not (Test-Path $alembicIni)) {
            Write-LogWarning "未找到alembic.ini配置文件，跳过迁移"
            return
        }
        
        # 运行迁移
        Write-LogInfo "执行数据库模式迁移..."
        uv run alembic upgrade head
        
        Write-LogSuccess "数据库迁移完成"
        
    } catch {
        Write-LogError "数据库迁移失败: $($_.Exception.Message)"
        Write-LogWarning "服务将继续启动，但可能存在数据库模式问题"
    } finally {
        Pop-Location
    }
}

# 启动后端服务
function Start-BackendService {
    Write-LogStep "启动后端服务..."
    
    Push-Location $script:BackendPath
    try {
        # 显示启动信息
        $mode = if ($Prod) { "生产模式" } else { "开发模式" }
        Write-LogInfo "启动模式: $mode"
        Write-LogInfo "服务端口: $Port"
        Write-LogInfo "服务URL: http://localhost:$Port"
        Write-LogInfo "API文档: http://localhost:$Port/docs"
        Write-LogInfo ""
        Write-LogSuccess "后端服务正在启动..."
        Write-LogWarning "按 Ctrl+C 停止服务"
        Write-Host ""

        # 选择启动命令
        if ($Prod) {
            # 生产模式
            Write-LogInfo "生产模式启动参数："
            Write-LogInfo "  - 访问日志: 启用"
            Write-LogInfo "  - 日志级别: info"
            Write-LogInfo "  - 工作进程: 1"
            uv run uvicorn src.main:app `
                --host 0.0.0.0 `
                --port $Port `
                --access-log `
                --log-level info `
                --no-use-colors
        } else {
            # 开发模式（默认）
            Write-LogInfo "开发模式启动参数："
            Write-LogInfo "  - 热重载: 启用"
            Write-LogInfo "  - 访问日志: 启用"
            Write-LogInfo "  - 日志级别: debug"
            Write-LogInfo "  - 彩色输出: 启用"
            uv run uvicorn src.main:app `
                --reload `
                --host 0.0.0.0 `
                --port $Port `
                --access-log `
                --log-level debug `
                --use-colors
        }

    } catch {
        Write-LogError "服务启动失败: $($_.Exception.Message)"
        throw
    } finally {
        Pop-Location
    }
}

# 主函数
function Main {
    try {
        # 显示标题
        Write-Host ""
        Write-Host "🚀 企业级网络设备巡检系统 - 后端服务启动" -ForegroundColor Cyan
        Write-Host "============================================" -ForegroundColor Cyan
        Write-Host ""
        
        # 检查帮助参数
        if ($Help) {
            Show-Help
            return
        }
        
        # 确定启动模式
        if ($Prod -and $Dev) {
            Write-LogError "不能同时指定 -Prod 和 -Dev 参数"
            return
        }
        
        # 检查依赖安装参数冲突
        if ($NoDeps -and $ForceDeps) {
            Write-LogError "不能同时指定 -NoDeps 和 -ForceDeps 参数"
            return
        }
        
        if (-not $Prod -and -not $Dev) {
            $Dev = $true  # 默认开发模式
        }
        
        # 执行启动流程
        Test-Environment
        Initialize-Directories
        
        if ($CleanEnv) {
            Clear-ConflictingEnvironmentVariables
        }
        
        Load-EnvironmentConfiguration
        Initialize-VirtualEnvironment
        Install-Dependencies
        Invoke-DatabaseMigration
        
        # 启动服务
        Start-BackendService
        
    } catch {
        Write-LogError "后端服务启动失败: $($_.Exception.Message)"
        if ($Debug) {
            Write-Host "错误详情: $($_.ScriptStackTrace)" -ForegroundColor Red
        }
        Write-LogInfo "请检查以上错误信息并重试"
        exit 1
    }
}

# 执行主函数
Main