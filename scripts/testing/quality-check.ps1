#!/usr/bin/env pwsh
<#
.SYNOPSIS
    代码质量检查脚本（Go 版）

.DESCRIPTION
    对前端与 Go 后端代码进行质量检查，支持格式化、静态检查与测试

.PARAMETER Target
    检查目标: frontend, backend, all (默认)

.PARAMETER Fix
    自动修复可修复的问题

.PARAMETER Strict
    严格模式，警告视为错误

.PARAMETER SkipTests
    跳过测试运行
#>

[CmdletBinding()]
param(
    [ValidateSet("frontend", "backend", "all")]
    [string]$Target = "all",

    [switch]$Fix,

    [switch]$Strict,

    [switch]$SkipTests
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$script:TotalIssues = 0
$script:CheckResults = @()

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

function Add-CheckResult {
    param(
        [string]$Category,
        [string]$Description,
        [string]$Command,
        [int]$ExitCode,
        [string]$Output,
        [string]$Status,
        [int]$IssueCount
    )

    $script:CheckResults += @{
        Category = $Category
        Description = $Description
        Command = $Command
        ExitCode = $ExitCode
        Output = $Output
        Status = $Status
        IssueCount = $IssueCount
    }

    if ($IssueCount -gt 0) {
        $script:TotalIssues += $IssueCount
    }
}

function Invoke-QualityCheck {
    param(
        [string]$Command,
        [string]$Description,
        [string]$WorkingDirectory = $PWD,
        [string]$Category = "General",
        [switch]$AllowWarnings
    )

    Write-ColorOutput "?? $Description..." "Cyan"

    try {
        $originalLocation = Get-Location
        Set-Location $WorkingDirectory

        $output = Invoke-Expression $Command 2>&1
        $exitCode = $LASTEXITCODE
        $issueCount = ($output | Measure-Object).Count

        if ($exitCode -eq 0) {
            Add-CheckResult $Category $Description $Command $exitCode ($output -join "`n") "Pass" 0
            Write-ColorOutput "? $Description 通过" "Green"
            return
        }

        if ($AllowWarnings -and -not $Strict) {
            Add-CheckResult $Category $Description $Command $exitCode ($output -join "`n") "Warning" $issueCount
            Write-ColorOutput "?? $Description 有警告 ($issueCount 个问题)" "Yellow"
            return
        }

        Add-CheckResult $Category $Description $Command $exitCode ($output -join "`n") "Fail" $issueCount
        Write-ColorOutput "? $Description 失败 ($issueCount 个问题)" "Red"
    }
    catch {
        Add-CheckResult $Category $Description $Command -1 $_.Exception.Message "Error" 1
        Write-ColorOutput "? $Description 执行失败: $($_.Exception.Message)" "Red"
    }
    finally {
        Set-Location $originalLocation
    }
}

function Invoke-QualityFix {
    param(
        [string]$Command,
        [string]$Description,
        [string]$WorkingDirectory = $PWD
    )

    Write-ColorOutput "?? $Description..." "Yellow"

    try {
        $originalLocation = Get-Location
        Set-Location $WorkingDirectory

        $output = Invoke-Expression $Command 2>&1
        $exitCode = $LASTEXITCODE

        if ($exitCode -eq 0) {
            Write-ColorOutput "? $Description 完成" "Green"
        } else {
            Write-ColorOutput "? $Description 失败" "Red"
            if ($output) {
                $output | ForEach-Object { Write-ColorOutput "  $_" "Gray" }
            }
        }
    }
    catch {
        Write-ColorOutput "? $Description 执行失败: $($_.Exception.Message)" "Red"
    }
    finally {
        Set-Location $originalLocation
    }
}

function Test-BackendQuality {
    Write-ColorOutput "`n?? 后端代码质量检查..." "Blue"

    $backendDir = "backend-go"

    if (-not (Test-Path $backendDir)) {
        Write-ColorOutput "?? 后端目录不存在，跳过后端检查" "Yellow"
        return
    }

    if ($Fix) {
        Invoke-QualityFix "gofmt -w ." "Go 代码格式化" $backendDir
    } else {
        Write-ColorOutput "?? Go 代码格式检查..." "Cyan"
        try {
            $originalLocation = Get-Location
            Set-Location $backendDir

            $formatOutput = gofmt -l . 2>&1
            if ($formatOutput) {
                $issueCount = ($formatOutput | Measure-Object).Count
                Add-CheckResult "Backend" "Go 代码格式检查" "gofmt -l ." 0 ($formatOutput -join "`n") "Warning" $issueCount
                $messageColor = if ($Strict) { "Red" } else { "Yellow" }
                Write-ColorOutput "?? Go 代码格式检查有问题 ($issueCount 个文件)" $messageColor
                if ($Strict) { $script:TotalIssues += $issueCount }
            } else {
                Add-CheckResult "Backend" "Go 代码格式检查" "gofmt -l ." 0 "" "Pass" 0
                Write-ColorOutput "? Go 代码格式检查通过" "Green"
            }
        } finally {
            Set-Location $originalLocation
        }
    }

    Invoke-QualityCheck "go vet ./..." "静态检查 (go vet)" $backendDir "Backend" -AllowWarnings

    if (Get-Command "golangci-lint" -ErrorAction SilentlyContinue) {
        Invoke-QualityCheck "golangci-lint run ./..." "代码质量检查 (golangci-lint)" $backendDir "Backend" -AllowWarnings
    } else {
        Write-ColorOutput "?? golangci-lint 未安装，跳过代码质量检查" "Yellow"
    }

    if (-not $SkipTests) {
        Invoke-QualityCheck "go test ./..." "后端测试" $backendDir "Backend"
    }
}

function Test-FrontendQuality {
    Write-ColorOutput "`n?? 前端代码质量检查..." "Blue"

    $frontendDir = "frontend"

    if (-not (Test-Path $frontendDir)) {
        Write-ColorOutput "?? 前端目录不存在，跳过前端检查" "Yellow"
        return
    }

    if (-not (Test-Path "$frontendDir\node_modules")) {
        Write-ColorOutput "?? 前端依赖未安装，请先运行 pnpm install" "Yellow"
        return
    }

    Invoke-QualityCheck "pnpm run type-check" "TypeScript 类型检查" $frontendDir "Frontend"

    if ($Fix) {
        Invoke-QualityFix "pnpm run lint --fix" "ESLint 自动修复" $frontendDir
    } else {
        Invoke-QualityCheck "pnpm run lint" "ESLint 代码检查" $frontendDir "Frontend" -AllowWarnings
    }
}

function Show-Report {
    Write-ColorOutput "`n?? 质量检查报告" "Blue"
    Write-ColorOutput "$('=' * 60)" "Cyan"

    $categories = $script:CheckResults | Group-Object Category
    foreach ($category in $categories) {
        Write-ColorOutput "`n?? $($category.Name)" "Blue"
        foreach ($item in $category.Group) {
            $statusColor = switch ($item.Status) {
                "Pass" { "Green" }
                "Warning" { if ($Strict) { "Red" } else { "Yellow" } }
                "Fail" { "Red" }
                default { "Yellow" }
            }
            Write-ColorOutput "  - $($item.Description): $($item.Status)" $statusColor
        }
    }

    Write-ColorOutput "`n?? 总问题数: $script:TotalIssues" "White"
}

function Main {
    try {
        Write-ColorOutput "?? 代码质量检查" "Green"
        Write-ColorOutput "检查目标: $Target" "Cyan"
        if ($Fix) { Write-ColorOutput "自动修复: 是" "Yellow" }
        if ($Strict) { Write-ColorOutput "严格模式: 是" "Yellow" }
        Write-ColorOutput "$('=' * 60)" "Cyan"

        switch ($Target) {
            "backend" { Test-BackendQuality }
            "frontend" { Test-FrontendQuality }
            "all" {
                Test-BackendQuality
                Test-FrontendQuality
            }
        }

        Show-Report

        if ($Strict -and $script:TotalIssues -gt 0) {
            Write-ColorOutput "`n? 严格模式下存在问题，请修复后重试" "Red"
            exit 1
        }
    }
    catch {
        Write-ColorOutput "`n? 质量检查失败: $($_.Exception.Message)" "Red"
        exit 1
    }
}

Main
