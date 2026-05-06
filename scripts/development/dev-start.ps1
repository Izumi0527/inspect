#!/usr/bin/env pwsh
<#
.SYNOPSIS
    开发环境快速启动脚本

.DESCRIPTION
    快速启动开发环境的所有必要服务，包括数据库、后端和前端服务
    提供一键启动和状态检查功能

.PARAMETER Services
    指定要启动的服务: database, backend, frontend, all (默认)

.PARAMETER Wait
    启动后等待服务就绪的时间 (秒)

.PARAMETER SkipHealthCheck
    跳过健康检查

.PARAMETER Diagnose
    仅执行开发环境诊断（不启动任何服务）

.EXAMPLE
    .\dev-start.ps1
    启动所有开发服务

.EXAMPLE
    .\dev-start.ps1 -Services database
    仅启动数据库服务

.EXAMPLE
    .\dev-start.ps1 -Wait 30
    启动服务并等待30秒

.NOTES
    文件名: dev-start.ps1
    作者: 技术团队
    版本: 1.0.0
    创建日期: 2025-12-10
#>

[CmdletBinding()]
param(
    [ValidateSet("database", "backend", "frontend", "all")]
    [string]$Services = "all",
    
    [int]$Wait = 10,
    
    [switch]$SkipHealthCheck,

    [switch]$Diagnose
)

# 设置错误处理
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

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

function Test-VerboseEnabled {
    try {
        if ($PSBoundParameters.ContainsKey("Verbose")) { return $true }
    } catch { }
    return ($VerbosePreference -ne "SilentlyContinue")
}

function Write-StatusLine {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Message,

        [Parameter(Mandatory = $true)]
        [ValidateSet("OK", "WARN", "ERROR", "INFO")]
        [string]$Status,

        [string]$Detail = ""
    )

    $icon = "•"
    $color = "White"
    switch ($Status) {
        "OK" { $icon = "✅"; $color = "Green" }
        "WARN" { $icon = "⚠️"; $color = "Yellow" }
        "ERROR" { $icon = "❌"; $color = "Red" }
        "INFO" { $icon = "ℹ️"; $color = "Cyan" }
    }

    Write-Host "$icon $Message" -ForegroundColor ([ConsoleColor]::$color)
    if (-not [string]::IsNullOrWhiteSpace($Detail) -and (Test-VerboseEnabled)) {
        Write-Host "   $Detail" -ForegroundColor Gray
    }
}

# 执行命令函数
function Invoke-CommandSafely {
    param(
        [string]$Command,
        [string]$Description,
        [string]$WorkingDirectory = $PWD,
        [switch]$IgnoreErrors,
        [switch]$Background
    )
    
    try {
        $originalLocation = Get-Location
        Set-Location $WorkingDirectory
        
        if ($Background) {
            Write-ColorOutput "🚀 后台启动: $Description" "Cyan"
            Start-Process -FilePath "powershell" -ArgumentList "-Command", $Command -WindowStyle Minimized
            return $true
        } else {
            Write-ColorOutput "🔄 $Description..." "Cyan"
            $result = Invoke-Expression $Command
            
            if ($LASTEXITCODE -eq 0 -or $null -eq $LASTEXITCODE) {
                Write-ColorOutput "✅ $Description 完成" "Green"
                return $true
            } else {
                throw "命令执行失败，退出代码: $LASTEXITCODE"
            }
        }
    }
    catch {
        if ($IgnoreErrors) {
            Write-ColorOutput "⚠️ $Description 失败: $($_.Exception.Message)" "Yellow"
            return $false
        } else {
            Write-ColorOutput "❌ $Description 失败: $($_.Exception.Message)" "Red"
            throw
        }
    }
    finally {
        Set-Location $originalLocation
    }
}

# 读取 .env 风格配置项（仅支持 KEY=VALUE 的简单场景，足够覆盖开发脚本需求）
function Get-DotEnvValue {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,

        [Parameter(Mandatory = $true)]
        [string]$Key,

        [string]$DefaultValue = ""
    )

    if (-not (Test-Path -LiteralPath $FilePath)) {
        return $DefaultValue
    }

    try {
        foreach ($line in Get-Content -LiteralPath $FilePath) {
            $trimmed = $line.Trim()
            if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed.StartsWith("#")) {
                continue
            }

            $parts = $trimmed -split "=", 2
            if ($parts.Count -ne 2) {
                continue
            }

            $name = $parts[0].Trim()
            if ($name -ne $Key) {
                continue
            }

            $value = $parts[1].Trim()
            if ($value.Length -ge 2) {
                $quote = $value.Substring(0, 1)
                if (($quote -eq '"' -or $quote -eq "'") -and $value.EndsWith($quote)) {
                    $value = $value.Substring(1, $value.Length - 2)
                }
            }

            return $value
        }
    }
    catch {
        return $DefaultValue
    }

    return $DefaultValue
}

