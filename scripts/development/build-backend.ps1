#!/usr/bin/env pwsh
<#
.SYNOPSIS
    编译后端 Go 服务

.DESCRIPTION
    编译后端 API 服务为可执行文件
    支持不同的编译模式和目标平台

.PARAMETER Mode
    编译模式: release (生产), debug (调试), dev (开发)

.PARAMETER Platform
    目标平台: windows, linux, darwin (macOS)

.PARAMETER Output
    输出文件名（不含扩展名）

.PARAMETER Clean
    编译前清理旧文件

.EXAMPLE
    .\build-backend.ps1
    使用默认设置编译（release 模式，Windows 平台）

.EXAMPLE
    .\build-backend.ps1 -Mode debug
    编译调试版本

.EXAMPLE
    .\build-backend.ps1 -Platform linux
    交叉编译 Linux 版本

.EXAMPLE
    .\build-backend.ps1 -Clean
    清理后重新编译

.NOTES
    文件名: build-backend.ps1
    版本: 1.0.0
    创建日期: 2026-01-30
#>

[CmdletBinding()]
param(
    [ValidateSet("release", "debug", "dev")]
    [string]$Mode = "release",
    
    [ValidateSet("windows", "linux", "darwin")]
    [string]$Platform = "windows",
    
    [string]$Output = "app",
    
    [switch]$Clean
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
    Write-ColorOutput "🔨 编译后端 Go 服务" "Green"
    Write-ColorOutput "$('=' * 50)" "Cyan"
    
    # 检查 Go 环境
    try {
        $goVersion = go version
        Write-ColorOutput "✅ Go 环境: $goVersion" "Green"
    }
    catch {
        Write-ColorOutput "❌ Go 未安装或不可用" "Red"
        exit 1
    }
    
    # 检查后端目录
    $backendDir = "backend-go"
    if (-not (Test-Path $backendDir)) {
        Write-ColorOutput "❌ 后端目录不存在: $backendDir" "Red"
        exit 1
    }
    
    # 切换到后端目录
    Push-Location $backendDir
    
    try {
        # 清理旧文件
        if ($Clean) {
            Write-ColorOutput "`n🧹 清理旧文件..." "Yellow"
            Remove-Item "*.exe" -ErrorAction SilentlyContinue
            Remove-Item "app" -ErrorAction SilentlyContinue
            go clean
            Write-ColorOutput "✅ 清理完成" "Green"
        }
        
        # 设置输出文件名
        $outputFile = $Output
        if ($Platform -eq "windows") {
            $outputFile += ".exe"
        }
        
        # 构建编译参数
        $buildArgs = @("build")
        
        switch ($Mode) {
            "release" {
                Write-ColorOutput "`n📦 编译模式: 生产版本 (优化)" "Blue"
                $buildArgs += "-ldflags=-s -w"
                Write-ColorOutput "  - 去除调试信息" "Gray"
                Write-ColorOutput "  - 去除符号表" "Gray"
                Write-ColorOutput "  - 最小化文件体积" "Gray"
            }
            "debug" {
                Write-ColorOutput "`n🐛 编译模式: 调试版本" "Blue"
                $buildArgs += "-gcflags=all=-N -l"
                Write-ColorOutput "  - 禁用优化" "Gray"
                Write-ColorOutput "  - 禁用内联" "Gray"
                Write-ColorOutput "  - 保留调试信息" "Gray"
                $outputFile = $Output + "-debug"
                if ($Platform -eq "windows") {
                    $outputFile += ".exe"
                }
            }
            "dev" {
                Write-ColorOutput "`n🔧 编译模式: 开发版本" "Blue"
                Write-ColorOutput "  - 标准编译" "Gray"
            }
        }
        
        # 设置目标平台
        $env:GOOS = $Platform
        if ($Platform -eq "windows") {
            $env:GOARCH = "amd64"
        } elseif ($Platform -eq "linux") {
            $env:GOARCH = "amd64"
        } elseif ($Platform -eq "darwin") {
            $env:GOARCH = "amd64"
        }
        
        Write-ColorOutput "🎯 目标平台: $Platform ($($env:GOARCH))" "Cyan"
        
        # 添加输出文件参数
        $buildArgs += "-o"
        $buildArgs += $outputFile
        $buildArgs += "./cmd/api"
        
        # 显示编译命令
        Write-ColorOutput "`n📝 编译命令:" "Blue"
        Write-ColorOutput "  go $($buildArgs -join ' ')" "Gray"
        
        # 执行编译
        Write-ColorOutput "`n⏳ 正在编译..." "Yellow"
        $startTime = Get-Date
        
        & go @buildArgs
        
        if ($LASTEXITCODE -eq 0) {
            $endTime = Get-Date
            $duration = ($endTime - $startTime).TotalSeconds
            
            Write-ColorOutput "`n✅ 编译成功！" "Green"
            Write-ColorOutput "耗时: $([math]::Round($duration, 2)) 秒" "Gray"
            
            # 显示文件信息
            if (Test-Path $outputFile) {
                $fileInfo = Get-Item $outputFile
                Write-ColorOutput "`n📦 输出文件:" "Blue"
                Write-ColorOutput "  文件名: $($fileInfo.Name)" "White"
                Write-ColorOutput "  大小: $([math]::Round($fileInfo.Length / 1MB, 2)) MB" "White"
                Write-ColorOutput "  路径: $($fileInfo.FullName)" "Gray"
                
                # 运行提示
                Write-ColorOutput "`n🚀 运行方式:" "Blue"
                if ($Platform -eq "windows") {
                    Write-ColorOutput "  .\$outputFile" "White"
                    Write-ColorOutput "  或使用启动脚本: ..\scripts\development\start-backend-compiled.ps1" "Gray"
                } else {
                    Write-ColorOutput "  ./$outputFile" "White"
                }
            }
        } else {
            Write-ColorOutput "`n❌ 编译失败" "Red"
            exit 1
        }
        
    }
    catch {
        Write-ColorOutput "`n❌ 编译过程出错: $($_.Exception.Message)" "Red"
        exit 1
    }
    finally {
        # 恢复环境变量
        Remove-Item Env:\GOOS -ErrorAction SilentlyContinue
        Remove-Item Env:\GOARCH -ErrorAction SilentlyContinue
        
        # 返回原目录
        Pop-Location
    }
    
    Write-ColorOutput "`n✅ 完成" "Green"
}

# 执行主函数
Main
