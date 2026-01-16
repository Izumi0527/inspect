# Go 后端启动脚本
# 用于替代 Python 后端启动流程

param(
    [int]$Port = 8000,
    [switch]$Help,
    [switch]$Build = $false,
    [switch]$Background = $false,
    [switch]$HealthCheck = $false
)

$ErrorActionPreference = "Stop"

$script:ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:ProjectRoot = Split-Path -Parent (Split-Path -Parent $script:ScriptPath)
$script:BackendPath = Join-Path $script:ProjectRoot "backend-go"

function Write-Info($Message) { Write-Host "[信息] $Message" -ForegroundColor Blue }
function Write-Success($Message) { Write-Host "[成功] $Message" -ForegroundColor Green }
function Write-Warn($Message) { Write-Host "[警告] $Message" -ForegroundColor Yellow }
function Write-Error($Message) { Write-Host "[错误] $Message" -ForegroundColor Red }

# 健康检查函数
function Test-ServiceHealth {
    param(
        [string]$Url,
        [int]$MaxRetries = 10,
        [int]$RetryInterval = 2
    )
    
    Write-Info "正在检查服务健康状态..."
    
    for ($i = 1; $i -le $MaxRetries; $i++) {
        try {
            $response = Invoke-RestMethod -Uri $Url -Method Get -TimeoutSec 5 -ErrorAction Stop
            if ($response.status -eq "healthy") {
                Write-Success "✓ 服务健康检查通过"
                Write-Info "  - 状态: $($response.status)"
                Write-Info "  - 版本: $($response.version)"
                Write-Info "  - 时间戳: $(Get-Date -UnixTimeSeconds ([math]::Floor($response.timestamp)))"
                return $true
            }
        } catch {
            if ($i -eq $MaxRetries) {
                Write-Error "✗ 健康检查失败: $($_.Exception.Message)"
                return $false
            }
            Write-Warn "第 $i 次健康检查失败，$RetryInterval 秒后重试..."
            Start-Sleep -Seconds $RetryInterval
        }
    }
    return $false
}

# 测试数据库连接
function Test-DatabaseConnection {
    param([string]$BaseUrl)
    
    Write-Info "正在检查数据库连接..."
    try {
        $response = Invoke-RestMethod -Uri "$BaseUrl/api/v1/settings/health" -Method Get -TimeoutSec 10 -ErrorAction Stop
        Write-Success "✓ 数据库连接正常"
        return $true
    } catch {
        if ($_.Exception.Response.StatusCode -eq 401) {
            Write-Success "✓ 数据库连接正常 (需要认证)"
            return $true
        }
        Write-Warn "✗ 数据库连接检查失败: $($_.Exception.Message)"
        return $false
    }
}

# 显示服务信息
function Show-ServiceInfo {
    param([string]$BaseUrl, [int]$Port)
    
    Write-Host "`n" -NoNewline
    Write-Host "===========================================" -ForegroundColor Cyan
    Write-Host "           Go 后端服务信息" -ForegroundColor Cyan
    Write-Host "===========================================" -ForegroundColor Cyan
    Write-Host "🌐 服务地址:" -ForegroundColor Yellow -NoNewline
    Write-Host " $BaseUrl" -ForegroundColor White
    Write-Host "🔍 健康检查:" -ForegroundColor Yellow -NoNewline
    Write-Host " $BaseUrl/health" -ForegroundColor White
    Write-Host "📡 API 基础路径:" -ForegroundColor Yellow -NoNewline
    Write-Host " $BaseUrl/api/v1" -ForegroundColor White
    Write-Host "`n🔗 常用端点:" -ForegroundColor Green
    Write-Host "  - GET  /health                    服务健康检查" -ForegroundColor Gray
    Write-Host "  - POST /api/v1/auth/login         用户登录" -ForegroundColor Gray
    Write-Host "  - GET  /api/v1/devices            设备列表" -ForegroundColor Gray
    Write-Host "  - GET  /api/v1/dashboard/overview 仪表板概览" -ForegroundColor Gray
    Write-Host "  - GET  /api/v1/settings/health    系统健康状态" -ForegroundColor Gray
    Write-Host "`n💡 测试命令:" -ForegroundColor Green
    Write-Host "  curl $BaseUrl/health" -ForegroundColor Magenta
    Write-Host "===========================================" -ForegroundColor Cyan
    Write-Host ""
}