function Get-BackendDevConfig {
    param(
        [switch]$AllowMissingPort
    )

    $projectRoot = (Get-Location).Path
    $envFilePath = Join-Path $projectRoot ".env"

    $serverHost = [System.Environment]::GetEnvironmentVariable("SERVER_HOST")
    if ([string]::IsNullOrWhiteSpace($serverHost)) {
        $serverHost = Get-DotEnvValue -FilePath $envFilePath -Key "SERVER_HOST" -DefaultValue "127.0.0.1"
    }

    $publicHost = $serverHost
    if ([string]::IsNullOrWhiteSpace($publicHost) -or $publicHost -in @("0.0.0.0", "::", "[::]")) {
        $publicHost = "127.0.0.1"
    }

    $serverPortRaw = [System.Environment]::GetEnvironmentVariable("SERVER_PORT")
    if ([string]::IsNullOrWhiteSpace($serverPortRaw)) {
        $serverPortRaw = Get-DotEnvValue -FilePath $envFilePath -Key "SERVER_PORT"
    }

    $serverPort = 0
    $portError = $null
    if ([string]::IsNullOrWhiteSpace($serverPortRaw) -or -not [int]::TryParse($serverPortRaw, [ref]$serverPort) -or $serverPort -le 0 -or $serverPort -gt 65535) {
        $portError = "根目录 .env 或环境变量中的 SERVER_PORT 未配置或非法。"
        if (-not $AllowMissingPort) {
            throw $portError
        }
    }

    $apiUrl = [System.Environment]::GetEnvironmentVariable("NEXT_PUBLIC_API_URL")
    if ([string]::IsNullOrWhiteSpace($apiUrl)) {
        $apiUrl = Get-DotEnvValue -FilePath $envFilePath -Key "NEXT_PUBLIC_API_URL"
    }
    if ([string]::IsNullOrWhiteSpace($apiUrl) -and $serverPort -gt 0) {
        $apiUrl = "http://$publicHost`:$serverPort"
    }

    $wsUrl = [System.Environment]::GetEnvironmentVariable("NEXT_PUBLIC_WS_URL")
    if ([string]::IsNullOrWhiteSpace($wsUrl)) {
        $wsUrl = Get-DotEnvValue -FilePath $envFilePath -Key "NEXT_PUBLIC_WS_URL"
    }
    if ([string]::IsNullOrWhiteSpace($wsUrl) -and $serverPort -gt 0) {
        $wsUrl = "ws://$publicHost`:$serverPort"
    }

    $healthUrl = ""
    if ($serverPort -gt 0) {
        $healthUrl = "http://$publicHost`:$serverPort/health"
    }

    return @{
        ProjectRoot = $projectRoot
        EnvFilePath = $envFilePath
        ServerHost  = $serverHost
        PublicHost  = $publicHost
        ServerPort  = $serverPort
        ApiUrl      = $apiUrl
        WsUrl       = $wsUrl
        HealthUrl   = $healthUrl
        ErrorMessage = $portError
    }
}

# 检查前置条件
function Test-Prerequisites {
    Write-ColorOutput "🔍 检查前置条件..." "Blue"
    
    $tools = @(
        @{ Command = "docker"; Name = "Docker" }
    )

    if ($Services -in @("database", "backend", "all")) {
        $tools += @{ Command = "docker-compose"; Name = "docker-compose" }
    }

    if ($Services -in @("backend", "all")) {
        $tools += @{ Command = "go"; Name = "Go 运行时" }
    }

    if ($Services -in @("frontend", "all")) {
        $tools += @{ Command = "pnpm"; Name = "pnpm 包管理器" }
    }
    
    $allOk = $true
    foreach ($tool in $tools) {
        try {
            $null = Get-Command $tool.Command -ErrorAction Stop
            Write-ColorOutput "✅ $($tool.Name) 可用" "Green"
        }
        catch {
            Write-ColorOutput "❌ $($tool.Name) 未安装或不可用" "Red"
            $allOk = $false
        }
    }
    
    if (-not $allOk) {
        throw "前置条件检查失败，请先安装必要的工具"
    }
}

