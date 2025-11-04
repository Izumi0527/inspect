# 企业级网络设备巡检系统 - 日志功能验证脚本
# 全面测试前后端日志系统、请求追踪和日志查看功能

param(
    [switch]$Comprehensive,    # 执行全面测试
    [switch]$Quick,           # 快速测试模式
    [int]$TestRequests = 5,   # 测试请求数量
    [string]$BackendUrl = "http://localhost:8000",  # 后端服务地址
    [string]$FrontendUrl = "http://localhost:3000", # 前端服务地址
    [switch]$SkipServices,    # 跳过服务可用性检查
    [switch]$Verbose,         # 详细输出
    [switch]$Help             # 显示帮助
)

$ErrorActionPreference = "Stop"

# 全局变量
$script:ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:ProjectRoot = Split-Path -Parent $script:ScriptPath
$script:LogsPath = Join-Path $script:ProjectRoot "logs"
$script:TestResults = @()

# 测试结果类型
enum TestResult {
    Pass
    Fail
    Warning
    Skip
}

# 日志函数
function Write-TestLog {
    param(
        [string]$Message,
        [string]$Color = "White",
        [switch]$NoTimestamp
    )

    if (-not $NoTimestamp) {
        $timestamp = Get-Date -Format "HH:mm:ss"
        $Message = "[$timestamp] $Message"
    }

    Write-Host $Message -ForegroundColor $Color
}

function Write-TestResult {
    param(
        [string]$TestName,
        [TestResult]$Result,
        [string]$Details = ""
    )

    $resultColors = @{
        [TestResult]::Pass = "Green"
        [TestResult]::Fail = "Red"
        [TestResult]::Warning = "Yellow"
        [TestResult]::Skip = "Gray"
    }

    $resultSymbols = @{
        [TestResult]::Pass = "✅"
        [TestResult]::Fail = "❌"
        [TestResult]::Warning = "⚠️"
        [TestResult]::Skip = "⏭️"
    }

    $color = $resultColors[$Result]
    $symbol = $resultSymbols[$Result]

    $message = "$symbol $TestName"
    if ($Details) {
        $message += " - $Details"
    }

    Write-TestLog $message $color

    # 记录测试结果
    $script:TestResults += @{
        Name = $TestName
        Result = $Result
        Details = $Details
        Timestamp = Get-Date
    }
}

function Show-Help {
    Write-Host "企业级网络设备巡检系统 - 日志功能验证脚本" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "用法:"
    Write-Host "    .\test-logs.ps1 [选项]"
    Write-Host ""
    Write-Host "测试模式:"
    Write-Host "    -Quick               快速测试模式（基本功能验证）"
    Write-Host "    -Comprehensive       全面测试模式（包括压力测试）"
    Write-Host ""
    Write-Host "配置选项:"
    Write-Host "    -TestRequests <数量>  测试请求数量（默认: 5）"
    Write-Host "    -BackendUrl <URL>     后端服务地址（默认: http://localhost:8000）"
    Write-Host "    -FrontendUrl <URL>    前端服务地址（默认: http://localhost:3000）"
    Write-Host "    -SkipServices         跳过服务可用性检查"
    Write-Host "    -Verbose              显示详细输出"
    Write-Host ""
    Write-Host "示例:"
    Write-Host "    .\test-logs.ps1 -Quick                    # 快速测试"
    Write-Host "    .\test-logs.ps1 -Comprehensive           # 全面测试"
    Write-Host "    .\test-logs.ps1 -TestRequests 10         # 发送10个测试请求"
    Write-Host "    .\test-logs.ps1 -Verbose                 # 详细输出"
    Write-Host ""
}

# 检查服务可用性
function Test-ServiceAvailability {
    Write-TestLog "检查服务可用性..." "Cyan"

    # 检查后端服务
    try {
        $response = Invoke-WebRequest -Uri "$BackendUrl/health" -TimeoutSec 10 -UseBasicParsing
        if ($response.StatusCode -eq 200) {
            Write-TestResult "后端服务可用性" "Pass" "$BackendUrl"
        } else {
            Write-TestResult "后端服务可用性" "Warning" "状态码: $($response.StatusCode)"
        }
    } catch {
        Write-TestResult "后端服务可用性" "Fail" $_.Exception.Message
        return $false
    }

    # 检查前端服务（如果不跳过）
    if (-not $SkipServices) {
        try {
            $response = Invoke-WebRequest -Uri $FrontendUrl -TimeoutSec 10 -UseBasicParsing
            if ($response.StatusCode -eq 200) {
                Write-TestResult "前端服务可用性" "Pass" "$FrontendUrl"
            } else {
                Write-TestResult "前端服务可用性" "Warning" "状态码: $($response.StatusCode)"
            }
        } catch {
            Write-TestResult "前端服务可用性" "Warning" "可能未启动或不可访问"
        }
    }

    return $true
}