if ($Help) {
    Write-Host "Go 后端启动脚本"
    Write-Host "用法: .\\start-backend-go.ps1 [-Port 8000] [-Build] [-Background] [-HealthCheck]"
    Write-Host "参数:"
    Write-Host "  -Port        指定服务端口 (默认: 8000)"
    Write-Host "  -Build       强制重新编译"
    Write-Host "  -Background  在后台运行服务"
    Write-Host "  -HealthCheck 仅执行健康检查（不启动服务）"
    Write-Host "说明: 自动加载根目录 .env"
    exit 0
}

# 检查 Go 可执行文件
$goCmd = $null
$goCommand = Get-Command "go" -ErrorAction SilentlyContinue
if ($goCommand) {
    $goCmd = $goCommand.Source
} else {
    $candidatePaths = @()
    if ($env:GO_EXECUTABLE) {
        $candidatePaths += $env:GO_EXECUTABLE
    }
    $candidatePaths += @(
        "C:\\Program Files\\Go\\bin\\go.exe",
        "C:\\Go\\bin\\go.exe"
    )
    foreach ($candidate in $candidatePaths) {
        if ($candidate -and (Test-Path $candidate)) {
            $goCmd = $candidate
            break
        }
    }
}

if (-not $goCmd) {
    throw "未检测到 Go 运行时，请先安装 Go 1.22+，或设置 GO_EXECUTABLE / 配置 PATH"
}
Write-Info "使用 Go 可执行文件: $goCmd"

if (-not (Test-Path $script:BackendPath)) {
    throw "backend-go 目录不存在: $script:BackendPath"
}

# 设置环境变量
$envFile = Join-Path $script:ProjectRoot ".env"
if (Test-Path $envFile) {
    $env:ENV_FILE = $envFile
    Write-Info "使用环境文件: $envFile"
} else {
    Write-Warn "未找到 .env 文件，将使用默认配置"
}

if ($Port -gt 0) {
    $env:SERVER_PORT = $Port
}

# 确保日志目录存在
$logDir = Join-Path $script:ProjectRoot "logs\backend-go"
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    Write-Info "创建日志目录: $logDir"
}

# 设置日志文件路径
$logFile = Join-Path $script:ProjectRoot "logs\backend-go\app-dev.log"
$env:LOG_FILE = $logFile

# 仅健康检查模式
if ($HealthCheck) {
    $baseUrl = "http://localhost:$Port"
    Write-Info "执行 Go 后端服务健康检查..."
    Write-Info "检查地址: $baseUrl"
    
    $healthOk = Test-ServiceHealth -Url "$baseUrl/health" -MaxRetries 3 -RetryInterval 1
    
    if ($healthOk) {
        Test-DatabaseConnection -BaseUrl $baseUrl | Out-Null
        Show-ServiceInfo -BaseUrl $baseUrl -Port $Port
        Write-Success "健康检查完成 - 服务运行正常"
        exit 0
    } else {
        Write-Error "健康检查失败 - 服务可能未启动或存在问题"
        Write-Info "请先启动服务: .\scripts\development\start-backend-go.ps1"
        exit 1
    }
}

