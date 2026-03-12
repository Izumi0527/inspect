#!/usr/bin/env pwsh
<#
.SYNOPSIS
    统一测试运行脚本 - 执行前端和后端的所有测试

.DESCRIPTION
    提供统一的测试执行接口，支持单元测试、集成测试、E2E测试等
    包含测试覆盖率报告和详细的测试结果分析

.PARAMETER Target
    测试目标: frontend, backend, all (默认)

.PARAMETER Type
    测试类型: unit, integration, e2e, all (默认)

.PARAMETER Coverage
    生成测试覆盖率报告

.PARAMETER Watch
    监听模式，文件变化时自动重新运行测试

.PARAMETER Parallel
    并行运行测试

.PARAMETER Verbose
    详细输出模式

.EXAMPLE
    .\run-tests.ps1
    运行所有测试

.EXAMPLE
    .\run-tests.ps1 -Target backend -Coverage
    运行后端测试并生成覆盖率报告

.EXAMPLE
    .\run-tests.ps1 -Type unit -Parallel
    并行运行单元测试

.NOTES
    文件名: run-tests.ps1
    作者: 技术团队
    版本: 1.0.0
    创建日期: 2025-12-10
#>

[CmdletBinding()]
param(
    [ValidateSet("frontend", "backend", "all")]
    [string]$Target = "all",
    
    [ValidateSet("unit", "integration", "e2e", "all")]
    [string]$Type = "all",
    
    [switch]$Coverage,
    
    [switch]$Watch,
    
    [switch]$Parallel,
    
    [switch]$Verbose
)

# 设置错误处理
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# 全局变量
$script:TestResults = @()
$script:TotalTests = 0
$script:PassedTests = 0
$script:FailedTests = 0
$script:SkippedTests = 0

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

# 执行测试命令
function Invoke-TestCommand {
    param(
        [string]$Command,
        [string]$Description,
        [string]$WorkingDirectory = $PWD,
        [string]$Category = "General",
        [switch]$AllowFailure
    )
    
    Write-ColorOutput "🧪 $Description..." "Cyan"
    
    try {
        $originalLocation = Get-Location
        Set-Location $WorkingDirectory
        
        $startTime = Get-Date
        
        if ($Verbose) {
            $output = Invoke-Expression $Command
        } else {
            $output = Invoke-Expression $Command 2>&1
        }
        
        $endTime = Get-Date
        $duration = $endTime - $startTime
        $exitCode = $LASTEXITCODE
        
        $result = @{
            Category = $Category
            Description = $Description
            Command = $Command
            ExitCode = $exitCode
            Output = $output -join "`n"
            Duration = $duration
            Status = "Unknown"
            TestCount = 0
            PassedCount = 0
            FailedCount = 0
            SkippedCount = 0
        }
        
        # 解析测试结果
        if ($output) {
            $result = Parse-TestOutput -Output $output -Result $result
        }
        
        # 判断测试状态
        if ($exitCode -eq 0) {
            $result.Status = "Pass"
            Write-ColorOutput "✅ $Description 通过 ($($result.TestCount) 个测试, 耗时 $($duration.TotalSeconds.ToString('F2'))s)" "Green"
            $script:PassedTests += $result.PassedCount
        } else {
            $result.Status = "Fail"
            Write-ColorOutput "❌ $Description 失败 ($($result.FailedCount) 个失败, 耗时 $($duration.TotalSeconds.ToString('F2'))s)" "Red"
            $script:FailedTests += $result.FailedCount
            
            if (-not $AllowFailure) {
                # 显示失败详情
                if ($output) {
                    Write-ColorOutput "失败详情:" "Gray"
                    $output | Select-Object -Last 20 | ForEach-Object { 
                        if ($_ -match "(FAIL|ERROR|Failed)") {
                            Write-ColorOutput "  $_" "Red"
                        } else {
                            Write-ColorOutput "  $_" "Gray"
                        }
                    }
                }
            }
        }
        
        $script:TotalTests += $result.TestCount
        $script:SkippedTests += $result.SkippedCount
        $script:TestResults += $result
        
        return $result
        
    }
    catch {
        $result = @{
            Category = $Category
            Description = $Description
            Command = $Command
            ExitCode = -1
            Output = $_.Exception.Message
            Duration = New-TimeSpan
            Status = "Error"
            TestCount = 0
            PassedCount = 0
            FailedCount = 1
            SkippedCount = 0
        }
        
        $script:FailedTests += 1
        $script:TestResults += $result
        
        Write-ColorOutput "❌ $Description 执行失败: $($_.Exception.Message)" "Red"
        
        if (-not $AllowFailure) {
            throw
        }
        
        return $result
    }
    finally {
        Set-Location $originalLocation
    }
}

