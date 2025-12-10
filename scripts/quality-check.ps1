#!/usr/bin/env pwsh
<#
.SYNOPSIS
    代码质量检查脚本 - 统一的代码质量检查工具

.DESCRIPTION
    对前端和后端代码进行全面的质量检查，包括格式化、语法检查、类型检查等
    支持自动修复和详细的错误报告

.PARAMETER Target
    检查目标: frontend, backend, all (默认)

.PARAMETER Fix
    自动修复可修复的问题

.PARAMETER Strict
    严格模式，任何警告都视为错误

.PARAMETER SkipTests
    跳过测试运行

.EXAMPLE
    .\quality-check.ps1
    检查所有代码

.EXAMPLE
    .\quality-check.ps1 -Target backend -Fix
    检查并自动修复后端代码

.EXAMPLE
    .\quality-check.ps1 -Strict
    严格模式检查

.NOTES
    文件名: quality-check.ps1
    作者: 技术团队
    版本: 1.0.0
    创建日期: 2025-12-10
#>

[CmdletBinding()]
param(
    [ValidateSet("frontend", "backend", "all")]
    [string]$Target = "all",
    
    [switch]$Fix,
    
    [switch]$Strict,
    
    [switch]$SkipTests
)

# 设置错误处理
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# 全局变量
$script:TotalIssues = 0
$script:FixedIssues = 0
$script:CheckResults = @()

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

# 执行命令并记录结果
function Invoke-QualityCheck {
    param(
        [string]$Command,
        [string]$Description,
        [string]$WorkingDirectory = $PWD,
        [string]$Category = "General",
        [switch]$AllowWarnings
    )
    
    Write-ColorOutput "🔍 $Description..." "Cyan"
    
    try {
        $originalLocation = Get-Location
        Set-Location $WorkingDirectory
        
        $output = Invoke-Expression $Command 2>&1
        $exitCode = $LASTEXITCODE
        
        $result = @{
            Category = $Category
            Description = $Description
            Command = $Command
            ExitCode = $exitCode
            Output = $output -join "`n"
            Status = "Unknown"
            IssueCount = 0
        }
        
        # 判断结果状态
        if ($exitCode -eq 0) {
            $result.Status = "Pass"
            Write-ColorOutput "✅ $Description 通过" "Green"
        } elseif ($AllowWarnings -and $exitCode -eq 1) {
            $result.Status = "Warning"
            $result.IssueCount = ($output | Measure-Object).Count
            $script:TotalIssues += $result.IssueCount
            Write-ColorOutput "⚠️ $Description 有警告 ($($result.IssueCount) 个问题)" "Yellow"
        } else {
            $result.Status = "Fail"
            $result.IssueCount = ($output | Measure-Object).Count
            $script:TotalIssues += $result.IssueCount
            Write-ColorOutput "❌ $Description 失败 ($($result.IssueCount) 个问题)" "Red"
            
            # 显示错误详情
            if ($output) {
                Write-ColorOutput "错误详情:" "Gray"
                $output | ForEach-Object { Write-ColorOutput "  $_" "Gray" }
            }
        }
        
        $script:CheckResults += $result
        return $result
        
    }
    catch {
        $result = @{
            Category = $Category
            Description = $Description
            Command = $Command
            ExitCode = -1
            Output = $_.Exception.Message
            Status = "Error"
            IssueCount = 1
        }
        
        $script:TotalIssues += 1
        $script:CheckResults += $result
        
        Write-ColorOutput "❌ $Description 执行失败: $($_.Exception.Message)" "Red"
        return $result
    }
    finally {
        Set-Location $originalLocation
    }
}

# 执行修复命令
function Invoke-QualityFix {
    param(
        [string]$Command,
        [string]$Description,
        [string]$WorkingDirectory = $PWD
    )
    
    Write-ColorOutput "🔧 $Description..." "Yellow"
    
    try {
        $originalLocation = Get-Location
        Set-Location $WorkingDirectory
        
        $output = Invoke-Expression $Command 2>&1
        $exitCode = $LASTEXITCODE
        
        if ($exitCode -eq 0) {
            $script:FixedIssues++
            Write-ColorOutput "✅ $Description 完成" "Green"
            return $true
        } else {
            Write-ColorOutput "❌ $Description 失败" "Red"
            if ($output) {
                $output | ForEach-Object { Write-ColorOutput "  $_" "Gray" }
            }
            return $false
        }
    }
    catch {
        Write-ColorOutput "❌ $Description 执行失败: $($_.Exception.Message)" "Red"
        return $false
    }
    finally {
        Set-Location $originalLocation
    }
}

