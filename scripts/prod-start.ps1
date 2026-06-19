#!/usr/bin/env pwsh
<#
.SYNOPSIS
    生产环境 Docker Compose 启动脚本

.DESCRIPTION
    基于 docker-compose.prod.yml 启动、停止、查看生产环境服务。
    默认只启动核心服务；如需 Nginx 或监控组件，需要显式开启对应 profile。

.PARAMETER Action
    执行动作：start、stop、restart、status、logs、build、pull、config、down。

.PARAMETER EnvFile
    指定生产环境变量文件。未指定时使用 .env.production（缺失时按 .env.example 自动生成）。

.PARAMETER WithNginx
    启用 with-nginx profile，启动 Nginx 反向代理。

.PARAMETER Monitoring
    启用 monitoring profile，启动 Prometheus 与 Grafana。

.PARAMETER Service
    限定要操作的服务名称，例如 backend、frontend、postgres。

.PARAMETER Build
    start 动作执行 up 时追加 --build。

.PARAMETER Pull
    start 动作执行 up 前先拉取镜像。

.PARAMETER Follow
    logs 动作持续跟随日志。

.PARAMETER Tail
    logs 动作输出的日志行数。

.PARAMETER Wait
    start 动作完成后等待服务启动的秒数。

.PARAMETER NoDetach
    start 动作不使用 -d，直接前台运行。

.PARAMETER RemoveVolumes
    down 动作追加 -v，删除生产数据卷。该参数风险较高，默认不开启。

.PARAMETER SkipConfigCheck
    跳过生产必需环境变量检查。仅用于紧急排查。

.PARAMETER DryRun
    只打印将执行的 docker compose 命令，不实际执行。

.EXAMPLE
    .\scripts\prod-start.ps1
    使用 .env.production 或 .env 启动生产核心服务。

.EXAMPLE
    .\scripts\prod-start.ps1 -WithNginx -Monitoring
    启动生产核心服务，并启用 Nginx 与监控 profile。

.EXAMPLE
    .\scripts\prod-start.ps1 -Action logs -Service backend -Follow
    持续查看生产后端日志。
#>

[CmdletBinding()]
param(
    [ValidateSet("start", "stop", "restart", "status", "logs", "build", "pull", "config", "down")]
    [string]$Action = "start",

    [string]$EnvFile,

    [switch]$WithNginx,

    [switch]$Monitoring,

    [string[]]$Service = @(),

    [switch]$Build,

    [switch]$Pull,

    [switch]$Follow,

    [ValidateRange(1, 5000)]
    [int]$Tail = 200,

    [ValidateRange(0, 600)]
    [int]$Wait = 20,

    [switch]$NoDetach,

    [switch]$RemoveVolumes,

    [switch]$SkipConfigCheck,

    [switch]$DryRun,

    [switch]$Help
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$Script:ProjectRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($Script:ProjectRoot)) {
    $Script:ProjectRoot = (Get-Location).Path
}
$Script:ComposeFile = Join-Path $Script:ProjectRoot "docker-compose.prod.yml"
$Script:SelectedEnvFile = $null
$Script:ComposeExecutable = $null
$Script:ComposePrefixArgs = @()
$Script:EnvValues = @{}

function Write-ColorOutput {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Message,

        [ValidateSet("Red", "Green", "Yellow", "Blue", "Cyan", "Magenta", "White", "Gray")]
        [string]$Color = "White"
    )

    $colorMap = @{
        Red     = [ConsoleColor]::Red
        Green   = [ConsoleColor]::Green
        Yellow  = [ConsoleColor]::Yellow
        Blue    = [ConsoleColor]::Blue
        Cyan    = [ConsoleColor]::Cyan
        Magenta = [ConsoleColor]::Magenta
        White   = [ConsoleColor]::White
        Gray    = [ConsoleColor]::DarkGray
    }

    Write-Host $Message -ForegroundColor $colorMap[$Color]
}