# 检查数据库容器是否已运行
function Test-DatabaseRunning {
    try {
        # 检查 PostgreSQL 容器
        $pgContainer = docker ps --filter "name=inspect-postgres-dev" --format "{{.Names}}" 2>$null
        $pgRunning = $pgContainer -eq "inspect-postgres-dev"
        
        # 检查 Redis 容器
        $redisContainer = docker ps --filter "name=inspect-redis-dev" --format "{{.Names}}" 2>$null
        $redisRunning = $redisContainer -eq "inspect-redis-dev"
        
        return @{
            PostgreSQL = $pgRunning
            Redis = $redisRunning
            Both = $pgRunning -and $redisRunning
        }
    }
    catch {
        return @{
            PostgreSQL = $false
            Redis = $false
            Both = $false
        }
    }
}

# 启动数据库服务
function Start-DatabaseServices {
    Write-ColorOutput "`n🗄️ 启动数据库服务..." "Blue"
    
    # 检查数据库是否已运行
    $dbStatus = Test-DatabaseRunning
    
    if ($dbStatus.Both) {
        Write-ColorOutput "✅ 数据库服务已在运行中，跳过启动" "Green"
        Write-ColorOutput "  - PostgreSQL: inspect-postgres-dev" "Gray"
        Write-ColorOutput "  - Redis: inspect-redis-dev" "Gray"
        return
    }
    
    if ($dbStatus.PostgreSQL -or $dbStatus.Redis) {
        Write-ColorOutput "⚠️ 部分数据库服务已运行:" "Yellow"
        if ($dbStatus.PostgreSQL) {
            Write-ColorOutput "  - PostgreSQL: 已运行" "Gray"
        }
        if ($dbStatus.Redis) {
            Write-ColorOutput "  - Redis: 已运行" "Gray"
        }
        Write-ColorOutput "将启动缺失的服务..." "Yellow"
    }
    
    # 检查 Docker Compose 文件（已迁移为“单文件完整配置”）
    $devComposeFile = "docker-compose.dev.yml"
    $legacyComposeFile = "docker-compose.yml"

    $composeFile = $null
    if (Test-Path $devComposeFile) {
        $composeFile = $devComposeFile
    } elseif (Test-Path $legacyComposeFile) {
        # 兼容旧结构（如历史分支/本地遗留文件）
        $composeFile = $legacyComposeFile
        Write-ColorOutput "⚠️ 检测到旧版配置文件: $legacyComposeFile（建议迁移到 docker-compose.dev.yml）" "Yellow"
    } else {
        throw "未找到 Docker Compose 配置文件: $devComposeFile"
    }

    Write-ColorOutput "使用配置文件: $composeFile" "Gray"

    # 启动数据库服务（只启动 postgres 和 redis，不启动其他服务）
    try {
        Write-ColorOutput "🔄 启动数据库容器..." "Cyan"
        $composeCmd = "docker-compose -f $composeFile up -d postgres redis"
        $result = Invoke-Expression $composeCmd 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-ColorOutput "✅ 数据库容器启动成功" "Green"
        } else {
            throw "数据库容器启动失败: $result"
        }
    }
    catch {
        Write-ColorOutput "❌ 启动数据库容器失败: $($_.Exception.Message)" "Red"
        throw
    }
    
    # 等待服务启动
    if ($Wait -gt 0) {
        Write-ColorOutput "⏳ 等待数据库服务启动 ($Wait 秒)..." "Yellow"
        Start-Sleep -Seconds $Wait
    }
    
    # 验证服务状态
    $dbStatus = Test-DatabaseRunning
    if ($dbStatus.Both) {
        Write-ColorOutput "✅ 数据库服务验证通过" "Green"
    } else {
        Write-ColorOutput "⚠️ 数据库服务可能未完全启动" "Yellow"
        if (-not $dbStatus.PostgreSQL) {
            Write-ColorOutput "  - PostgreSQL: 未检测到" "Red"
        }
        if (-not $dbStatus.Redis) {
            Write-ColorOutput "  - Redis: 未检测到" "Red"
        }
    }
}

# 启动后端服务
function Start-BackendService {
    Write-ColorOutput "`n🔧 启动后端服务..." "Blue"
    
    $backendDir = "backend-go"
    $backendConfig = Get-BackendDevConfig
    
    # 检查后端目录
    if (-not (Test-Path $backendDir)) {
        Write-ColorOutput "⚠️ 后端目录不存在，跳过后端服务启动" "Yellow"
        return
    }
    
    # 检查 Go 是否可用
    try {
        $null = Get-Command "go" -ErrorAction Stop
    }
    catch {
        Write-ColorOutput "❌ Go 运行时不可用，无法启动后端服务" "Red"
        return
    }
    
    # 启动后端开发服务器
    Write-ColorOutput "🚀 启动后端开发服务器..." "Cyan"
    Write-ColorOutput "访问地址: $($backendConfig.ApiUrl)" "White"
    Write-ColorOutput "API 说明: docs/api/openapi.json" "White"
    Write-ColorOutput "按 Ctrl+C 停止服务" "Gray"
    
    # 在新窗口中启动后端服务
    # 使用 ENV_FILE 环境变量指定配置文件路径，这样可以从 backend-go 目录运行
    $backendWorkDir = Join-Path $backendConfig.ProjectRoot $backendDir
    $backendCommand = "`$env:ENV_FILE='$($backendConfig.EnvFilePath)'; cd '$backendWorkDir'; go run ./cmd/api"
    Start-Process -FilePath "powershell" -ArgumentList "-NoExit", "-Command", $backendCommand
    
    Write-ColorOutput "✅ 后端服务已在新窗口中启动" "Green"
}