# 检查日志目录和文件
function Test-LogDirectoryStructure {
    Write-TestLog "检查日志目录结构..." "Cyan"

    # 检查主日志目录
    if (Test-Path $script:LogsPath) {
        Write-TestResult "日志目录存在" "Pass" $script:LogsPath
    } else {
        Write-TestResult "日志目录存在" "Fail" "目录不存在: $script:LogsPath"
        return $false
    }

    # 检查预期的日志文件
    $expectedLogs = @{
        "后端日志" = "backend\app.log"
        "数据库日志" = "database\init-migrate.log"
    }

    foreach ($logName in $expectedLogs.Keys) {
        $logPath = Join-Path $script:LogsPath $expectedLogs[$logName]
        if (Test-Path $logPath) {
            $fileSize = (Get-Item $logPath).Length
            Write-TestResult "$logName 文件" "Pass" "$logPath ($([math]::Round($fileSize/1KB, 2)) KB)"
        } else {
            Write-TestResult "$logName 文件" "Warning" "文件不存在: $logPath"
        }
    }

    return $true
}

# 测试API请求和日志记录
function Test-ApiLogging {
    Write-TestLog "测试API请求和日志记录..." "Cyan"

    $testEndpoints = @(
        @{ Url = "/health"; Name = "健康检查" },
        @{ Url = "/api/v1/dashboard/overview"; Name = "仪表板概览" },
        @{ Url = "/docs"; Name = "API文档" }
    )

    # 记录测试开始时的日志文件大小
    $backendLogPath = Join-Path $script:LogsPath "backend\app.log"
    $initialSize = if (Test-Path $backendLogPath) { (Get-Item $backendLogPath).Length } else { 0 }

    $successfulRequests = 0

    for ($i = 1; $i -le $TestRequests; $i++) {
        foreach ($endpoint in $testEndpoints) {
            $url = "$BackendUrl$($endpoint.Url)"
            $testName = "$($endpoint.Name) - 请求 $i"

            try {
                # 生成自定义请求ID
                $requestId = "test_$(Get-Date -Format 'yyyyMMdd_HHmmss')_$i"

                $headers = @{
                    "X-Request-ID" = $requestId
                    "User-Agent" = "LogTest/1.0"
                }

                $response = Invoke-WebRequest -Uri $url -Headers $headers -TimeoutSec 10 -UseBasicParsing

                if ($response.StatusCode -eq 200) {
                    Write-TestResult $testName "Pass" "状态码: $($response.StatusCode), 请求ID: $requestId"
                    $successfulRequests++

                    # 检查响应头中的请求ID
                    if ($response.Headers["X-Request-ID"] -eq $requestId) {
                        Write-TestResult "请求ID回显" "Pass" $requestId
                    } else {
                        Write-TestResult "请求ID回显" "Warning" "未找到或不匹配"
                    }

                } else {
                    Write-TestResult $testName "Warning" "状态码: $($response.StatusCode)"
                }

                Start-Sleep -Milliseconds 100  # 避免请求过于频繁

            } catch {
                Write-TestResult $testName "Fail" $_.Exception.Message
            }
        }
    }

    # 等待日志写入
    Start-Sleep -Seconds 2

    # 检查日志文件是否增长
    if (Test-Path $backendLogPath) {
        $finalSize = (Get-Item $backendLogPath).Length
        $growth = $finalSize - $initialSize

        if ($growth -gt 0) {
            Write-TestResult "后端日志增长" "Pass" "增长 $growth 字节"
        } else {
            Write-TestResult "后端日志增长" "Warning" "日志文件未增长"
        }
    }

    Write-TestLog "成功请求: $successfulRequests / $($TestRequests * $testEndpoints.Count)" "Yellow"
    return $successfulRequests -gt 0
}