function Show-Help {
    Write-ColorOutput "企业级网络设备巡检系统 - 生产环境管理脚本" "Cyan"
    Write-Host ""
    Write-Host "用法:"
    Write-Host "  .\scripts\prod-start.ps1 [-Action <动作>] [选项]"
    Write-Host ""
    Write-Host "动作:"
    Write-Host "  start    启动生产服务（默认）"
    Write-Host "  stop     停止生产服务"
    Write-Host "  restart  重启生产服务"
    Write-Host "  status   查看生产服务状态"
    Write-Host "  logs     查看生产服务日志"
    Write-Host "  build    构建生产镜像"
    Write-Host "  pull     拉取生产镜像"
    Write-Host "  config   校验并输出 Compose 配置"
    Write-Host "  down     下线生产服务（如需删卷必须显式使用 -RemoveVolumes）"
    Write-Host ""
    Write-Host "常用选项:"
    Write-Host "  -EnvFile <file>     指定环境变量文件，默认使用 .env.production（缺失时按 .env.example 自动生成）"
    Write-Host "  -WithNginx          启用 with-nginx profile"
    Write-Host "  -Monitoring         启用 monitoring profile"
    Write-Host "  -Service <name[]>   限定服务，例如 backend, frontend"
    Write-Host "  -Pull               start 前先拉取镜像"
    Write-Host "  -Build              start 时追加 --build"
    Write-Host "  -Follow             logs 时持续跟随日志"
    Write-Host "  -Tail <n>           logs 输出行数，默认 200"
    Write-Host "  -Wait <seconds>     start 后等待秒数，默认 20"
    Write-Host "  -NoDetach           start 时前台运行"
    Write-Host "  -SkipConfigCheck    跳过生产必需环境变量检查"
    Write-Host "  -DryRun             只打印命令，不实际执行"
    Write-Host "  -Help               显示帮助"
    Write-Host ""
    Write-Host "示例:"
    Write-Host "  .\scripts\prod-start.ps1"
    Write-Host "  .\scripts\prod-start.ps1 -EnvFile .env.production -Pull -Build"
    Write-Host "  .\scripts\prod-start.ps1 -WithNginx -Monitoring"
    Write-Host "  .\scripts\prod-start.ps1 -Action status"
    Write-Host "  .\scripts\prod-start.ps1 -Action logs -Service backend -Follow"
    Write-Host "  .\scripts\prod-start.ps1 -Action config"
    Write-Host "  .\scripts\prod-start.ps1 -DryRun"
    Write-Host ""
}

function Get-DotEnvMap {
    param([string]$Path)

    $map = @{}
    if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path)) {
        return $map
    }

    foreach ($line in Get-Content -LiteralPath $Path) {
        $trimmed = $line.Trim()
        if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed.StartsWith("#")) {
            continue
        }

        $parts = $trimmed -split "=", 2
        if ($parts.Count -ne 2) {
            continue
        }

        $name = $parts[0].Trim()
        if ([string]::IsNullOrWhiteSpace($name)) {
            continue
        }

        $value = $parts[1].Trim()
        if ($value.Length -ge 2) {
            $quote = $value.Substring(0, 1)
            if (($quote -eq '"' -or $quote -eq "'") -and $value.EndsWith($quote)) {
                $value = $value.Substring(1, $value.Length - 2)
            }
        }

        $map[$name] = $value
    }

    return $map
}

function Get-ConfigValue {
    param([Parameter(Mandatory = $true)][string]$Name)

    $envValue = [Environment]::GetEnvironmentVariable($Name)
    if (-not [string]::IsNullOrWhiteSpace($envValue)) {
        return $envValue
    }

    if ($Script:EnvValues.ContainsKey($Name)) {
        return $Script:EnvValues[$Name]
    }

    return ""
}