# 解析测试输出
function Parse-TestOutput {
    param(
        [string[]]$Output,
        [hashtable]$Result
    )
    
    $outputText = $Output -join "`n"
    
    # Jest/Vitest 输出解析
    if ($outputText -match "Tests:\s+(\d+)\s+passed.*?(\d+)\s+total") {
        $Result.PassedCount = [int]$Matches[1]
        $Result.TestCount = [int]$Matches[2]
        $Result.FailedCount = $Result.TestCount - $Result.PassedCount
    }
    
    # Pytest 输出解析
    if ($outputText -match "(\d+)\s+passed.*?(\d+)\s+failed.*?(\d+)\s+skipped") {
        $Result.PassedCount = [int]$Matches[1]
        $Result.FailedCount = [int]$Matches[2]
        $Result.SkippedCount = [int]$Matches[3]
        $Result.TestCount = $Result.PassedCount + $Result.FailedCount + $Result.SkippedCount
    } elseif ($outputText -match "(\d+)\s+passed") {
        $Result.PassedCount = [int]$Matches[1]
        $Result.TestCount = $Result.PassedCount
        $Result.FailedCount = 0
    }
    
    # 通用测试数量解析
    if ($Result.TestCount -eq 0) {
        $testMatches = [regex]::Matches($outputText, "✓|✗|PASS|FAIL")
        $Result.TestCount = $testMatches.Count
        if ($Result.TestCount -gt 0 -and $Result.PassedCount -eq 0) {
            $Result.PassedCount = $Result.TestCount
        }
    }
    
    return $Result
}

# 运行后端测试
function Invoke-BackendTests {
    Write-ColorOutput "`n?? 后端测试执行..." "Blue"

    $backendDir = "backend-go"

    # 检查后端目录
    if (-not (Test-Path $backendDir)) {
        Write-ColorOutput "?? 后端目录不存在，跳过后端测试" "Yellow"
        return
    }

    if ($Type -ne "all") {
        Write-ColorOutput "?? Go 后端暂不区分测试类型，已按全量测试执行" "Yellow"
    }

    if ($Watch) {
        Write-ColorOutput "?? Go 后端暂不支持 Watch 模式，请使用外部工具" "Yellow"
    }

    if ($Parallel) {
        Write-ColorOutput "?? Go 后端并行参数由 go test 默认管理" "Yellow"
    }

    $testCommand = "go test ./..."
    if ($Verbose) { $testCommand += " -v" }
    if ($Coverage) { $testCommand += " -coverprofile=coverage.out" }

    Invoke-TestCommand $testCommand "后端测试" $backendDir "Backend"

    if ($Coverage -and (Test-Path "$backendDir\coverage.out")) {
        Write-ColorOutput "?? 覆盖率文件: $backendDir\coverage.out" "Cyan"
        Write-ColorOutput "   可使用: go tool cover -html=coverage.out" "Gray"
    }
}

