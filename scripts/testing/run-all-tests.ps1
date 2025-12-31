# 企业级网络设备巡检系统 - 统一测试调度脚本
# 支持应用层测试和基础设施层健康检查的统一管理

param(
    [switch]$AppLayer,              # 运行Python应用层测试
    [switch]$Infrastructure,        # 运行基础设施健康检查
    [switch]$Full,                  # 运行完整测试套件
    [switch]$DatabaseOnly,          # 仅运行数据库测试
    [switch]$RedisOnly,            # 仅运行Redis缓存测试
    [switch]$InfluxDBOnly,         # 仅运行InfluxDB测试
    [switch]$EscalationOnly,       # 仅运行告警升级测试
    [switch]$WebSocketOnly,        # 仅运行WebSocket测试
    [switch]$APIOnly,              # 仅运行API服务测试
    [switch]$Parallel,             # 并行运行测试（适用于不冲突的测试）
    [switch]$Verbose,              # 详细输出模式
    [switch]$Help                  # 显示帮助信息
)

$ErrorActionPreference = "Stop"

# 全局变量
$script:ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:ScriptsRoot = Split-Path -Parent $script:ScriptPath
$script:ProjectRoot = Split-Path -Parent $script:ScriptsRoot
$script:BackendPath = Join-Path $script:ProjectRoot "backend"
$script:TestsPath = Join-Path $script:BackendPath "tests"

# 测试结果统计
$script:TestResults = @{
    AppLayerTests = @()
    InfrastructureChecks = @()
    TotalPassed = 0
    TotalFailed = 0
    StartTime = Get-Date
}

# 日志函数
function Write-LogInfo {
    param([string]$Message)
    Write-Host "[信息] $Message" -ForegroundColor Blue
}

function Write-LogSuccess {
    param([string]$Message)
    Write-Host "[成功] $Message" -ForegroundColor Green
}

function Write-LogWarning {
    param([string]$Message)
    Write-Host "[警告] $Message" -ForegroundColor Yellow
}

function Write-LogError {
    param([string]$Message)
    Write-Host "[错误] $Message" -ForegroundColor Red
}

function Write-LogStep {
    param([string]$Message)
    Write-Host "[步骤] $Message" -ForegroundColor Cyan
}

# 显示帮助信息
function Show-Help {
    Write-Host "企业级网络设备巡检系统 - 统一测试调度脚本" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "用法:"
    Write-Host "    .\run-all-tests.ps1 [选项]"
    Write-Host ""
    Write-Host "主要选项:"
    Write-Host "    -AppLayer           运行Python应用层集成测试"
    Write-Host "    -Infrastructure     运行基础设施健康检查"
    Write-Host "    -Full              运行完整测试套件（应用层+基础设施层）"
    Write-Host ""
    Write-Host "单项测试选项:"
    Write-Host "    -DatabaseOnly       仅运行数据库连接测试"
    Write-Host "    -RedisOnly         仅运行Redis缓存测试"
    Write-Host "    -InfluxDBOnly      仅运行InfluxDB测试"
    Write-Host "    -EscalationOnly    仅运行告警升级测试"
    Write-Host "    -WebSocketOnly     仅运行WebSocket通信测试"
    Write-Host "    -APIOnly           仅运行API服务测试"
    Write-Host ""
    Write-Host "执行选项:"
    Write-Host "    -Parallel          并行运行兼容的测试（提高速度）"
    Write-Host "    -Verbose           详细输出模式"
    Write-Host "    -Help              显示此帮助信息"
    Write-Host ""
    Write-Host "测试层级说明:"
    Write-Host "    📋 应用层测试    - 验证业务逻辑、ORM、缓存服务等应用功能"
    Write-Host "    🔧 基础设施检查   - 验证Docker容器、端口连通性、系统状态等"
    Write-Host ""
    Write-Host "示例:"
    Write-Host "    .\run-all-tests.ps1 -Full                    # 运行完整测试套件"
    Write-Host "    .\run-all-tests.ps1 -AppLayer -Verbose       # 运行应用层测试（详细模式）"
    Write-Host "    .\run-all-tests.ps1 -Infrastructure          # 仅运行基础设施检查"
    Write-Host "    .\run-all-tests.ps1 -DatabaseOnly            # 仅测试数据库连接"
    Write-Host "    .\run-all-tests.ps1 -EscalationOnly          # 仅测试告警升级功能"
    Write-Host "    .\run-all-tests.ps1 -WebSocketOnly           # 仅测试WebSocket通信"
    Write-Host "    .\run-all-tests.ps1 -AppLayer -Parallel      # 并行运行应用层测试"
    Write-Host ""
}