# 检查后端代码质量
function Test-BackendQuality {
    Write-ColorOutput "`n🐍 后端代码质量检查..." "Blue"
    
    $backendDir = "backend"
    
    # 检查后端目录是否存在
    if (-not (Test-Path $backendDir)) {
        Write-ColorOutput "⚠️ 后端目录不存在，跳过后端检查" "Yellow"
        return
    }
    
    # 检查虚拟环境
    if (-not (Test-Path "$backendDir\.venv")) {
        Write-ColorOutput "⚠️ 虚拟环境不存在，请先运行环境设置" "Yellow"
        return
    }
    
    # 代码格式化检查
    if ($Fix) {
        Invoke-QualityFix "uv run black src/ tests/" "Python 代码格式化" $backendDir
        Invoke-QualityFix "uv run isort src/ tests/" "导入语句排序" $backendDir
    } else {
        Invoke-QualityCheck "uv run black --check src/ tests/" "Python 代码格式检查" $backendDir "Backend"
        Invoke-QualityCheck "uv run isort --check-only src/ tests/" "导入语句排序检查" $backendDir "Backend"
    }
    
    # 代码质量检查
    Invoke-QualityCheck "uv run flake8 src/ tests/" "代码风格检查 (flake8)" $backendDir "Backend" -AllowWarnings
    
    # 类型检查
    Invoke-QualityCheck "uv run mypy src/" "类型检查 (mypy)" $backendDir "Backend" -AllowWarnings
    
    # 安全检查
    if (Test-Path "$backendDir\requirements.txt") {
        try {
            Invoke-QualityCheck "uv run safety check" "安全漏洞检查 (safety)" $backendDir "Backend" -AllowWarnings
        }
        catch {
            Write-ColorOutput "⚠️ safety 工具未安装，跳过安全检查" "Yellow"
        }
    }
    
    # 代码复杂度检查
    try {
        Invoke-QualityCheck "uv run radon cc src/ -a" "代码复杂度检查 (radon)" $backendDir "Backend" -AllowWarnings
    }
    catch {
        Write-ColorOutput "⚠️ radon 工具未安装，跳过复杂度检查" "Yellow"
    }
    
    # 运行测试
    if (-not $SkipTests -and (Test-Path "$backendDir\tests")) {
        Invoke-QualityCheck "uv run pytest tests/ -v --tb=short" "单元测试" $backendDir "Backend"
        
        # 测试覆盖率
        try {
            Invoke-QualityCheck "uv run pytest tests/ --cov=src --cov-report=term-missing --cov-fail-under=70" "测试覆盖率检查" $backendDir "Backend" -AllowWarnings
        }
        catch {
            Write-ColorOutput "⚠️ 测试覆盖率检查失败，可能是覆盖率不足" "Yellow"
        }
    }
}