# 运行前端测试
function Invoke-FrontendTests {
    Write-ColorOutput "`n🎨 前端测试执行..." "Blue"
    
    $frontendDir = "frontend"
    
    # 检查前端目录
    if (-not (Test-Path $frontendDir)) {
        Write-ColorOutput "⚠️ 前端目录不存在，跳过前端测试" "Yellow"
        return
    }
    
    # 检查 node_modules
    if (-not (Test-Path "$frontendDir\node_modules")) {
        Write-ColorOutput "⚠️ 前端依赖未安装，请先运行 pnpm install" "Yellow"
        return
    }
    
    # 单元测试和集成测试
    if ($Type -in @("unit", "integration", "all")) {
        $testArgs = @()
        
        if ($Watch) { 
            $testCommand = "pnpm test"
        } else { 
            $testCommand = "pnpm test --run"
            if ($Coverage) { $testArgs += "--coverage" }
            if ($Verbose) { $testArgs += "--reporter=verbose" }
        }
        
        if ($testArgs.Count -gt 0) {
            $testCommand += " $($testArgs -join ' ')"
        }
        
        Invoke-TestCommand $testCommand "前端单元测试" $frontendDir "Frontend"
        
        # 显示覆盖率报告
        if ($Coverage -and (Test-Path "$frontendDir\coverage\index.html")) {
            Write-ColorOutput "📊 HTML 覆盖率报告: $frontendDir\coverage\index.html" "Cyan"
        }
    }
    
    # E2E 测试
    if ($Type -in @("e2e", "all") -and (Test-Path "$frontendDir\e2e")) {
        try {
            $e2eCommand = if ($Watch) { "pnpm test:e2e --ui" } else { "pnpm test:e2e" }
            Invoke-TestCommand $e2eCommand "前端 E2E 测试" $frontendDir "Frontend" -AllowFailure
        }
        catch {
            Write-ColorOutput "⚠️ E2E 测试配置不存在，跳过 E2E 测试" "Yellow"
        }
    }
    
    # 组件测试
    if (Test-Path "$frontendDir\src\components\__tests__") {
        try {
            Invoke-TestCommand "pnpm test:components --run" "前端组件测试" $frontendDir "Frontend" -AllowFailure
        }
        catch {
            Write-ColorOutput "⚠️ 组件测试脚本不存在，跳过组件测试" "Yellow"
        }
    }
    
    # 可访问性测试
    try {
        Invoke-TestCommand "pnpm test:a11y --run" "可访问性测试" $frontendDir "Frontend" -AllowFailure
    }
    catch {
        Write-ColorOutput "⚠️ 可访问性测试脚本不存在，跳过" "Yellow"
    }
}

# 运行集成测试
function Invoke-IntegrationTests {
    Write-ColorOutput "`n?? 集成测试执行..." "Blue"

    $backendDir = "backend-go"
    $integrationDir = "tests\integration"
    $backendIntegrationDir = Join-Path $backendDir "tests\integration"

    if (Test-Path $integrationDir -or Test-Path $backendIntegrationDir) {
        Write-ColorOutput "?? 运行系统集成测试..." "Cyan"

        # 确保数据库服务运行
        try {
            $dbStatus = docker-compose ps --services --filter "status=running" 2>$null
            if (-not $dbStatus) {
                Write-ColorOutput "?? 数据库服务未运行，启动测试数据库..." "Yellow"
                & ".\scripts\database\db-manage.ps1" start
                Start-Sleep -Seconds 10
            }
        }
        catch {
            Write-ColorOutput "?? 无法检查数据库状态，继续执行测试" "Yellow"
        }

        if (Test-Path $backendDir) {
            Invoke-TestCommand "go test ./..." "后端集成测试" $backendDir "Integration" -AllowFailure
        } else {
            Write-ColorOutput "?? backend-go 目录不存在，跳过集成测试" "Yellow"
        }
    } else {
        Write-ColorOutput "?? 集成测试目录不存在，跳过集成测试" "Yellow"
    }
}

