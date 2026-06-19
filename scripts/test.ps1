#!/usr/bin/env pwsh
<#
.SYNOPSIS
    测试与质量校验统一入口（PowerShell 版）

.DESCRIPTION
    封装后端与前端的构建/测试校验，提供单一验证入口，满足项目脚本化规范。
    - 后端：go build（可跳过）+ backend-go 单测 + tests/backend-go 外置测试模块
    - 前端：tsc 类型检查（可跳过）+ jest 单元测试

    所有步骤默认全部执行并在结尾汇总；任一步骤失败则整体以非零码退出。

.PARAMETER Scope
    校验范围：all（默认）、backend、frontend

.PARAMETER SkipBuild
    跳过后端 go build（仅跑测试）

.PARAMETER SkipTypeCheck
    跳过前端 tsc 类型检查（仅跑 jest）

.EXAMPLE
    .\scripts\test.ps1
    执行后端与前端的完整校验

.EXAMPLE
    .\scripts\test.ps1 -Scope backend
    仅执行后端校验

.NOTES
    文件名: test.ps1
    作者: 技术团队
    版本: 1.0.0
#>

[CmdletBinding()]
param(
    [ValidateSet("all", "backend", "frontend")]
    [string]$Scope = "all",

    [switch]$SkipBuild,

    [switch]$SkipTypeCheck
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    $ProjectRoot = (Get-Location).Path
}

function Write-ColorOutput {
    param([string]$Message, [string]$Color = "White")
    $colorMap = @{
        "Red" = [ConsoleColor]::Red; "Green" = [ConsoleColor]::Green
        "Yellow" = [ConsoleColor]::Yellow; "Blue" = [ConsoleColor]::Blue
        "Cyan" = [ConsoleColor]::Cyan; "Gray" = [ConsoleColor]::DarkGray
        "White" = [ConsoleColor]::White
    }
    Write-Host $Message -ForegroundColor $colorMap[$Color]
}

# 步骤执行结果累积；用调用运算符直接执行外部命令，避免动态字符串执行被安全软件误判。
$Script:Failures = @()

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [Parameter(Mandatory = $true)][scriptblock]$Action
    )

    Write-ColorOutput "`n🔄 $Name..." "Cyan"
    if (-not (Test-Path -LiteralPath $WorkingDirectory)) {
        Write-ColorOutput "⚠️ 跳过 $Name：目录不存在 ($WorkingDirectory)" "Yellow"
        return
    }

    $originalLocation = Get-Location
    try {
        Set-Location -LiteralPath $WorkingDirectory
        & $Action
        if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) {
            throw "退出码 $LASTEXITCODE"
        }
        Write-ColorOutput "✅ $Name 通过" "Green"
    }
    catch {
        Write-ColorOutput "❌ $Name 失败: $($_.Exception.Message)" "Red"
        $Script:Failures += $Name
    }
    finally {
        Set-Location $originalLocation
    }
}

function Test-Backend {
    $backendDir = Join-Path $ProjectRoot "backend-go"
    $testsDir = Join-Path $ProjectRoot "tests/backend-go"

    if (-not $SkipBuild) {
        Invoke-Step -Name "后端构建 (go build ./...)" -WorkingDirectory $backendDir -Action { & go build ./... }
    }
    Invoke-Step -Name "后端主模块测试 (backend-go)" -WorkingDirectory $backendDir -Action { & go test ./... -count=1 }
    Invoke-Step -Name "后端外置测试模块 (tests/backend-go)" -WorkingDirectory $testsDir -Action { & go test ./... -count=1 }
}

function Test-Frontend {
    $frontendDir = Join-Path $ProjectRoot "frontend"

    if (-not $SkipTypeCheck) {
        Invoke-Step -Name "前端类型检查 (tsc --noEmit)" -WorkingDirectory $frontendDir -Action { & pnpm run type-check }
    }
    Invoke-Step -Name "前端单元测试 (jest)" -WorkingDirectory $frontendDir -Action { & pnpm test -- --runInBand }
}

Write-ColorOutput "🧪 测试校验入口 (范围: $Scope)" "Blue"
Write-ColorOutput ("=" * 60) "Cyan"

switch ($Scope) {
    "backend" { Test-Backend }
    "frontend" { Test-Frontend }
    "all" { Test-Backend; Test-Frontend }
}

Write-ColorOutput "`n$('=' * 60)" "Cyan"
if ($Script:Failures.Count -gt 0) {
    Write-ColorOutput "❌ 校验失败的步骤 ($($Script:Failures.Count)):" "Red"
    foreach ($failure in $Script:Failures) {
        Write-ColorOutput "   - $failure" "Red"
    }
    exit 1
}

Write-ColorOutput "✅ 全部校验通过" "Green"