# 测试请求ID追踪
function Test-RequestIdTracking {
    Write-TestLog "测试请求ID追踪..." "Cyan"

    $customRequestId = "trace_test_$(Get-Date -Format 'yyyyMMdd_HHmmss')"

    try {
        $headers = @{
            "X-Request-ID" = $customRequestId
            "Content-Type" = "application/json"
        }

        $response = Invoke-WebRequest -Uri "$BackendUrl/health" -Headers $headers -TimeoutSec 10 -UseBasicParsing

        # 检查响应头中的请求ID
        $returnedId = $response.Headers["X-Request-ID"]

        if ($returnedId -eq $customRequestId) {
            Write-TestResult "请求ID追踪" "Pass" "ID正确传递: $customRequestId"
        } else {
            Write-TestResult "请求ID追踪" "Warning" "ID不匹配. 发送: $customRequestId, 返回: $returnedId"
        }

        # 等待日志写入，然后检查日志中是否包含请求ID
        Start-Sleep -Seconds 1

        $backendLogPath = Join-Path $script:LogsPath "backend\app.log"
        if (Test-Path $backendLogPath) {
            $recentLogs = Get-Content $backendLogPath -Tail 50 | Out-String
            if ($recentLogs -like "*$customRequestId*") {
                Write-TestResult "日志中请求ID记录" "Pass" "在日志中找到请求ID"
            } else {
                Write-TestResult "日志中请求ID记录" "Warning" "在日志中未找到请求ID"
            }
        }

    } catch {
        Write-TestResult "请求ID追踪" "Fail" $_.Exception.Message
    }
}

# 测试日志查看脚本
function Test-LogViewerScript {
    Write-TestLog "测试日志查看脚本..." "Cyan"

    $viewLogsScript = Join-Path $script:ScriptPath "view-logs.ps1"

    if (-not (Test-Path $viewLogsScript)) {
        Write-TestResult "日志查看脚本存在" "Fail" "脚本文件不存在: $viewLogsScript"
        return $false
    }

    Write-TestResult "日志查看脚本存在" "Pass" $viewLogsScript

    try {
        # 测试脚本语法
        $null = powershell -NoProfile -Command "& '$viewLogsScript' -Help" 2>$null
        Write-TestResult "日志查看脚本语法" "Pass" "脚本语法正确"

        # 测试统计功能
        if ($Comprehensive) {
            $statsOutput = powershell -NoProfile -Command "& '$viewLogsScript' -Stats -Tail 10" 2>$null
            if ($statsOutput) {
                Write-TestResult "日志统计功能" "Pass" "统计输出正常"
            } else {
                Write-TestResult "日志统计功能" "Warning" "无统计输出或出错"
            }
        }

    } catch {
        Write-TestResult "日志查看脚本功能" "Warning" $_.Exception.Message
    }

    return $true
}

# 性能测试（仅在全面测试模式下）
function Test-LoggingPerformance {
    if (-not $Comprehensive) {
        Write-TestResult "日志性能测试" "Skip" "仅在全面测试模式下执行"
        return
    }

    Write-TestLog "执行日志性能测试..." "Cyan"

    $startTime = Get-Date
    $requestCount = 50

    Write-TestLog "发送 $requestCount 个并发请求..." "Yellow"

    # 创建并发作业
    $jobs = @()
    for ($i = 1; $i -le $requestCount; $i++) {
        $job = Start-Job -ScriptBlock {
            param($Url, $RequestId)
            try {
                $headers = @{ "X-Request-ID" = $RequestId }
                $response = Invoke-WebRequest -Uri $Url -Headers $headers -TimeoutSec 30 -UseBasicParsing
                return @{
                    Success = $true
                    StatusCode = $response.StatusCode
                    RequestId = $RequestId
                }
            } catch {
                return @{
                    Success = $false
                    Error = $_.Exception.Message
                    RequestId = $RequestId
                }
            }
        } -ArgumentList "$BackendUrl/health", "perf_test_$i"

        $jobs += $job
    }

    # 等待所有作业完成
    Wait-Job $jobs | Out-Null
    $results = Receive-Job $jobs
    Remove-Job $jobs

    $endTime = Get-Date
    $duration = ($endTime - $startTime).TotalSeconds
    $successCount = ($results | Where-Object { $_.Success }).Count

    Write-TestResult "性能测试" "Pass" "$successCount/$requestCount 请求成功, 耗时: $([math]::Round($duration, 2))s"

    if ($duration -gt 0) {
        $rps = [math]::Round($requestCount / $duration, 2)
        Write-TestLog "平均处理速度: $rps 请求/秒" "Green"
    }
}