# 检查前端代码质量
function Test-FrontendQuality {
    Write-ColorOutput "`n🎨 前端代码质量检查..." "Blue"
    
    $frontendDir = "frontend"
    
    # 检查前端目录是否存在
    if (-not (Test-Path $frontendDir)) {
        Write-ColorOutput "⚠️ 前端目录不存在，跳过前端检查" "Yellow"
        return
    }
    
    # 检查 node_modules
    if (-not (Test-Path "$frontendDir\node_modules")) {
        Write-ColorOutput "⚠️ 前端依赖未安装，请先运行 pnpm install" "Yellow"
        return
    }
    
    # TypeScript 类型检查
    Invoke-QualityCheck "pnpm run type-check" "TypeScript 类型检查" $frontendDir "Frontend"
    
    # ESLint 检查
    if ($Fix) {
        Invoke-QualityFix "pnpm run lint --fix" "ESLint 自动修复" $frontendDir
    } else {
        Invoke-QualityCheck "pnpm run lint" "ESLint 代码检查" $frontendDir "Frontend" -AllowWarnings
    }
    
    # Prettier 格式化检查
    if ($Fix) {
        Invoke-QualityFix "pnpm run format" "Prettier 代码格式化" $frontendDir
    } else {
        Invoke-QualityCheck "pnpm run format:check" "Prettier 格式检查" $frontendDir "Frontend"
    }
    
    # 构建检查
    Invoke-QualityCheck "pnpm run build" "Next.js 构建检查" $frontendDir "Frontend"
    
    # 运行测试
    if (-not $SkipTests) {
        Invoke-QualityCheck "pnpm run test --run" "前端单元测试" $frontendDir "Frontend"
        
        # E2E 测试 (如果存在)
        if (Test-Path "$frontendDir\e2e") {
            try {
                Invoke-QualityCheck "pnpm run test:e2e" "E2E 测试" $frontendDir "Frontend" -AllowWarnings
            }
            catch {
                Write-ColorOutput "⚠️ E2E 测试脚本不存在，跳过" "Yellow"
            }
        }
    }
    
    # 包大小分析
    try {
        Invoke-QualityCheck "pnpm run analyze" "包大小分析" $frontendDir "Frontend" -AllowWarnings
    }
    catch {
        Write-ColorOutput "⚠️ 包分析脚本不存在，跳过" "Yellow"
    }
}

# 检查通用文件
function Test-GeneralQuality {
    Write-ColorOutput "`n📋 通用文件检查..." "Blue"
    
    # 检查 Git 状态
    try {
        $gitStatus = git status --porcelain 2>$null
        if ($gitStatus) {
            Write-ColorOutput "⚠️ 工作目录有未提交的更改" "Yellow"
            $gitStatus | ForEach-Object { Write-ColorOutput "  $_" "Gray" }
        } else {
            Write-ColorOutput "✅ Git 工作目录干净" "Green"
        }
    }
    catch {
        Write-ColorOutput "⚠️ 无法检查 Git 状态" "Yellow"
    }
    
    # 检查重要文件是否存在
    $importantFiles = @(
        "README.md",
        ".gitignore",
        "docker-compose.yml"
    )
    
    foreach ($file in $importantFiles) {
        if (Test-Path $file) {
            Write-ColorOutput "✅ $file 存在" "Green"
        } else {
            Write-ColorOutput "⚠️ $file 不存在" "Yellow"
            $script:TotalIssues++
        }
    }
    
    # 检查环境配置文件
    $envFiles = @(
        "backend\.env",
        "frontend\.env.local"
    )
    
    foreach ($envFile in $envFiles) {
        if (Test-Path $envFile) {
            Write-ColorOutput "✅ $envFile 存在" "Green"
        } else {
            Write-ColorOutput "⚠️ $envFile 不存在，可能需要从示例文件创建" "Yellow"
        }
    }
}