# 启动前端服务
function Start-FrontendService {
    Write-ColorOutput "`n🎨 启动前端服务..." "Blue"
    
    $frontendDir = "frontend"
    $frontendEnvPath = Join-Path $frontendDir ".env.local"
    $backendConfig = Get-BackendDevConfig
    
    # 检查前端目录
    if (-not (Test-Path $frontendDir)) {
        Write-ColorOutput "⚠️ 前端目录不存在，跳过前端服务启动" "Yellow"
        return
    }
    
    # 检查 node_modules
    if (-not (Test-Path "$frontendDir\node_modules")) {
        Write-ColorOutput "⚠️ 前端依赖未安装，正在安装..." "Yellow"
        Invoke-CommandSafely "pnpm install" "安装前端依赖" $frontendDir
    }
    
    # 检查环境配置文件
    if (-not (Test-Path $frontendEnvPath)) {
        Write-ColorOutput "⚠️ 前端环境配置文件不存在，创建默认配置..." "Yellow"
        
        $envContent = @"
NEXT_PUBLIC_API_URL=$($backendConfig.ApiUrl)
NEXT_PUBLIC_WS_URL=$($backendConfig.WsUrl)
NODE_ENV=development
NEXT_PUBLIC_ENV=development
"@
        $envContent | Out-File -FilePath $frontendEnvPath -Encoding UTF8
        Write-ColorOutput "✅ 已创建默认前端环境配置文件" "Green"
    } else {
        # 仅提示不强制覆盖：避免误把本地自定义配置改掉
        try {
            $actualApiUrl = Get-DotEnvValue -FilePath $frontendEnvPath -Key "NEXT_PUBLIC_API_URL"
            $actualWsUrl = Get-DotEnvValue -FilePath $frontendEnvPath -Key "NEXT_PUBLIC_WS_URL"
            if ($actualApiUrl -ne $backendConfig.ApiUrl -or $actualWsUrl -ne $backendConfig.WsUrl) {
                Write-ColorOutput "⚠️ 检测到 frontend/.env.local 与根 .env 中的后端地址不一致，可能导致前端请求错误地址" "Yellow"
                Write-ColorOutput "   - 当前 NEXT_PUBLIC_API_URL=${actualApiUrl}" "Gray"
                Write-ColorOutput "   - 当前 NEXT_PUBLIC_WS_URL=${actualWsUrl}" "Gray"
                Write-ColorOutput "   - 建议改为: NEXT_PUBLIC_API_URL=$($backendConfig.ApiUrl)" "Gray"
                Write-ColorOutput "   - 建议改为: NEXT_PUBLIC_WS_URL=$($backendConfig.WsUrl)" "Gray"
                Write-ColorOutput "   - 修改后请重启前端开发服务器（pnpm dev）" "Gray"
            }
        } catch { }
    }
    
    # 启动前端开发服务器
    Write-ColorOutput "🚀 启动前端开发服务器..." "Cyan"
    Write-ColorOutput "访问地址: http://localhost:3000" "White"
    Write-ColorOutput "按 Ctrl+C 停止服务" "Gray"
    
    # 在新窗口中启动前端服务
    $frontendCommand = "cd $frontendDir; pnpm dev"
    Start-Process -FilePath "powershell" -ArgumentList "-NoExit", "-Command", $frontendCommand
    
    Write-ColorOutput "✅ 前端服务已在新窗口中启动" "Green"
}