Push-Location $script:BackendPath
try {
    $appExe = Join-Path $script:BackendPath "app.exe"
    
    # 检查是否需要编译
    $needsBuild = $Build
    if (-not $needsBuild -and -not (Test-Path $appExe)) {
        $needsBuild = $true
        Write-Info "未找到编译后的程序，需要编译"
    }
    
    if ($needsBuild) {
        Write-Info "编译 Go 后端程序..."
        & $goCmd build -o app.exe ./cmd/api
        if ($LASTEXITCODE -ne 0) {
            throw "编译失败，退出代码: $LASTEXITCODE"
        }
        Write-Success "编译完成"
    }
    
    Write-Info "启动 Go 后端服务..."
    Write-Info "服务将在端口 $Port 上运行"
    
    if ($Background) {
        # 后台运行
        $job = Start-Job -ScriptBlock {
            param($AppPath, $WorkingDir, $EnvFile, $ServerPort, $LogFile)
            $env:ENV_FILE = $EnvFile
            $env:SERVER_PORT = $ServerPort
            $env:LOG_FILE = $LogFile
            Set-Location $WorkingDir
            & $AppPath
        } -ArgumentList $appExe, (Get-Location), $envFile, $Port, $logFile
        
        Write-Success "Go 后端服务已在后台启动 (作业 ID: $($job.Id))"
        Write-Info "使用 'Get-Job' 查看状态，'Stop-Job -Id $($job.Id)' 停止服务"
        
        # 等待服务启动
        Write-Info "等待服务启动..."
        Start-Sleep -Seconds 3
        
        # 检查服务状态
        $jobState = Get-Job -Id $job.Id
        if ($jobState.State -eq "Running") {
            Write-Success "✓ 后台作业运行正常"
            
            # 构建服务 URL
            $baseUrl = "http://localhost:$Port"
            
            # 执行健康检查
            $healthOk = Test-ServiceHealth -Url "$baseUrl/health"
            
            if ($healthOk) {
                # 测试数据库连接
                Test-DatabaseConnection -BaseUrl $baseUrl | Out-Null
                
                # 显示服务信息
                Show-ServiceInfo -BaseUrl $baseUrl -Port $Port
            } else {
                Write-Error "服务启动失败，请检查日志: $logFile"
                Write-Info "查看作业输出: Receive-Job -Id $($job.Id)"
            }
        } else {
            Write-Error "后台作业启动失败，状态: $($jobState.State)"
            Write-Info "查看作业输出: Receive-Job -Id $($job.Id)"
        }
        
    } else {
        # 前台运行
        Write-Info "按 Ctrl+C 停止服务"
        Write-Success "Go 后端服务正在启动..."
        
        # 构建服务 URL
        $baseUrl = "http://localhost:$Port"
        
        # 在后台启动程序
        $process = Start-Process -FilePath $appExe -NoNewWindow -PassThru -WorkingDirectory $script:BackendPath
        
        # 等待服务启动
        Write-Info "等待服务启动..."
        Start-Sleep -Seconds 4
        
        # 执行健康检查
        $healthOk = Test-ServiceHealth -Url "$baseUrl/health"
        
        if ($healthOk) {
            # 测试数据库连接
            Test-DatabaseConnection -BaseUrl $baseUrl | Out-Null
            
            # 显示服务信息
            Show-ServiceInfo -BaseUrl $baseUrl -Port $Port
            
            Write-Info "服务正在前台运行，按 Ctrl+C 停止..."
            
            # 等待用户按键或进程结束
            try {
                while (!$process.HasExited) {
                    Start-Sleep -Milliseconds 500
                    if ([Console]::KeyAvailable) {
                        $key = [Console]::ReadKey($true)
                        if ($key.Key -eq "C" -and $key.Modifiers -eq "Control") {
                            Write-Host "`n[信息] 收到停止信号，正在关闭服务..." -ForegroundColor Blue
                            break
                        }
                    }
                }
            } catch {
                Write-Info "服务进程监控中断"
            } finally {
                if (!$process.HasExited) {
                    Write-Info "正在停止服务..."
                    $process.Kill()
                    $process.WaitForExit(5000)
                }
                Write-Success "服务已停止"
            }
        } else {
            Write-Error "服务启动失败，请检查日志: $logFile"
            if (!$process.HasExited) {
                $process.Kill()
            }
        }
    }
    
} catch {
    Write-Host "错误: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
} finally {
    Pop-Location
}
