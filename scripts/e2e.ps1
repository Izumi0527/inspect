#!/usr/bin/env pwsh
<#
.SYNOPSIS
    前端 E2E 测试入口（PowerShell 版）

.DESCRIPTION
    封装 frontend 的 playwright test，满足项目脚本化规范。
    - 前置：检查后端健康端点（global-setup 需真实登录），检查 chromium 是否已安装
    - 前端 dev server 由 playwright.config.ts 的 webServer 自动拉起/复用
    - 未识别的参数原样透传给 playwright test（--ui / --headed / --grep / spec 路径等）

.PARAMETER SkipBackendCheck
    跳过后端健康检查

.PARAMETER SkipBrowserCheck
    跳过 chromium 安装检查

.PARAMETER PlaywrightArgs
    透传给 playwright test 的参数（位置参数，可多个）

.EXAMPLE
    .\scripts\e2e.ps1
    运行全部 E2E 用例

.EXAMPLE
    .\scripts\e2e.ps1 --ui
    打开 playwright UI 模式

.EXAMPLE
    .\scripts\e2e.ps1 --headed --grep 总览
    有头模式运行标题匹配「总览」的用例

.NOTES
    文件名: e2e.ps1
    作者: 技术团队
    版本: 1.0.0
    环境变量 INSPECT_BACKEND_HEALTH_URL 可覆盖后端健康端点，默认 http://localhost:18080/health
#>

[CmdletBinding()]
param(
    [switch]$SkipBackendCheck,

    [switch]$SkipBrowserCheck,

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$PlaywrightArgs = @()
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    $ProjectRoot = (Get-Location).Path
}
$FrontendDir = Join-Path $ProjectRoot "frontend"
$BackendHealthUrl = if ($env:INSPECT_BACKEND_HEALTH_URL) { $env:INSPECT_BACKEND_HEALTH_URL } else { "http://localhost:18080/health" }

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

function Test-BackendHealth {
    Write-ColorOutput "🔄 检查后端健康端点 ($BackendHealthUrl)..." "Cyan"
    try {
        $null = Invoke-WebRequest -Uri $BackendHealthUrl -TimeoutSec 5 -UseBasicParsing
        Write-ColorOutput "✅ 后端在线" "Green"
    }
    catch {
        Write-ColorOutput "❌ 后端不可达；E2E 的 global-setup 需要真实登录，请先运行 .\scripts\dev-start.ps1" "Red"
        Write-ColorOutput "   如后端跑在其他地址，设置 INSPECT_BACKEND_HEALTH_URL 或加 -SkipBackendCheck" "Yellow"
        exit 1
    }
}

# playwright 的浏览器与库版本一一绑定，升级 @playwright/test 后须重新安装对应 revision；
# install 本身幂等：已安装时只校验标记文件、不联网。
function Install-ChromiumIfMissing {
    Write-ColorOutput "🔄 确保 chromium 已安装（与 @playwright/test 版本匹配）..." "Cyan"
    $originalLocation = Get-Location
    try {
        Set-Location -LiteralPath $FrontendDir
        & pnpm exec playwright install chromium
        if ($LASTEXITCODE -ne 0) {
            throw "chromium 安装失败（退出码 $LASTEXITCODE）"
        }
        Write-ColorOutput "✅ chromium 已就绪" "Green"
    }
    finally {
        Set-Location $originalLocation
    }
}

Write-ColorOutput "🎭 前端 E2E 测试入口" "Blue"
Write-ColorOutput ("=" * 60) "Cyan"

if (-not (Test-Path -LiteralPath $FrontendDir)) {
    Write-ColorOutput "❌ 前端目录不存在: $FrontendDir" "Red"
    exit 1
}
if (-not $SkipBackendCheck) { Test-BackendHealth }
if (-not $SkipBrowserCheck) { Install-ChromiumIfMissing }

Write-ColorOutput "`n🔄 运行 playwright test $($PlaywrightArgs -join ' ')" "Cyan"
$originalLocation = Get-Location
try {
    Set-Location -LiteralPath $FrontendDir
    & pnpm test:e2e @PlaywrightArgs
    $exitCode = $LASTEXITCODE
}
finally {
    Set-Location $originalLocation
}

Write-ColorOutput "" "White"
if ($exitCode -ne 0) {
    Write-ColorOutput "❌ E2E 测试失败（报告: frontend\playwright-report\index.html）" "Red"
    exit $exitCode
}
Write-ColorOutput "✅ E2E 测试通过" "Green"