# 检查环境依赖
function Test-Environment {
    Write-LogStep "检查测试环境依赖..."
    
    $missingTools = @()
    
    # 检查Python和uv（应用层测试需要）
    if ($AppLayer -or $Full -or $DatabaseOnly -or $RedisOnly -or $InfluxDBOnly) {
        if (-not (Get-Command "python" -ErrorAction SilentlyContinue)) {
            $missingTools += "Python"
        }
        if (-not (Get-Command "uv" -ErrorAction SilentlyContinue)) {
            $missingTools += "uv"
        }
    }
    
    # 检查Docker（基础设施检查需要）
    if ($Infrastructure -or $Full) {
        if (-not (Get-Command "docker" -ErrorAction SilentlyContinue)) {
            $missingTools += "Docker"
        }
    }
    
    # 检查测试文件是否存在
    if ($AppLayer -or $Full -or $DatabaseOnly -or $RedisOnly -or $InfluxDBOnly) {
        if (-not (Test-Path $script:TestsPath)) {
            Write-LogError "测试目录不存在: $script:TestsPath"
            throw "应用层测试文件缺失"
        }
    }
    
    if ($missingTools.Count -gt 0) {
        Write-LogError "缺少必需工具: $($missingTools -join ', ')"
        throw "环境依赖检查失败"
    }
    
    Write-LogSuccess "环境依赖检查通过"
}

# 运行Python应用层测试
function Invoke-AppLayerTests {
    param([array]$TestFiles = @())
    
    Write-LogStep "运行Python应用层测试..."
    
    Push-Location $script:BackendPath
    try {
        # 如果没有指定特定测试文件，运行所有测试
        if ($TestFiles.Count -eq 0) {
            $TestFiles = Get-ChildItem $script:TestsPath -Filter "test_*.py" | ForEach-Object { $_.Name }
        }
        
        foreach ($testFile in $TestFiles) {
            $testPath = Join-Path "tests" $testFile
            if (-not (Test-Path $testPath)) {
                Write-LogWarning "测试文件不存在: $testPath"
                continue
            }
            
            Write-LogInfo "执行测试: $testFile"
            
            try {
                if ($Parallel -and $TestFiles.Count -gt 1) {
                    # 并行执行（后台作业）
                    $job = Start-Job -ScriptBlock {
                        param($BackendPath, $TestPath)
                        Set-Location $BackendPath
                        uv run python $TestPath
                    } -ArgumentList $script:BackendPath, $testPath
                    
                    $script:TestResults.AppLayerTests += @{
                        Name = $testFile
                        Job = $job
                        Status = "Running"
                    }
                } else {
                    # 串行执行
                    $result = uv run python $testPath
                    if ($LASTEXITCODE -eq 0) {
                        Write-LogSuccess "$testFile 测试通过"
                        $script:TestResults.TotalPassed++
                        $script:TestResults.AppLayerTests += @{
                            Name = $testFile
                            Status = "Passed"
                            Output = $result
                        }
                    } else {
                        Write-LogError "$testFile 测试失败"
                        $script:TestResults.TotalFailed++
                        $script:TestResults.AppLayerTests += @{
                            Name = $testFile
                            Status = "Failed"
                            Output = $result
                        }
                    }
                }
                
                if ($Verbose) {
                    Write-LogInfo "测试输出: $result"
                }
                
            } catch {
                Write-LogError "$testFile 测试异常: $($_.Exception.Message)"
                $script:TestResults.TotalFailed++
                $script:TestResults.AppLayerTests += @{
                    Name = $testFile
                    Status = "Failed"
                    Error = $_.Exception.Message
                }
            }
        }
        
        # 等待并行作业完成
        if ($Parallel) {
            Wait-ParallelJobs
        }
        
    } finally {
        Pop-Location
    }
}