# 开发环境诊断（原 diagnose.ps1 已合并至此脚本）
function Invoke-DevDiagnose {
    Write-Host ""
    Write-ColorOutput "🔍 开发环境诊断（dev-start.ps1 -Diagnose）" "Cyan"
    Write-ColorOutput "$('=' * 60)" "Cyan"

    Write-Host ""
    Write-ColorOutput "📦 检查必需工具..." "Blue"

    $tools = @(
        @{ Name = "Docker"; Command = "docker"; Args = "--version" },
        @{ Name = "docker-compose"; Command = "docker-compose"; Args = "version" },
        @{ Name = "Go"; Command = "go"; Args = "version" },
        @{ Name = "Node.js"; Command = "node"; Args = "--version" },
        @{ Name = "pnpm"; Command = "pnpm"; Args = "--version" }
    )

    foreach ($tool in $tools) {
        try {
            $cmd = Get-Command $tool.Command -ErrorAction Stop
            $out = & $tool.Command $tool.Args 2>$null
            Write-StatusLine -Message $tool.Name -Status "OK" -Detail ($out -join " ")
        }
        catch {
            Write-StatusLine -Message $tool.Name -Status "ERROR" -Detail "未安装或不可用"
        }
    }

    Write-Host ""
    Write-ColorOutput "🐳 检查 Docker 服务..." "Blue"
    try {
        $null = & docker info 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-StatusLine -Message "Docker 服务" -Status "OK"
        } else {
            Write-StatusLine -Message "Docker 服务" -Status "ERROR" -Detail "Docker 未运行或无权限"
        }
    }
    catch {
        Write-StatusLine -Message "Docker 服务" -Status "ERROR" -Detail $_.Exception.Message
    }

    Write-Host ""
    Write-ColorOutput "🗄️ 检查数据库容器与端口..." "Blue"
    $postgresHostPort = Get-HostPort -ContainerName "inspect-postgres-dev" -ContainerPort 5432 -EnvVarName "POSTGRES_HOST_PORT" -DefaultPort 15500
    $redisHostPort = Get-HostPort -ContainerName "inspect-redis-dev" -ContainerPort 6379 -EnvVarName "REDIS_HOST_PORT" -DefaultPort 16380
    $containers = @(
        @{ Name = "PostgreSQL"; Container = "inspect-postgres-dev"; Port = $postgresHostPort },
        @{ Name = "Redis"; Container = "inspect-redis-dev"; Port = $redisHostPort }
    )

    foreach ($c in $containers) {
        try {
            $running = docker ps --filter "name=$($c.Container)" --format "{{.Names}}" 2>$null
            if ($running -eq $c.Container) {
                Write-StatusLine -Message "$($c.Name) 容器" -Status "OK" -Detail "$($c.Container) 运行中"
            } else {
                Write-StatusLine -Message "$($c.Name) 容器" -Status "WARN" -Detail "未运行"
            }
        }
        catch {
            Write-StatusLine -Message "$($c.Name) 容器" -Status "ERROR" -Detail $_.Exception.Message
        }

        try {
            $connection = Test-NetConnection -ComputerName localhost -Port $c.Port -WarningAction SilentlyContinue
            if ($connection.TcpTestSucceeded) {
                Write-StatusLine -Message "  端口 $($c.Port)" -Status "OK" -Detail "可访问"
            } else {
                Write-StatusLine -Message "  端口 $($c.Port)" -Status "WARN" -Detail "不可访问"
            }
        }
        catch {
            Write-StatusLine -Message "  端口 $($c.Port)" -Status "ERROR" -Detail $_.Exception.Message
        }
    }

    Write-Host ""
    Write-ColorOutput "📄 检查配置文件..." "Blue"
    $configFiles = @(
        @{ Name = "docker-compose.dev.yml"; Path = "docker-compose.dev.yml" },
        @{ Name = "docker-compose.prod.yml"; Path = "docker-compose.prod.yml" },
        @{ Name = "docker-compose.yml（旧版/可选）"; Path = "docker-compose.yml" },
        @{ Name = ".env"; Path = ".env" },
        @{ Name = ".env.development"; Path = ".env.development" },
        @{ Name = "frontend/.env.local"; Path = "frontend/.env.local" }
    )
    foreach ($f in $configFiles) {
        if (Test-Path $f.Path) {
            Write-StatusLine -Message $f.Name -Status "OK" -Detail "存在"
        } else {
            Write-StatusLine -Message $f.Name -Status "WARN" -Detail "不存在"
        }
    }

    Write-Host ""
    Write-ColorOutput "📁 检查目录结构..." "Blue"
    $directories = @(
        @{ Name = "backend-go"; Path = "backend-go" },
        @{ Name = "frontend"; Path = "frontend" },
        @{ Name = "database"; Path = "database" },
        @{ Name = "logs"; Path = "logs" },
        @{ Name = "data"; Path = "data" }
    )
    foreach ($d in $directories) {
        if (Test-Path $d.Path) {
            Write-StatusLine -Message $d.Name -Status "OK" -Detail "存在"
        } else {
            Write-StatusLine -Message $d.Name -Status "WARN" -Detail "不存在"
        }
    }

    Write-Host ""
    Write-ColorOutput "🔌 检查端口占用..." "Blue"
    $backendConfig = Get-BackendDevConfig -AllowMissingPort
    $ports = @(3000, $postgresHostPort, $redisHostPort, 5050, 8081)
    if ($backendConfig.ServerPort -gt 0) {
        $ports += $backendConfig.ServerPort
    } elseif (-not [string]::IsNullOrWhiteSpace($backendConfig.ErrorMessage)) {
        Write-StatusLine -Message "后端端口配置" -Status "WARN" -Detail $backendConfig.ErrorMessage
    }
    $ports = @($ports | Select-Object -Unique)
    foreach ($p in $ports) {
        try {
            if (Get-Command "Get-NetTCPConnection" -ErrorAction SilentlyContinue) {
                $connection = Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue
                if ($connection) {
                    $processName = ""
                    try {
                        $process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
                        if ($process) { $processName = $process.ProcessName }
                    } catch { }
                    $detail = if ($processName) { "被占用（进程: $processName）" } else { "被占用" }
                    Write-StatusLine -Message "端口 $p" -Status "WARN" -Detail $detail
                } else {
                    Write-StatusLine -Message "端口 $p" -Status "OK" -Detail "可用"
                }
            } else {
                Write-StatusLine -Message "端口 $p" -Status "INFO" -Detail "当前系统不支持 Get-NetTCPConnection"
            }
        }
        catch {
            Write-StatusLine -Message "端口 $p" -Status "WARN" -Detail $_.Exception.Message
        }
    }

    Write-Host ""
    Write-ColorOutput "🌐 检查 Docker 网络..." "Blue"
    try {
        $networks = docker network ls --format "{{.Name}}" 2>$null
        if ($networks -match "inspect") {
            $inspectNetworks = $networks | Select-String "inspect"
            foreach ($n in $inspectNetworks) {
                Write-StatusLine -Message ("网络: {0}" -f $n) -Status "OK"
            }
        } else {
            Write-StatusLine -Message "inspect 网络" -Status "INFO" -Detail "未创建（首次启动时会自动创建）"
        }
    }
    catch {
        Write-StatusLine -Message "Docker 网络" -Status "WARN" -Detail $_.Exception.Message
    }

    Write-Host ""
    Write-ColorOutput "📊 建议操作" "Blue"
    $dbStatus = Test-DatabaseRunning
    if ($dbStatus.Both) {
        Write-ColorOutput "  ✅ 数据库已运行，可直接启动后端/全量服务：" "Green"
        Write-ColorOutput "     .\\scripts\\development\\dev-start.ps1 -Services backend" "White"
    } elseif (-not $dbStatus.PostgreSQL -and -not $dbStatus.Redis) {
        Write-ColorOutput "  🚀 数据库未运行，建议一键启动全量：" "Cyan"
        Write-ColorOutput "     .\\scripts\\development\\dev-start.ps1" "White"
    } else {
        Write-ColorOutput "  ⚠️ 数据库部分服务运行中，建议重启：" "Yellow"
        Write-ColorOutput "     .\\scripts\\database\\db-manage.ps1 stop" "White"
        Write-ColorOutput "     .\\scripts\\database\\db-manage.ps1 start" "White"
    }

    Write-Host ""
    Write-ColorOutput "📚 更多帮助:" "Yellow"
    Write-ColorOutput "  - 开发脚本文档: .\\scripts\\development\\README.md" "White"
    Write-ColorOutput "  - 数据库状态: .\\scripts\\database\\db-manage.ps1 status" "White"
    Write-ColorOutput "  - 数据库状态检查: .\\scripts\\db-manage.ps1 status" "White"
}