# 生成测试报告
function New-TestReport {
    Write-ColorOutput "`n📊 测试执行报告" "Blue"
    Write-ColorOutput "$('=' * 60)" "Cyan"
    
    # 按类别统计
    $categories = $script:TestResults | Group-Object Category
    
    foreach ($category in $categories) {
        Write-ColorOutput "`n📂 $($category.Name) 测试结果:" "Blue"
        
        $passed = ($category.Group | Where-Object { $_.Status -eq "Pass" }).Count
        $failed = ($category.Group | Where-Object { $_.Status -eq "Fail" }).Count
        $errors = ($category.Group | Where-Object { $_.Status -eq "Error" }).Count
        
        Write-ColorOutput "  ✅ 通过: $passed" "Green"
        if ($failed -gt 0) { Write-ColorOutput "  ❌ 失败: $failed" "Red" }
        if ($errors -gt 0) { Write-ColorOutput "  💥 错误: $errors" "Red" }
        
        # 显示执行时间
        $totalDuration = ($category.Group | Measure-Object -Property { $_.Duration.TotalSeconds } -Sum).Sum
        Write-ColorOutput "  ⏱️ 总耗时: $($totalDuration.ToString('F2'))s" "Gray"
        
        # 显示失败的测试详情
        $failedTests = $category.Group | Where-Object { $_.Status -in @("Fail", "Error") }
        foreach ($test in $failedTests) {
            Write-ColorOutput "    ❌ $($test.Description)" "Red"
        }
    }
    
    # 总体统计
    Write-ColorOutput "`n📈 总体统计:" "Blue"
    Write-ColorOutput "  🧪 总测试数: $script:TotalTests" "White"
    Write-ColorOutput "  ✅ 通过: $script:PassedTests" "Green"
    Write-ColorOutput "  ❌ 失败: $script:FailedTests" $(if ($script:FailedTests -eq 0) { "Green" } else { "Red" })
    Write-ColorOutput "  ⏭️ 跳过: $script:SkippedTests" "Yellow"
    
    # 成功率计算
    $successRate = if ($script:TotalTests -gt 0) { 
        [math]::Round(($script:PassedTests / $script:TotalTests) * 100, 1) 
    } else { 
        0 
    }
    
    Write-ColorOutput "  📊 成功率: $successRate%" $(if ($successRate -ge 90) { "Green" } elseif ($successRate -ge 70) { "Yellow" } else { "Red" })
    
    # 总执行时间
    $totalTime = ($script:TestResults | Measure-Object -Property { $_.Duration.TotalSeconds } -Sum).Sum
    Write-ColorOutput "  ⏱️ 总耗时: $($totalTime.ToString('F2'))s" "Gray"
    
    # 测试质量评级
    Write-ColorOutput "`n🏆 测试质量评级:" "Blue"
    $grade = switch ($successRate) {
        { $_ -eq 100 } { @{ Grade = "A+"; Color = "Green"; Description = "完美" } }
        { $_ -ge 95 } { @{ Grade = "A"; Color = "Green"; Description = "优秀" } }
        { $_ -ge 85 } { @{ Grade = "B"; Color = "Yellow"; Description = "良好" } }
        { $_ -ge 70 } { @{ Grade = "C"; Color = "Yellow"; Description = "一般" } }
        default { @{ Grade = "D"; Color = "Red"; Description = "需改进" } }
    }
    
    Write-ColorOutput "  🎯 评级: $($grade.Grade) ($($grade.Description))" $grade.Color
    
    # 覆盖率信息
    if ($Coverage) {
        Write-ColorOutput "`n📋 覆盖率报告:" "Blue"
        if (Test-Path "backend-go\\coverage.out") {
            Write-ColorOutput "  ?? 后端: backend-go\\coverage.out" "Cyan"
            Write-ColorOutput "     go tool cover -html=coverage.out" "Gray"
        }
        if (Test-Path "frontend\coverage\index.html") {
            Write-ColorOutput "  🎨 前端: frontend\coverage\index.html" "Cyan"
        }
    }
    
    # 建议
    Write-ColorOutput "`n💡 改进建议:" "Blue"
    if ($script:FailedTests -eq 0) {
        Write-ColorOutput "  🎉 所有测试通过，代码质量优秀！" "Green"
    } else {
        Write-ColorOutput "  🔧 修复失败的测试用例" "Yellow"
        Write-ColorOutput "  📝 为新功能添加测试用例" "Yellow"
        Write-ColorOutput "  📊 提高测试覆盖率到 80% 以上" "Yellow"
    }
}

# 主执行函数
function Main {
    try {
        Write-ColorOutput "🧪 统一测试运行工具" "Green"
        Write-ColorOutput "测试目标: $Target" "Cyan"
        Write-ColorOutput "测试类型: $Type" "Cyan"
        if ($Coverage) { Write-ColorOutput "生成覆盖率报告: 是" "Yellow" }
        if ($Watch) { Write-ColorOutput "监听模式: 是" "Yellow" }
        if ($Parallel) { Write-ColorOutput "并行执行: 是" "Yellow" }
        Write-ColorOutput "$('=' * 60)" "Cyan"
        
        # 根据目标执行测试
        switch ($Target) {
            "backend" {
                Invoke-BackendTests
            }
            "frontend" {
                Invoke-FrontendTests
            }
            "all" {
                Invoke-BackendTests
                Invoke-FrontendTests
                
                # 如果是完整测试，也运行集成测试
                if ($Type -in @("integration", "all")) {
                    Invoke-IntegrationTests
                }
            }
        }
        
        # 生成测试报告
        if (-not $Watch) {
            New-TestReport
        }
        
        # 根据结果决定退出代码
        if ($script:FailedTests -gt 0) {
            Write-ColorOutput "`n❌ 测试执行失败，请修复失败的测试用例" "Red"
            exit 1
        } else {
            Write-ColorOutput "`n✅ 所有测试执行成功！" "Green"
            exit 0
        }
        
    }
    catch {
        Write-ColorOutput "`n❌ 测试执行过程中发生错误: $($_.Exception.Message)" "Red"
        exit 1
    }
}

# 执行主函数
Main



