#!/usr/bin/env pwsh
<#
.SYNOPSIS
    启动已编译的后端服务

.DESCRIPTION
    直接运行已编译的 app.exe 程序，无需重新编译
    适用于生产环境或快速启动场景

.PARAMETER Background
    是否在后台运行

.PARAMETER CheckHealth
    启动后是否检查健康状态

.EXAMPLE
    .\start-backend-compiled.ps1
    在前台启动后端服务

.EXAMPLE
    .\start-backend-compiled.ps1 -Background
    在后台启动后端服务

.EXAMPLE
    .\start-backend-compiled.ps1 -CheckHealth
    启动后端服务并检查健康状态

.NOTES
    文件名: start-backend-compiled.ps1
    版本: 1.0.0
    创建日期: 2026-01-30
#>

[CmdletBinding()]
param(
    [switch]$Background,
    [switch]$CheckHealth
)

# 设置错误处理
$ErrorActionPreference = "Stop"

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

# 主函数
function Main {
    Write-ColorOutput "🚀 启动后端 API 服务" "Green"
    Write-ColorOutput "$('=' * 50)" "Cyan"
    
    # 检查可执行文件
    $exePath = "backend-go\app.exe"
    
    if (-not (Test-Path $exePath)) {
        Write-ColorOutput "❌ 未找到编译后的程序: $exePath" "Red"
        Write-ColorOutput "请先编译后端程序:" "Yellow"
        Write-ColorOutput "  cd backend-go" "White"
        Write-ColorOutput "  go build -o app.exe ./cmd/api" "White"
        exit 1
    }
    
    # 获取文件信息
    $fileInfo = Get-Item $exePath
    Write-ColorOutput "📦 程序信息:" "Blue"
    Write-ColorOutput "  文件: $($fileInfo.Name)" "Gray"
    Write-ColorOutput "  大小: $([math]::Round($fileInfo.Length / 1MB, 2)) MB" "Gray"
    Write-ColorOutput "  编译时间: $($fileInfo.LastWriteTime)" "Gray"

    # 提醒：如果 app.exe 编译时间早于源码修改时间，启动的可能不是最新代码
    try {
        $sourceFiles = Get-ChildItem -Path "backend-go" -Recurse -Filter "*.go" -File -ErrorAction SilentlyContinue
        if ($sourceFiles -and $sourceFiles.Count -gt 0) {
            $latestSourceFile = $sourceFiles | Sort-Object LastWriteTime -Descending | Select-Object -First 1
            if ($latestSourceFile -and $fileInfo.LastWriteTime -lt $latestSourceFile.LastWriteTime) {
                Write-ColorOutput "⚠️ 警告: app.exe 编译时间早于源码最新修改时间 ($($latestSourceFile.LastWriteTime))" "Yellow"
                Write-ColorOutput "  当前启动的后端可能未包含最新代码变更" "Yellow"
                Write-ColorOutput "  如需更新，请执行: cd backend-go; go build -o app.exe ./cmd/api" "Gray"
            }
        }
    }
    catch {
        # 忽略检查失败（例如权限/路径问题）
    }
    
    # 检查环境配置
    if (-not (Test-Path ".env")) {
        Write-ColorOutput "⚠️ 警告: 未找到 .env 配置文件" "Yellow"
        Write-ColorOutput "将使用默认配置或环境变量" "Yellow"
    }
    
    # 检查端口占用
    $port = 8000
    $portInUse = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    
    if ($portInUse) {
        Write-ColorOutput "⚠️ 警告: 端口 $port 已被占用" "Yellow"
        Write-ColorOutput "请先停止占用该端口的进程，或修改配置使用其他端口" "Yellow"
        
        $continue = Read-Host "是否继续启动? (y/N)"
        if ($continue -ne "y" -and $continue -ne "Y") {
            Write-ColorOutput "已取消启动" "Gray"
            exit 0
        }
    }
    
    # 启动服务
    Write-ColorOutput "`n🔧 启动服务..." "Cyan"
    Write-ColorOutput "访问地址: http://localhost:$port" "White"
    Write-ColorOutput "健康检查: http://localhost:$port/health" "White"
    Write-ColorOutput "API 文档: docs/api/openapi.json" "White"
    
    if ($Background) {
        # 后台启动
        Write-ColorOutput "`n后台模式启动..." "Yellow"
        $process = Start-Process -FilePath $exePath -WorkingDirectory (Get-Location) -PassThru -WindowStyle Hidden
        Write-ColorOutput "✅ 后端服务已在后台启动 (PID: $($process.Id))" "Green"
        Write-ColorOutput "停止服务: Stop-Process -Id $($process.Id)" "Gray"
    } else {
        # 前台启动
        Write-ColorOutput "`n按 Ctrl+C 停止服务`n" "Gray"
        Write-ColorOutput "$('=' * 50)" "Cyan"
        
        try {
            & $exePath
        }
        catch {
            Write-ColorOutput "`n❌ 服务异常退出: $($_.Exception.Message)" "Red"
            exit 1
        }
    }
    
    # 健康检查
    if ($CheckHealth -and $Background) {
        Write-ColorOutput "`n⏳ 等待服务启动..." "Yellow"
        Start-Sleep -Seconds 3
        
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:$port/health" -TimeoutSec 5 -UseBasicParsing
            if ($response.StatusCode -eq 200) {
                $healthData = $response.Content | ConvertFrom-Json
                Write-ColorOutput "✅ 服务健康检查通过" "Green"
                Write-ColorOutput "  状态: $($healthData.status)" "Gray"
                Write-ColorOutput "  版本: $($healthData.version)" "Gray"
            }
        }
        catch {
            Write-ColorOutput "⚠️ 健康检查失败: $($_.Exception.Message)" "Yellow"
            Write-ColorOutput "服务可能仍在启动中，请稍后手动检查" "Yellow"
        }
    }
    
    Write-ColorOutput "`n✅ 完成" "Green"
}

# 执行主函数
try {
    Main
}
catch {
    Write-ColorOutput "`n❌ 启动失败: $($_.Exception.Message)" "Red"
    exit 1
}