# 获取 Docker 容器映射到宿主机的端口（优先使用实际映射，其次读取环境变量，最后使用默认值）
function Get-HostPort {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ContainerName,

        [Parameter(Mandatory = $true)]
        [int]$ContainerPort,

        [Parameter(Mandatory = $true)]
        [string]$EnvVarName,

        [Parameter(Mandatory = $true)]
        [int]$DefaultPort
    )

    # 1) 优先从当前 Docker 实际端口映射中解析（避免环境变量未同步导致显示错误）
    try {
        if (Get-Command "docker" -ErrorAction SilentlyContinue) {
            $mapping = docker port $ContainerName "$ContainerPort/tcp" 2>$null
            if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($mapping)) {
                foreach ($line in ($mapping -split "`r?`n")) {
                    $trimmed = $line.Trim()
                    if ($trimmed -match ":(\\d+)\\s*$") {
                        return [int]$matches[1]
                    }
                }
            }
        }
    } catch {
        # 忽略解析失败，进入后续回退逻辑
    }

    # 2) 回退：读取环境变量（docker-compose.dev.yml 使用 POSTGRES_HOST_PORT/REDIS_HOST_PORT 覆盖）
    try {
        $raw = [System.Environment]::GetEnvironmentVariable($EnvVarName)
        $parsed = 0
        if (-not [string]::IsNullOrWhiteSpace($raw) -and [int]::TryParse($raw, [ref]$parsed)) {
            return $parsed
        }
    } catch {
        # 忽略
    }

    # 3) 最后回退：默认端口
    return $DefaultPort
}

