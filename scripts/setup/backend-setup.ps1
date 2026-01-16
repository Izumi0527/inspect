#!/usr/bin/env pwsh
<#
.SYNOPSIS
    后端开发环境设置脚本（Go 版本）

.DESCRIPTION
    用于设置和管理 Go 后端开发环境，Python 后端已废弃不再使用
    支持依赖安装、数据库迁移、开发启动与环境检查

.PARAMETER Action
    操作类型: setup, install, dev, migrate, clean, check

.PARAMETER SkipMigration
    跳过数据库迁移

.PARAMETER Production
    使用生产环境配置文件（.env.production）

.PARAMETER Port
    启动端口（默认 8000）

.EXAMPLE
    .\backend-setup.ps1 setup
    完整的后端环境设置

.EXAMPLE
    .\backend-setup.ps1 dev -Port 8001
    启动开发服务器

.EXAMPLE
    .\backend-setup.ps1 migrate
    仅执行数据库迁移
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet("setup", "install", "dev", "migrate", "clean", "check")]
    [string]$Action,
    
    [switch]$SkipMigration,
    
    [switch]$Production,
    
    [int]$Port = 8000
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$script:ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$script:BackendPath = Join-Path $script:ProjectRoot "backend-go"

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

function Invoke-CommandSafely {
    param(
        [string]$Command,
        [string]$Description,
        [string]$WorkingDirectory = $script:BackendPath,
        [switch]$IgnoreErrors
    )

    Write-ColorOutput "?? $Description..." "Cyan"

    try {
        $originalLocation = Get-Location
        Set-Location $WorkingDirectory

        $result = Invoke-Expression $Command

        if ($LASTEXITCODE -eq 0 -or $null -eq $LASTEXITCODE) {
            Write-ColorOutput "? $Description 完成" "Green"
            return $true
        }

        throw "命令执行失败，退出代码: $LASTEXITCODE"
    }
    catch {
        if ($IgnoreErrors) {
            Write-ColorOutput "?? $Description 失败: $($_.Exception.Message)" "Yellow"
            return $false
        }

        Write-ColorOutput "? $Description 失败: $($_.Exception.Message)" "Red"
        throw
    }
    finally {
        Set-Location $originalLocation
    }
}

function Test-Prerequisites {
    Write-ColorOutput "?? 检查后端开发前置条件..." "Blue"

    $tools = @(
        @{ Command = "go"; Name = "Go 运行时" }
    )

    $allOk = $true
    foreach ($tool in $tools) {
        try {
            $version = & $tool.Command "version" 2>$null
            if ($version) {
                Write-ColorOutput "? $($tool.Name) 已安装: $version" "Green"
            } else {
                throw "版本信息获取失败"
            }
        }
        catch {
            Write-ColorOutput "? $($tool.Name) 未安装或不可用" "Red"
            $allOk = $false
        }
    }

    if (-not $allOk) {
        Write-ColorOutput "`n安装指南:" "Yellow"
        Write-ColorOutput "  Go: https://go.dev/dl/ (建议 1.22+)" "Gray"
        throw "前置条件检查失败"
    }
}

function Test-BackendDirectory {
    if (-not (Test-Path $script:BackendPath)) {
        Write-ColorOutput "? backend-go 目录不存在" "Red"
        throw "backend-go 目录不存在，请确认项目结构"
    }

    if (-not (Test-Path (Join-Path $script:BackendPath "go.mod"))) {
        Write-ColorOutput "? go.mod 不存在" "Red"
        throw "go.mod 不存在，请确认 Go 后端项目配置"
    }

    Write-ColorOutput "? 后端目录结构正常" "Green"
}

function Resolve-EnvFile {
    $envFile = if ($Production) { ".env.production" } else { ".env.development" }

    $candidate = Join-Path $script:ProjectRoot $envFile
    if (Test-Path $candidate) {
        return $candidate
    }

    $fallback = Join-Path $script:ProjectRoot ".env"
    if (Test-Path $fallback) {
        return $fallback
    }

    $example = Join-Path $script:ProjectRoot ".env.example"
    if (Test-Path $example) {
        Copy-Item -Path $example -Destination $candidate
        return $candidate
    }

    return $null
}

function Set-BackendEnv {
    $envFile = Resolve-EnvFile
    if ($envFile) {
        $env:ENV_FILE = $envFile
        Write-ColorOutput "? 使用环境文件: $envFile" "Green"
        return
    }

    Write-ColorOutput "?? 未找到 .env 文件，将使用默认配置" "Yellow"
}

function Install-Dependencies {
    Write-ColorOutput "?? 安装 Go 依赖..." "Blue"
    Invoke-CommandSafely "go mod download" "下载 Go 依赖"
}

function Run-Migration {
    Set-BackendEnv
    Invoke-CommandSafely "go run ./cmd/migrate" "执行数据库迁移"
}

function Start-DevServer {
    Set-BackendEnv

    if ($Port -gt 0) {
        $env:SERVER_PORT = $Port
    }

    Invoke-CommandSafely "go run ./cmd/api" "启动 Go 后端服务"
}

function Clean-Backend {
    Write-ColorOutput "?? 清理 Go 构建缓存..." "Blue"
    Invoke-CommandSafely "go clean -cache -testcache" "清理 Go 缓存" $script:BackendPath -IgnoreErrors

    $logDir = Join-Path $script:ProjectRoot "logs\backend-go"
    if (Test-Path $logDir) {
        Remove-Item -Recurse -Force $logDir
        Write-ColorOutput "? 已清理日志目录: $logDir" "Green"
    }
}

function Show-Status {
    Write-ColorOutput "?? 后端环境检查" "Blue"
    Invoke-CommandSafely "go version" "Go 版本" $script:BackendPath -IgnoreErrors
    Invoke-CommandSafely "go env GOPATH" "GOPATH" $script:BackendPath -IgnoreErrors
    Invoke-CommandSafely "go list ./..." "模块依赖检查" $script:BackendPath -IgnoreErrors
}

function Main {
    try {
        Test-Prerequisites
        Test-BackendDirectory

        switch ($Action) {
            "setup" {
                Install-Dependencies
                if (-not $SkipMigration) {
                    Run-Migration
                }
            }
            "install" {
                Install-Dependencies
            }
            "migrate" {
                Run-Migration
            }
            "dev" {
                Start-DevServer
            }
            "clean" {
                Clean-Backend
            }
            "check" {
                Show-Status
            }
        }

        Write-ColorOutput "`n? 操作完成" "Green"
    }
    catch {
        Write-ColorOutput "`n? 操作失败: $($_.Exception.Message)" "Red"
        exit 1
    }
}

Main