# 等待并行作业完成
function Wait-ParallelJobs {
    Write-LogInfo "等待并行测试完成..."
    
    $runningJobs = $script:TestResults.AppLayerTests | Where-Object { $_.Job -and $_.Status -eq "Running" }
    
    foreach ($test in $runningJobs) {
        try {
            $jobResult = Receive-Job -Job $test.Job -Wait
            if ($test.Job.State -eq "Completed") {
                Write-LogSuccess "$($test.Name) 并行测试通过"
                $script:TestResults.TotalPassed++
                $test.Status = "Passed"
                $test.Output = $jobResult
            } else {
                Write-LogError "$($test.Name) 并行测试失败"
                $script:TestResults.TotalFailed++
                $test.Status = "Failed"
                $test.Output = $jobResult
            }
        } catch {
            Write-LogError "$($test.Name) 并行测试异常: $($_.Exception.Message)"
            $script:TestResults.TotalFailed++
            $test.Status = "Failed"
            $test.Error = $_.Exception.Message
        } finally {
            Remove-Job -Job $test.Job -Force
        }
    }
}

# 运行基础设施健康检查
function Invoke-InfrastructureCheck {
    Write-LogStep "运行基础设施健康检查..."
    
    $healthCheckScript = Join-Path $script:ScriptPath "db-health-check.ps1"
    
    if (-not (Test-Path $healthCheckScript)) {
        Write-LogError "健康检查脚本不存在: $healthCheckScript"
        $script:TestResults.TotalFailed++
        return
    }
    
    try {
        Write-LogInfo "执行健康检查脚本..."
        $result = & $healthCheckScript
        
        if ($LASTEXITCODE -eq 0) {
            Write-LogSuccess "基础设施健康检查通过"
            $script:TestResults.TotalPassed++
            $script:TestResults.InfrastructureChecks += @{
                Name = "Database Health Check"
                Status = "Passed"
                Output = $result
            }
        } else {
            Write-LogError "基础设施健康检查失败"
            $script:TestResults.TotalFailed++
            $script:TestResults.InfrastructureChecks += @{
                Name = "Database Health Check"
                Status = "Failed"
                Output = $result
            }
        }
        
        if ($Verbose) {
            Write-LogInfo "健康检查输出: $result"
        }
        
    } catch {
        Write-LogError "基础设施健康检查异常: $($_.Exception.Message)"
        $script:TestResults.TotalFailed++
        $script:TestResults.InfrastructureChecks += @{
            Name = "Database Health Check"
            Status = "Failed"
            Error = $_.Exception.Message
        }
    }
}

