# UltraThink 前端服务启动脚本 (修复版)
# Frontend Service Startup Script for UltraThink

param(
    [ValidateSet("dev", "prod", "build", "test")]
    [string]$Mode = "dev",
    [int]$Port = 3000,
    [switch]$SkipDeps
)

# 设置错误处理
$ErrorActionPreference = "Stop"

# 获取脚本目录和项目根目录
$ScriptDir = Split-Path -Parent $PSCommandPath
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $ScriptDir)

# 颜色输出函数
function Write-Info { param([string]$Message) Write-Host $Message -ForegroundColor Cyan }
function Write-Success { param([string]$Message) Write-Host $Message -ForegroundColor Green }
function Write-Warning { param([string]$Message) Write-Host $Message -ForegroundColor Yellow }
function Write-Error { param([string]$Message) Write-Host $Message -ForegroundColor Red }

try {
    Write-Info "🚀 UltraThink 前端服务启动脚本"
    Write-Info "================================="
    
    # 检查是否在项目根目录
    $FrontendDir = Join-Path $ProjectRoot "frontend"
    if (-not (Test-Path $FrontendDir)) {
        Write-Error "❌ 错误: 找不到 frontend 目录: $FrontendDir"
        exit 1
    }
    
    Write-Success "📁 前端目录: $FrontendDir"
    
    # 切换到前端目录
    Set-Location $FrontendDir
    Write-Success "📂 切换到前端目录"
    
    # 检查 Node.js
    try {
        $NodeVersion = node --version
        Write-Success "✅ Node.js 版本: $NodeVersion"
    } catch {
        Write-Error "❌ 错误: 未安装 Node.js"
        Write-Warning "请访问 https://nodejs.org 下载安装 Node.js"
        exit 1
    }
    
    # 检查包管理器
    $PackageManager = "npm"
    if (Test-Path "pnpm-lock.yaml") {
        try {
            pnpm --version | Out-Null
            $PackageManager = "pnpm"
            Write-Success "📦 使用 pnpm 包管理器"
        } catch {
            Write-Warning "⚠️ 检测到 pnpm-lock.yaml 但未安装 pnpm，使用 npm"
        }
    } else {
        Write-Success "📦 使用 npm 包管理器"
    }
    
    # 检查依赖
    if (-not $SkipDeps -and -not (Test-Path "node_modules")) {
        Write-Warning "📥 安装依赖..."
        if ($PackageManager -eq "pnpm") {
            pnpm install
        } else {
            npm install
        }
        
        if ($LASTEXITCODE -ne 0) {
            Write-Error "❌ 依赖安装失败"
            exit 1
        }
        Write-Success "✅ 依赖安装完成"
    }
    
    # 设置端口
    if ($Port -ne 3000) {
        $env:PORT = $Port
        Write-Warning "🔧 设置端口: $Port"
    }
    
    # 执行命令
    Write-Info "🎯 运行模式: $Mode"
    
    switch ($Mode) {
        "dev" {
            Write-Success "🔥 启动开发服务器..."
            Write-Info "访问地址: http://localhost:$Port"
            Write-Warning "按 Ctrl+C 停止服务"
            if ($PackageManager -eq "pnpm") {
                pnpm run dev
            } else {
                npm run dev
            }
        }
        "prod" {
            Write-Success "🏭 启动生产服务器..."
            Write-Warning "🔨 构建项目..."
            if ($PackageManager -eq "pnpm") {
                pnpm run build
                if ($LASTEXITCODE -eq 0) {
                    Write-Success "🚀 启动生产服务器..."
                    Write-Info "访问地址: http://localhost:$Port"
                    pnpm run start
                }
            } else {
                npm run build
                if ($LASTEXITCODE -eq 0) {
                    Write-Success "🚀 启动生产服务器..."
                    Write-Info "访问地址: http://localhost:$Port"
                    npm run start
                }
            }
        }
        "build" {
            Write-Success "🔨 构建项目..."
            if ($PackageManager -eq "pnpm") {
                pnpm run build
            } else {
                npm run build
            }
        }
        "test" {
            Write-Success "🧪 运行测试..."
            if ($PackageManager -eq "pnpm") {
                pnpm run test
            } else {
                npm run test
            }
        }
    }
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "❌ 命令执行失败，退出码: $LASTEXITCODE"
        exit $LASTEXITCODE
    }
    
    Write-Success "✅ 操作完成"
    
} catch {
    Write-Error "❌ 发生错误: $($_.Exception.Message)"
    exit 1
} finally {
    # 恢复原始目录
    Set-Location $ProjectRoot
}