# 未通过 -EnvFile 指定时，确保 .env.production 存在：缺失则按 .env.example 模板生成。
function Initialize-ProductionEnvFile {
    if (-not [string]::IsNullOrWhiteSpace($EnvFile)) {
        return
    }

    $productionEnv = Join-Path $Script:ProjectRoot ".env.production"
    if (Test-Path -LiteralPath $productionEnv) {
        return
    }

    $examplePath = Join-Path $Script:ProjectRoot ".env.example"
    if (-not (Test-Path -LiteralPath $examplePath)) {
        throw "缺少环境模板文件 .env.example，无法生成 .env.production"
    }

    Copy-Item -LiteralPath $examplePath -Destination $productionEnv -Force
    Write-ColorOutput "✅ 已按 .env.example 生成生产环境配置: .env.production" "Green"
    Write-ColorOutput "⚠️ 请先在 .env.production 中填写生产级配置（NODE_ENV=production、DEBUG=false、强随机 SECRET_KEY/JWT_SECRET_KEY、POSTGRES_PASSWORD、REDIS_PASSWORD、真实域名等）后重新运行。" "Yellow"
}

function Resolve-ProductionEnvFile {
    if (-not [string]::IsNullOrWhiteSpace($EnvFile)) {
        $candidate = if ([IO.Path]::IsPathRooted($EnvFile)) { $EnvFile } else { Join-Path $Script:ProjectRoot $EnvFile }
        if (-not (Test-Path -LiteralPath $candidate)) {
            throw "指定的环境变量文件不存在: $candidate"
        }
        return (Resolve-Path -LiteralPath $candidate).ProviderPath
    }

    $productionEnv = Join-Path $Script:ProjectRoot ".env.production"
    if (Test-Path -LiteralPath $productionEnv) {
        return (Resolve-Path -LiteralPath $productionEnv).ProviderPath
    }

    return $null
}

function Initialize-DockerComposeCommand {
    $docker = Get-Command "docker" -ErrorAction SilentlyContinue
    if ($docker) {
        & docker compose version *> $null
        if ($LASTEXITCODE -eq 0) {
            $Script:ComposeExecutable = "docker"
            $Script:ComposePrefixArgs = @("compose")
            return
        }
    }

    $dockerCompose = Get-Command "docker-compose" -ErrorAction SilentlyContinue
    if ($dockerCompose) {
        $Script:ComposeExecutable = "docker-compose"
        $Script:ComposePrefixArgs = @()
        return
    }

    throw "未找到 docker compose 或 docker-compose，请先安装 Docker。"
}

function Get-ComposeBaseArgs {
    $args = @()
    $args += $Script:ComposePrefixArgs

    if ($Script:SelectedEnvFile) {
        $args += @("--env-file", $Script:SelectedEnvFile)
    }

    $args += @("-f", $Script:ComposeFile)

    if ($WithNginx) {
        $args += @("--profile", "with-nginx")
    }

    if ($Monitoring) {
        $args += @("--profile", "monitoring")
    }

    return $args
}

function Format-CommandPreview {
    param([string[]]$ComposeArgs)

    $items = @($Script:ComposeExecutable) + $ComposeArgs
    return ($items | ForEach-Object {
        if ($_ -match '\s') {
            '"' + $_.Replace('"', '\"') + '"'
        } else {
            $_
        }
    }) -join " "
}

function Invoke-Compose {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$ComposeArgs,

        [Parameter(Mandatory = $true)]
        [string]$Description
    )

    $preview = Format-CommandPreview -ComposeArgs $ComposeArgs
    Write-ColorOutput "执行: $preview" "Gray"

    if ($DryRun) {
        Write-ColorOutput "预览模式：已跳过 $Description" "Yellow"
        return
    }

    Push-Location $Script:ProjectRoot
    try {
        & $Script:ComposeExecutable @ComposeArgs
        if ($LASTEXITCODE -ne 0) {
            throw "$Description 失败，退出代码: $LASTEXITCODE"
        }
    } finally {
        Pop-Location
    }
}