# 健康检查
function Test-ServicesHealth {
    if ($SkipHealthCheck) {
        return
    }
    
    Write-ColorOutput "`n🏥 服务健康检查..." "Blue"
    
    # 检查数据库服务
    $postgresHostPort = Get-HostPort -ContainerName "inspect-postgres-dev" -ContainerPort 5432 -EnvVarName "POSTGRES_HOST_PORT" -DefaultPort 15500
    $redisHostPort = Get-HostPort -ContainerName "inspect-redis-dev" -ContainerPort 6379 -EnvVarName "REDIS_HOST_PORT" -DefaultPort 16380
    $dbServices = @(
        @{ Name = "PostgreSQL"; Port = $postgresHostPort; Host = "localhost" },
        @{ Name = "Redis"; Port = $redisHostPort; Host = "localhost" }
    )
    
    foreach ($service in $dbServices) {
        try {
            $connection = Test-NetConnection -ComputerName $service.Host -Port $service.Port -WarningAction SilentlyContinue
            if ($connection.TcpTestSucceeded) {
                Write-ColorOutput "✅ $($service.Name) 服务正常 ($($service.Host):$($service.Port))" "Green"
            } else {
                Write-ColorOutput "❌ $($service.Name) 服务不可达 ($($service.Host):$($service.Port))" "Red"
            }
        }
        catch {
            Write-ColorOutput "❌ $($service.Name) 服务检查失败: $($_.Exception.Message)" "Red"
        }
    }
    
    # 等待后端服务启动
    Write-ColorOutput "`n⏳ 等待后端服务启动..." "Yellow"
    Start-Sleep -Seconds 5
    
    # 检查后端健康状态（带重试）
    $backendConfig = Get-BackendDevConfig -AllowMissingPort
    if ($backendConfig.ServerPort -gt 0) {
        $backendHealthUrl = $backendConfig.HealthUrl
        $maxRetries = 3
        $retryDelay = 3
        $backendHealthy = $false

        for ($i = 1; $i -le $maxRetries; $i++) {
            try {
                $response = Invoke-WebRequest -Uri $backendHealthUrl -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
                if ($response.StatusCode -eq 200) {
                    $healthData = $response.Content | ConvertFrom-Json
                    Write-ColorOutput "✅ 后端 API 服务正常" "Green"
                    Write-ColorOutput "   - 状态: $($healthData.status)" "Gray"
                    Write-ColorOutput "   - 版本: $($healthData.version)" "Gray"
                    Write-ColorOutput "   - 端点: $backendHealthUrl" "Gray"
                    $backendHealthy = $true
                    break
                }
            }
            catch {
                if ($i -lt $maxRetries) {
                    Write-ColorOutput "⏳ 后端服务尚未就绪，等待重试 ($i/$maxRetries)..." "Yellow"
                    Start-Sleep -Seconds $retryDelay
                } else {
                    Write-ColorOutput "⚠️ 后端 API 服务暂未就绪（可能仍在启动中）" "Yellow"
                    Write-ColorOutput "   - 端点: $backendHealthUrl" "Gray"
                    Write-ColorOutput "   - 请稍后手动检查: Invoke-WebRequest $backendHealthUrl" "Gray"
                }
            }
        }
    } else {
        Write-ColorOutput "⚠️ 跳过后端健康检查：$($backendConfig.ErrorMessage)" "Yellow"
    }
    
    # 检查前端服务
    $frontendUrl = "http://localhost:3000"
    try {
        $response = Invoke-WebRequest -Uri $frontendUrl -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            Write-ColorOutput "✅ 前端应用服务正常" "Green"
            Write-ColorOutput "   - 端点: $frontendUrl" "Gray"
        } else {
            Write-ColorOutput "⚠️ 前端应用服务响应异常 (状态码: $($response.StatusCode))" "Yellow"
        }
    }
    catch {
        Write-ColorOutput "⚠️ 前端应用服务暂未就绪（可能仍在启动中）" "Yellow"
        Write-ColorOutput "   - 端点: $frontendUrl" "Gray"
    }
}

