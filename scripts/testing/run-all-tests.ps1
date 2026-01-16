# 企业级网络设备巡检系统 - 统一测试调度脚本（Go 版）
# 支持应用层测试与基础设施层健康检查

param(
    [switch]$AppLayer,              # 运行 Go 应用层测试
    [switch]$Infrastructure,        # 运行基础设施健康检查
    [switch]$Full,                  # 运行完整测试套件
    [switch]$DatabaseOnly,          # 仅运行数据库连通性测试
    [switch]$RedisOnly,             # 仅运行 Redis 连通性测试
    [switch]$EscalationOnly,        # 告警升级测试（占位）
    [switch]$WebSocketOnly,         # WebSocket 测试（占位）
    [switch]$APIOnly,               # 仅运行 API 连通性测试
    [switch]$Parallel,              # 并行运行测试（占位）
    [switch]$Verbose,               # 详细输出模式
    [switch]$Help                   # 显示帮助信息
)

$ErrorActionPreference = "Stop"

$script:ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:ScriptsRoot = Split-Path -Parent $script:ScriptPath
$script:ProjectRoot = Split-Path -Parent $script:ScriptsRoot

$script:TestResults = @{
    TotalPassed = 0
    TotalFailed = 0
    StartTime = Get-Date
}

function Write-LogInfo { param([string]$Message) Write-Host "[信息] $Message" -ForegroundColor Blue }
function Write-LogSuccess { param([string]$Message) Write-Host "[成功] $Message" -ForegroundColor Green }
function Write-LogWarning { param([string]$Message) Write-Host "[警告] $Message" -ForegroundColor Yellow }
function Write-LogError { param([string]$Message) Write-Host "[错误] $Message" -ForegroundColor Red }
function Write-LogStep { param([string]$Message) Write-Host "[步骤] $Message" -ForegroundColor Cyan }

function Show-Help {
    Write-Host "企业级网络设备巡检系统 - 统一测试调度脚本（Go 版）" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "用法:"
    Write-Host "    .\run-all-tests.ps1 [选项]"
    Write-Host ""
    Write-Host "主要选项:"
    Write-Host "    -AppLayer           运行 Go 应用层测试"
    Write-Host "    -Infrastructure     运行基础设施健康检查"
    Write-Host "    -Full              运行完整测试套件（应用层+基础设施层）"
    Write-Host ""
    Write-Host "单项测试选项:"
    Write-Host "    -DatabaseOnly       仅运行数据库连接测试"
    Write-Host "    -RedisOnly          仅运行 Redis 缓存测试"
    Write-Host "    -APIOnly            仅运行 API 服务测试"
    Write-Host ""
    Write-Host "执行选项:"
    Write-Host "    -Parallel           并行运行测试（当前占位）"
    Write-Host "    -Verbose            详细输出模式"
    Write-Host "    -Help               显示此帮助信息"
    Write-Host ""
    Write-Host "示例:"
    Write-Host "    .\run-all-tests.ps1 -Full"
    Write-Host "    .\run-all-tests.ps1 -AppLayer -Verbose"
    Write-Host "    .\run-all-tests.ps1 -Infrastructure"
    Write-Host ""
}

function Test-Environment {
    Write-LogStep "检查测试环境依赖..."

    $missingTools = @()

    if ($AppLayer -or $Full) {
        if (-not (Get-Command "go" -ErrorAction SilentlyContinue)) {
            $missingTools += "Go"
        }
    }

    if ($Infrastructure -or $Full) {
        if (-not (Get-Command "docker" -ErrorAction SilentlyContinue)) {
            $missingTools += "Docker"
        }
    }

    if ($missingTools.Count -gt 0) {
        Write-LogError "缺少必需工具: $($missingTools -join ', ')"
        throw "环境依赖检查失败"
    }

    Write-LogSuccess "环境依赖检查通过"
}

function Invoke-AppLayerTests {
    Write-LogStep "运行 Go 应用层测试..."

    $cmd = ".\scripts\testing\run-tests.ps1 -Target backend"
    if ($Verbose) { $cmd += " -Verbose" }

    & $cmd
    if ($LASTEXITCODE -eq 0) {
        Write-LogSuccess "应用层测试通过"
        $script:TestResults.TotalPassed++
    } else {
        Write-LogError "应用层测试失败"
        $script:TestResults.TotalFailed++
    }
}

function Invoke-InfrastructureChecks {
    Write-LogStep "运行基础设施健康检查..."

    & ".\scripts\database\db-health-check.ps1"
    if ($LASTEXITCODE -eq 0) {
        Write-LogSuccess "基础设施检查通过"
        $script:TestResults.TotalPassed++
    } else {
        Write-LogError "基础设施检查失败"
        $script:TestResults.TotalFailed++
    }
}

function Test-Port {
    param(
        [string]$Name,
        [int]$Port
    )

    Write-LogStep "检查 $Name 端口连通性: $Port"
    try {
        $connection = Test-NetConnection -ComputerName "localhost" -Port $Port -WarningAction SilentlyContinue
        if ($connection.TcpTestSucceeded) {
            Write-LogSuccess "$Name 端口连通正常"
            $script:TestResults.TotalPassed++
        } else {
            Write-LogError "$Name 端口不可达"
            $script:TestResults.TotalFailed++
        }
    } catch {
        Write-LogError "$Name 端口检查失败: $($_.Exception.Message)"
        $script:TestResults.TotalFailed++
    }
}

function Test-ApiHealth {
    param([string]$Url)

    Write-LogStep "检查 API 连通性: $Url"
    try {
        $response = Invoke-WebRequest -Uri $Url -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            Write-LogSuccess "API 服务正常"
            $script:TestResults.TotalPassed++
        } else {
            Write-LogWarning "API 响应异常，状态码: $($response.StatusCode)"
            $script:TestResults.TotalFailed++
        }
    } catch {
        Write-LogError "API 服务不可达: $($_.Exception.Message)"
        $script:TestResults.TotalFailed++
    }
}

function Main {
    try {
        if ($Help) {
            Show-Help
            return
        }

        if (-not ($AppLayer -or $Infrastructure -or $Full -or $DatabaseOnly -or $RedisOnly -or $EscalationOnly -or $WebSocketOnly -or $APIOnly)) {
            $Full = $true
        }

        Test-Environment

        if ($Parallel) {
            Write-LogWarning "并行模式当前为占位，将按顺序执行"
        }

        if ($Full -or $AppLayer) {
            Invoke-AppLayerTests
        }

        if ($Full -or $Infrastructure) {
            Invoke-InfrastructureChecks
        }

        if ($DatabaseOnly) {
            Test-Port -Name "PostgreSQL" -Port 5433
        }

        if ($RedisOnly) {
            Test-Port -Name "Redis" -Port 6380
        }

        if ($APIOnly) {
            Test-ApiHealth -Url "http://localhost:8000/health"
        }

        if ($EscalationOnly) {
            Write-LogWarning "告警升级专项测试暂未接入，请使用集成测试覆盖"
        }

        if ($WebSocketOnly) {
            Write-LogWarning "WebSocket 测试暂未接入，请使用前端/脚本验证"
        }

        Write-LogStep "测试统计"
        Write-LogInfo "通过: $($script:TestResults.TotalPassed)"
        Write-LogInfo "失败: $($script:TestResults.TotalFailed)"

        if ($script:TestResults.TotalFailed -gt 0) {
            exit 1
        }
    } catch {
        Write-LogError "测试执行失败: $($_.Exception.Message)"
        exit 1
    }
}

Main