function Test-ProductionConfig {
    if ($SkipConfigCheck) {
        Write-ColorOutput "已跳过生产环境变量检查。" "Yellow"
        return
    }

    $required = @("POSTGRES_PASSWORD", "REDIS_PASSWORD", "SECRET_KEY", "JWT_SECRET_KEY")
    if ($Monitoring) {
        $required += "GRAFANA_ADMIN_PASSWORD"
    }

    $missing = @()
    foreach ($name in $required) {
        $value = Get-ConfigValue -Name $name
        if ([string]::IsNullOrWhiteSpace($value)) {
            $missing += $name
        }
    }

    if ($missing.Count -gt 0) {
        throw "缺少生产环境必需变量: $($missing -join ', ')。请在 .env.production 或系统环境变量中配置。"
    }

    $weakSecrets = @()
    foreach ($name in @("SECRET_KEY", "JWT_SECRET_KEY", "GRAFANA_ADMIN_PASSWORD")) {
        $value = Get-ConfigValue -Name $name
        if ([string]::IsNullOrWhiteSpace($value)) {
            continue
        }
        if ($value -match "your-|change-in-production|admin|password|secret") {
            $weakSecrets += $name
        }
    }

    if ($weakSecrets.Count -gt 0) {
        throw "发现疑似默认或弱生产密钥: $($weakSecrets -join ', ')。请替换为强随机值。"
    }

    $warningDefaults = @(
        @{ Name = "NEXT_PUBLIC_API_URL"; DefaultPattern = "yourdomain.com|localhost|127\.0\.0\.1" },
        @{ Name = "NEXT_PUBLIC_WS_URL"; DefaultPattern = "yourdomain.com|localhost|127\.0\.0\.1" },
        @{ Name = "CORS_ORIGINS"; DefaultPattern = "yourdomain.com|localhost|127\.0\.0\.1|\[\s*`"\*`"\s*\]" },
        @{ Name = "ALLOWED_HOSTS"; DefaultPattern = "yourdomain.com|localhost|127\.0\.0\.1|\*" }
    )

    foreach ($item in $warningDefaults) {
        $value = Get-ConfigValue -Name $item.Name
        if ([string]::IsNullOrWhiteSpace($value)) {
            Write-ColorOutput "警告: $($item.Name) 未显式配置，将使用 docker-compose.prod.yml 中的默认值。" "Yellow"
            continue
        }
        if ($value -match $item.DefaultPattern) {
            Write-ColorOutput "警告: $($item.Name) 当前值可能不适合生产环境: $value" "Yellow"
        }
    }
}

function Test-ProductionFiles {
    if (-not (Test-Path -LiteralPath $Script:ComposeFile)) {
        throw "未找到生产 Compose 文件: $Script:ComposeFile"
    }

    $requiredPaths = @(
        "backend-go/Dockerfile",
        "frontend/Dockerfile.prod",
        "database/database-init-complete.sql",
        "database/builtin-templates-complete.sql",
        "config/postgres/postgresql.conf"
    )

    foreach ($relativePath in $requiredPaths) {
        $fullPath = Join-Path $Script:ProjectRoot $relativePath
        if (-not (Test-Path -LiteralPath $fullPath)) {
            throw "生产启动所需文件不存在: $relativePath"
        }
    }

    if ($WithNginx) {
        $nginxPaths = @(
            "config/nginx/nginx.conf",
            "config/nginx/conf.d",
            "ssl"
        )
        foreach ($relativePath in $nginxPaths) {
            $fullPath = Join-Path $Script:ProjectRoot $relativePath
            if (-not (Test-Path -LiteralPath $fullPath)) {
                if ($DryRun) {
                    Write-ColorOutput "预览警告: 启用 -WithNginx 前请先准备生产 Nginx 配置: $relativePath" "Yellow"
                    continue
                }
                throw "启用 -WithNginx 前请先准备生产 Nginx 配置: $relativePath"
            }
        }
    }
}

function Show-StartupSummary {
    Write-Host ""
    Write-ColorOutput "生产环境启动参数" "Cyan"
    Write-ColorOutput "  Compose: docker-compose.prod.yml" "White"
    if ($Script:SelectedEnvFile) {
        Write-ColorOutput "  EnvFile: $(Resolve-Path -LiteralPath $Script:SelectedEnvFile -Relative)" "White"
    } else {
        Write-ColorOutput "  EnvFile: 未使用文件，仅使用当前进程环境变量" "Yellow"
    }
    Write-ColorOutput "  Profiles: $(if ($WithNginx -or $Monitoring) { @($(if ($WithNginx) { 'with-nginx' }), $(if ($Monitoring) { 'monitoring' })) -join ', ' } else { 'default' })" "White"
    if ($Service.Count -gt 0) {
        Write-ColorOutput "  Services: $($Service -join ', ')" "White"
    }
    Write-Host ""
}

function Start-ProductionServices {
    if ($Pull) {
        Invoke-Compose -ComposeArgs ((Get-ComposeBaseArgs) + @("pull") + $Service) -Description "拉取生产镜像"
    }

    $upArgs = (Get-ComposeBaseArgs) + @("up")
    if (-not $NoDetach) {
        $upArgs += "-d"
    }
    if ($Build) {
        $upArgs += "--build"
    }
    $upArgs += $Service

    Invoke-Compose -ComposeArgs $upArgs -Description "启动生产服务"

    if (-not $DryRun -and -not $NoDetach -and $Wait -gt 0) {
        Write-ColorOutput "等待服务启动 $Wait 秒..." "Yellow"
        Start-Sleep -Seconds $Wait
        Invoke-Compose -ComposeArgs ((Get-ComposeBaseArgs) + @("ps")) -Description "查看生产服务状态"
    }
}

function Invoke-ProductionAction {
    switch ($Action) {
        "start" {
            Start-ProductionServices
        }
        "stop" {
            Invoke-Compose -ComposeArgs ((Get-ComposeBaseArgs) + @("stop") + $Service) -Description "停止生产服务"
        }
        "restart" {
            Invoke-Compose -ComposeArgs ((Get-ComposeBaseArgs) + @("restart") + $Service) -Description "重启生产服务"
        }
        "status" {
            Invoke-Compose -ComposeArgs ((Get-ComposeBaseArgs) + @("ps") + $Service) -Description "查看生产服务状态"
        }
        "logs" {
            $args = (Get-ComposeBaseArgs) + @("logs", "--tail", "$Tail")
            if ($Follow) {
                $args += "-f"
            }
            $args += $Service
            Invoke-Compose -ComposeArgs $args -Description "查看生产服务日志"
        }
        "build" {
            Invoke-Compose -ComposeArgs ((Get-ComposeBaseArgs) + @("build") + $Service) -Description "构建生产镜像"
        }
        "pull" {
            Invoke-Compose -ComposeArgs ((Get-ComposeBaseArgs) + @("pull") + $Service) -Description "拉取生产镜像"
        }
        "config" {
            Invoke-Compose -ComposeArgs ((Get-ComposeBaseArgs) + @("config")) -Description "校验生产 Compose 配置"
        }
        "down" {
            if ($Service.Count -gt 0) {
                throw "docker compose down 不支持指定单个服务；如需停止单个服务请使用 -Action stop -Service <name>。"
            }
            $args = (Get-ComposeBaseArgs) + @("down")
            if ($RemoveVolumes) {
                Write-ColorOutput "警告: -RemoveVolumes 会删除生产数据卷，请确认已完成备份。" "Red"
                $args += "-v"
            }
            $args += $Service
            Invoke-Compose -ComposeArgs $args -Description "下线生产服务"
        }
    }
}

function Main {
    Write-Host ""
    Write-ColorOutput "企业级网络设备巡检系统 - 生产环境管理" "Cyan"
    Write-ColorOutput "========================================" "Cyan"

    if ($Help) {
        Show-Help
        return
    }

    Initialize-ProductionEnvFile
    $Script:SelectedEnvFile = Resolve-ProductionEnvFile
    if ($Script:SelectedEnvFile) {
        $Script:EnvValues = Get-DotEnvMap -Path $Script:SelectedEnvFile
    }

    Test-ProductionFiles
    Initialize-DockerComposeCommand
    Test-ProductionConfig
    Show-StartupSummary
    Invoke-ProductionAction
}

Main