# 显示测试结果汇总
function Show-TestSummary {
    $duration = (Get-Date) - $script:TestResults.StartTime
    
    Write-Host ""
    Write-LogInfo "====== 测试结果汇总 ======"
    Write-Host "执行时间: $($duration.ToString('mm\:ss\.ff'))" -ForegroundColor Yellow
    Write-Host "总测试数: $($script:TestResults.TotalPassed + $script:TestResults.TotalFailed)"
    Write-Host "通过: " -NoNewline
    Write-Host "$($script:TestResults.TotalPassed)" -ForegroundColor Green
    Write-Host "失败: " -NoNewline
    Write-Host "$($script:TestResults.TotalFailed)" -ForegroundColor Red
    
    # 应用层测试结果
    if ($script:TestResults.AppLayerTests.Count -gt 0) {
        Write-Host ""
        Write-LogInfo "📋 应用层测试结果:"
        foreach ($test in $script:TestResults.AppLayerTests) {
            $status = if ($test.Status -eq "Passed") { "✅" } else { "❌" }
            Write-Host "  $status $($test.Name)"
            if ($Verbose -and $test.Error) {
                Write-Host "     错误: $($test.Error)" -ForegroundColor Red
            }
        }
    }
    
    # 基础设施检查结果
    if ($script:TestResults.InfrastructureChecks.Count -gt 0) {
        Write-Host ""
        Write-LogInfo "🔧 基础设施检查结果:"
        foreach ($check in $script:TestResults.InfrastructureChecks) {
            $status = if ($check.Status -eq "Passed") { "✅" } else { "❌" }
            Write-Host "  $status $($check.Name)"
            if ($Verbose -and $check.Error) {
                Write-Host "     错误: $($check.Error)" -ForegroundColor Red
            }
        }
    }
    
    Write-Host ""
    if ($script:TestResults.TotalFailed -eq 0) {
        Write-LogSuccess "🎉 所有测试都通过了！"
        exit 0
    } else {
        Write-LogError "❌ $($script:TestResults.TotalFailed) 项测试失败"
        exit 1
    }
}

# 主函数
function Main {
    try {
        # 显示标题
        Write-Host ""
        Write-Host "🚀 企业级网络设备巡检系统 - 统一测试调度" -ForegroundColor Cyan
        Write-Host "================================================" -ForegroundColor Cyan
        Write-Host ""
        
        # 检查参数
        $hasParams = $AppLayer -or $Infrastructure -or $Full -or $DatabaseOnly -or $RedisOnly -or $InfluxDBOnly -or $EscalationOnly -or $WebSocketOnly -or $APIOnly -or $Help
        
        if (-not $hasParams) {
            Write-LogWarning "未指定测试选项，显示帮助信息"
            Show-Help
            return
        }
        
        if ($Help) {
            Show-Help
            return
        }
        
        # 检查环境依赖
        Test-Environment
        
        # 执行测试
        if ($Full) {
            Write-LogInfo "运行完整测试套件..."
            Invoke-AppLayerTests
            Invoke-InfrastructureCheck
        } elseif ($AppLayer) {
            Invoke-AppLayerTests
        } elseif ($Infrastructure) {
            Invoke-InfrastructureCheck
        } elseif ($DatabaseOnly) {
            Invoke-AppLayerTests -TestFiles @("test_db.py")
        } elseif ($RedisOnly) {
            Invoke-AppLayerTests -TestFiles @("test_redis_cache.py")
        } elseif ($InfluxDBOnly) {
            # 假设有test_influxdb.py文件
            if (Test-Path (Join-Path $script:TestsPath "test_influxdb.py")) {
                Invoke-AppLayerTests -TestFiles @("test_influxdb.py")
            } else {
                Write-LogWarning "InfluxDB测试文件不存在，跳过"
            }
        } elseif ($EscalationOnly) {
            if (Test-Path (Join-Path $script:TestsPath "test_escalation.py")) {
                Invoke-AppLayerTests -TestFiles @("test_escalation.py")
            } else {
                Write-LogWarning "告警升级测试文件不存在，跳过"
            }
        } elseif ($WebSocketOnly) {
            if (Test-Path (Join-Path $script:TestsPath "test_websocket.py")) {
                Invoke-AppLayerTests -TestFiles @("test_websocket.py")
            } else {
                Write-LogWarning "WebSocket测试文件不存在，跳过"
            }
        } elseif ($APIOnly) {
            if (Test-Path (Join-Path $script:TestsPath "test_main.py")) {
                Invoke-AppLayerTests -TestFiles @("test_main.py")
            } else {
                Write-LogWarning "API服务测试文件不存在，跳过"
            }
        }
        
        # 显示结果汇总
        Show-TestSummary
        
    } catch {
        Write-LogError "测试执行失败: $($_.Exception.Message)"
        Write-Host "错误详情: $($_.ScriptStackTrace)" -ForegroundColor Red
        exit 1
    }
}

# 执行主函数
Main