# 显示服务信息
function Show-ServiceInfo {
    $postgresHostPort = Get-HostPort -ContainerName "inspect-postgres-dev" -ContainerPort 5432 -EnvVarName "POSTGRES_HOST_PORT" -DefaultPort 15500
    $redisHostPort = Get-HostPort -ContainerName "inspect-redis-dev" -ContainerPort 6379 -EnvVarName "REDIS_HOST_PORT" -DefaultPort 16380
    $backendConfig = Get-BackendDevConfig -AllowMissingPort

    Write-ColorOutput "`n📊 开发环境服务信息:" "Blue"
    Write-ColorOutput "$('=' * 50)" "Cyan"
    
    Write-ColorOutput "`n🌐 Web 服务:" "Blue"
    Write-ColorOutput "  🎨 前端应用: http://localhost:3000" "White"
    if ($backendConfig.ServerPort -gt 0) {
        Write-ColorOutput "  🔧 后端 API: $($backendConfig.ApiUrl)" "White"
        Write-ColorOutput "  💚 健康检查: $($backendConfig.HealthUrl)" "White"
    } else {
        Write-ColorOutput "  ⚠️ 后端端口未配置: $($backendConfig.ErrorMessage)" "Yellow"
    }
    Write-ColorOutput "  📚 API 说明: docs/api/openapi.json" "White"
    Write-ColorOutput "  🔌 WS 约定: docs/api/websocket-contract.md" "White"
    
    Write-ColorOutput "`n🗄️ 数据库服务:" "Blue"
    Write-ColorOutput "  🐘 PostgreSQL: localhost:$postgresHostPort" "White"
    Write-ColorOutput "    - 数据库: inspect_system_dev" "Gray"
    Write-ColorOutput "    - 用户名: inspect_dev" "Gray"
    Write-ColorOutput "    - 密码: dev_password_2024" "Gray"
    Write-ColorOutput "  🔴 Redis: localhost:$redisHostPort" "White"
    Write-ColorOutput "    - 密码: dev_redis_2024" "Gray"
    
    Write-ColorOutput "`n🔧 管理工具:" "Blue"
    Write-ColorOutput "  🔧 pgAdmin: http://localhost:5050" "White"
    Write-ColorOutput "  🔧 Redis Commander: http://localhost:8081" "White"
    
    Write-ColorOutput "`n🛠️ 常用命令:" "Blue"
    Write-ColorOutput "  停止数据库: .\scripts\db-manage.ps1 stop" "White"
    Write-ColorOutput "  查看日志: .\scripts\db-manage.ps1 logs" "White"
    Write-ColorOutput "  重置数据库: .\scripts\db-manage.ps1 reset" "White"
    Write-ColorOutput "  运行测试: .\scripts\tests\run-tests.ps1" "White"
    if ($backendConfig.ServerPort -gt 0) {
        Write-ColorOutput "  健康检查: Invoke-WebRequest $($backendConfig.HealthUrl)" "White"
    }
    
    Write-ColorOutput "`n💡 提示:" "Yellow"
    Write-ColorOutput "  - 前端和后端服务在独立窗口中运行" "Gray"
    Write-ColorOutput "  - 使用 Ctrl+C 停止对应服务" "Gray"
    Write-ColorOutput "  - 修改代码后服务会自动重载" "Gray"
    Write-ColorOutput "  - 后端健康检查返回 JSON: {status, version, timestamp}" "Gray"
}

# 主执行函数
function Main {
    try {
        Write-ColorOutput "🚀 启动企业级网络设备巡检系统开发环境" "Green"
        Write-ColorOutput "服务范围: $Services" "Cyan"
        Write-ColorOutput "$('=' * 60)" "Cyan"

        if ($Diagnose) {
            Invoke-DevDiagnose
            return
        }
        
        # 检查前置条件
        Test-Prerequisites
        
        # 根据参数启动相应服务
        switch ($Services) {
            "database" {
                Start-DatabaseServices
            }
            "backend" {
                Start-DatabaseServices
                Start-BackendService
            }
            "frontend" {
                Start-FrontendService
            }
            "all" {
                Start-DatabaseServices
                Start-BackendService
                Start-FrontendService
            }
        }
        
        # 健康检查
        Test-ServicesHealth
        
        # 显示服务信息
        Show-ServiceInfo
        
        Write-ColorOutput "`n✅ 开发环境启动完成！" "Green"
        Write-ColorOutput "🎯 开始愉快的开发吧！" "Magenta"
        
    }
    catch {
        Write-ColorOutput "`n❌ 开发环境启动失败: $($_.Exception.Message)" "Red"
        Write-ColorOutput "请检查错误信息并重新运行脚本" "Yellow"
        Write-ColorOutput "或运行完整环境设置: .\scripts\development\setup-dev-env.ps1" "Cyan"
        exit 1
    }
}

# 执行主函数
Main