# 生成质量报告
function New-QualityReport {
    Write-ColorOutput "`n📊 代码质量报告" "Blue"
    Write-ColorOutput "$('=' * 60)" "Cyan"
    
    # 按类别统计
    $categories = $script:CheckResults | Group-Object Category
    
    foreach ($category in $categories) {
        Write-ColorOutput "`n📂 $($category.Name) 检查结果:" "Blue"
        
        $passed = ($category.Group | Where-Object { $_.Status -eq "Pass" }).Count
        $warnings = ($category.Group | Where-Object { $_.Status -eq "Warning" }).Count
        $failed = ($category.Group | Where-Object { $_.Status -eq "Fail" }).Count
        $errors = ($category.Group | Where-Object { $_.Status -eq "Error" }).Count
        
        Write-ColorOutput "  ✅ 通过: $passed" "Green"
        if ($warnings -gt 0) { Write-ColorOutput "  ⚠️ 警告: $warnings" "Yellow" }
        if ($failed -gt 0) { Write-ColorOutput "  ❌ 失败: $failed" "Red" }
        if ($errors -gt 0) { Write-ColorOutput "  💥 错误: $errors" "Red" }
        
        # 显示失败的检查详情
        $failedChecks = $category.Group | Where-Object { $_.Status -in @("Fail", "Error") }
        foreach ($check in $failedChecks) {
            Write-ColorOutput "    - $($check.Description): $($check.IssueCount) 个问题" "Red"
        }
    }
    
    # 总体统计
    Write-ColorOutput "`n📈 总体统计:" "Blue"
    Write-ColorOutput "  🔍 总检查项: $($script:CheckResults.Count)" "White"
    Write-ColorOutput "  ⚠️ 发现问题: $script:TotalIssues" $(if ($script:TotalIssues -eq 0) { "Green" } else { "Yellow" })
    
    if ($Fix) {
        Write-ColorOutput "  🔧 已修复: $script:FixedIssues" "Green"
        Write-ColorOutput "  🔄 剩余问题: $($script:TotalIssues - $script:FixedIssues)" $(if (($script:TotalIssues - $script:FixedIssues) -eq 0) { "Green" } else { "Yellow" })
    }
    
    # 质量评级
    $totalChecks = $script:CheckResults.Count
    $passedChecks = ($script:CheckResults | Where-Object { $_.Status -eq "Pass" }).Count
    $successRate = if ($totalChecks -gt 0) { [math]::Round(($passedChecks / $totalChecks) * 100, 1) } else { 0 }
    
    Write-ColorOutput "`n🏆 质量评级:" "Blue"
    $grade = switch ($successRate) {
        { $_ -ge 95 } { @{ Grade = "A+"; Color = "Green"; Description = "优秀" } }
        { $_ -ge 90 } { @{ Grade = "A"; Color = "Green"; Description = "良好" } }
        { $_ -ge 80 } { @{ Grade = "B"; Color = "Yellow"; Description = "一般" } }
        { $_ -ge 70 } { @{ Grade = "C"; Color = "Yellow"; Description = "需改进" } }
        default { @{ Grade = "D"; Color = "Red"; Description = "较差" } }
    }
    
    Write-ColorOutput "  📊 成功率: $successRate%" $grade.Color
    Write-ColorOutput "  🎯 评级: $($grade.Grade) ($($grade.Description))" $grade.Color
    
    # 建议
    Write-ColorOutput "`n💡 改进建议:" "Blue"
    if ($script:TotalIssues -eq 0) {
        Write-ColorOutput "  🎉 代码质量优秀，继续保持！" "Green"
    } else {
        Write-ColorOutput "  🔧 运行 -Fix 参数自动修复部分问题" "Yellow"
        Write-ColorOutput "  📖 查看详细错误信息并手动修复" "Yellow"
        Write-ColorOutput "  🧪 确保所有测试通过" "Yellow"
        Write-ColorOutput "  📚 参考项目文档了解最佳实践" "Yellow"
    }
}

# 主执行函数
function Main {
    try {
        Write-ColorOutput "🔍 代码质量检查工具" "Green"
        Write-ColorOutput "检查目标: $Target" "Cyan"
        if ($Fix) { Write-ColorOutput "模式: 自动修复" "Yellow" }
        if ($Strict) { Write-ColorOutput "模式: 严格检查" "Yellow" }
        Write-ColorOutput "$('=' * 60)" "Cyan"
        
        # 根据目标执行检查
        switch ($Target) {
            "backend" {
                Test-BackendQuality
            }
            "frontend" {
                Test-FrontendQuality
            }
            "all" {
                Test-GeneralQuality
                Test-BackendQuality
                Test-FrontendQuality
            }
        }
        
        # 生成报告
        New-QualityReport
        
        # 根据结果决定退出代码
        $hasErrors = $script:CheckResults | Where-Object { $_.Status -in @("Fail", "Error") }
        $hasWarnings = $script:CheckResults | Where-Object { $_.Status -eq "Warning" }
        
        if ($hasErrors) {
            Write-ColorOutput "`n❌ 代码质量检查失败，请修复错误后重新检查" "Red"
            exit 1
        } elseif ($Strict -and $hasWarnings) {
            Write-ColorOutput "`n⚠️ 严格模式下发现警告，请修复后重新检查" "Yellow"
            exit 1
        } else {
            Write-ColorOutput "`n✅ 代码质量检查通过！" "Green"
            exit 0
        }
        
    }
    catch {
        Write-ColorOutput "`n❌ 质量检查过程中发生错误: $($_.Exception.Message)" "Red"
        exit 1
    }
}

# 执行主函数
Main