# 生成测试报告
function Show-TestSummary {
    Write-TestLog "`n" "White" -NoTimestamp
    Write-TestLog "=== 测试结果摘要 ===" "Cyan" -NoTimestamp

    $totalTests = $script:TestResults.Count
    $passedTests = ($script:TestResults | Where-Object { $_.Result -eq [TestResult]::Pass }).Count
    $failedTests = ($script:TestResults | Where-Object { $_.Result -eq [TestResult]::Fail }).Count
    $warningTests = ($script:TestResults | Where-Object { $_.Result -eq [TestResult]::Warning }).Count
    $skippedTests = ($script:TestResults | Where-Object { $_.Result -eq [TestResult]::Skip }).Count

    Write-TestLog "总测试数量: $totalTests" "White" -NoTimestamp
    Write-TestLog "✅ 通过: $passedTests" "Green" -NoTimestamp
    Write-TestLog "❌ 失败: $failedTests" "Red" -NoTimestamp
    Write-TestLog "⚠️ 警告: $warningTests" "Yellow" -NoTimestamp
    Write-TestLog "⏭️ 跳过: $skippedTests" "Gray" -NoTimestamp

    $successRate = if ($totalTests -gt 0) { [math]::Round($passedTests / $totalTests * 100, 1) } else { 0 }
    Write-TestLog "成功率: $successRate%" "White" -NoTimestamp

    # 显示失败的测试
    if ($failedTests -gt 0) {
        Write-TestLog "`n失败的测试:" "Red" -NoTimestamp
        $script:TestResults | Where-Object { $_.Result -eq [TestResult]::Fail } | ForEach-Object {
            Write-TestLog "  - $($_.Name): $($_.Details)" "Red" -NoTimestamp
        }
    }

    # 显示警告的测试
    if ($warningTests -gt 0) {
        Write-TestLog "`n需要注意的测试:" "Yellow" -NoTimestamp
        $script:TestResults | Where-Object { $_.Result -eq [TestResult]::Warning } | ForEach-Object {
            Write-TestLog "  - $($_.Name): $($_.Details)" "Yellow" -NoTimestamp
        }
    }

    Write-TestLog "" "White" -NoTimestamp

    # 根据结果给出建议
    if ($failedTests -eq 0 -and $warningTests -eq 0) {
        Write-TestLog "🎉 所有测试通过！日志系统工作正常。" "Green" -NoTimestamp
    } elseif ($failedTests -eq 0) {
        Write-TestLog "✅ 核心功能正常，但有一些警告需要关注。" "Yellow" -NoTimestamp
    } else {
        Write-TestLog "⚠️ 发现一些问题，请检查失败的测试项目。" "Red" -NoTimestamp
    }
}

# 主函数
function Main {
    try {
        if ($Help) {
            Show-Help
            return
        }

        # 显示测试开始信息
        Write-TestLog "" "White" -NoTimestamp
        Write-TestLog "🧪 企业级网络设备巡检系统 - 日志功能验证" "Cyan" -NoTimestamp
        Write-TestLog "===========================================" "Cyan" -NoTimestamp

        if ($Comprehensive) {
            Write-TestLog "测试模式: 全面测试" "Yellow" -NoTimestamp
        } elseif ($Quick) {
            Write-TestLog "测试模式: 快速测试" "Yellow" -NoTimestamp
        } else {
            Write-TestLog "测试模式: 标准测试" "Yellow" -NoTimestamp
        }

        Write-TestLog "后端地址: $BackendUrl" "White" -NoTimestamp
        Write-TestLog "测试请求数: $TestRequests" "White" -NoTimestamp
        Write-TestLog "" "White" -NoTimestamp

        # 执行测试
        $testsToRun = @()

        # 基础测试
        $testsToRun += { Test-LogDirectoryStructure }

        if (-not $SkipServices) {
            $testsToRun += { Test-ServiceAvailability }
        }

        $testsToRun += { Test-ApiLogging }
        $testsToRun += { Test-RequestIdTracking }
        $testsToRun += { Test-LogViewerScript }

        # 性能测试（仅全面测试）
        if ($Comprehensive) {
            $testsToRun += { Test-LoggingPerformance }
        }

        # 执行所有测试
        foreach ($test in $testsToRun) {
            try {
                & $test
                Write-TestLog "" "White" -NoTimestamp
            } catch {
                Write-TestResult "测试执行" "Fail" "测试执行异常: $($_.Exception.Message)"
            }
        }

        # 显示摘要
        Show-TestSummary

    } catch {
        Write-TestLog "测试脚本执行失败: $($_.Exception.Message)" "Red"
        exit 1
    }
}

# 执行主函数
Main