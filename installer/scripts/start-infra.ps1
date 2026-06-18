[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$InstallRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [int]$TimeoutSeconds = 180
)

$ErrorActionPreference = "Stop"

$composeFile = Join-Path $InstallRoot "docker-compose.installer.yml"
$requiredPostgresMajor = 16
$requiredTimescaleVersion = "2.15.3"

function Invoke-DockerOutput {
    param(
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    $result = Invoke-DockerCommand -Arguments $Arguments
    if ($result.ExitCode -ne 0) {
        throw "docker $($Arguments -join ' ') failed with exit code $($result.ExitCode). $($result.Output)"
    }

    return $result.Output
}

function Invoke-DockerCommand {
    param(
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    $processInfo = New-Object System.Diagnostics.ProcessStartInfo
    $processInfo.FileName = "docker"
    $processInfo.Arguments = (($Arguments | ForEach-Object { ConvertTo-NativeArgument $_ }) -join " ")
    $processInfo.RedirectStandardOutput = $true
    $processInfo.RedirectStandardError = $true
    $processInfo.UseShellExecute = $false
    $processInfo.CreateNoWindow = $true

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $processInfo
    [void]$process.Start()
    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()

    $outputParts = @()
    if (-not [string]::IsNullOrWhiteSpace($stdout)) {
        $outputParts += $stdout.Trim()
    }
    if (-not [string]::IsNullOrWhiteSpace($stderr)) {
        $outputParts += $stderr.Trim()
    }

    return [pscustomobject]@{
        ExitCode = $process.ExitCode
        Output = ($outputParts -join [Environment]::NewLine)
    }
}

function ConvertTo-NativeArgument {
    param([AllowNull()][string]$Value)

    if ($null -eq $Value) {
        return '""'
    }

    if ($Value -notmatch '[\s"]') {
        return $Value
    }

    $escaped = $Value -replace '"', '\"'
    return '"' + $escaped + '"'
}

function Assert-DatabaseRuntime {
    $serverVersion = Invoke-DockerOutput -Arguments @(
        "exec", "inspect-postgres-installer",
        "psql", "-U", "inspect_dev", "-d", "inspect_system_dev",
        "-tAc", "SHOW server_version;"
    )
    $serverVersionNumText = Invoke-DockerOutput -Arguments @(
        "exec", "inspect-postgres-installer",
        "psql", "-U", "inspect_dev", "-d", "inspect_system_dev",
        "-tAc", "SHOW server_version_num;"
    )
    $serverVersionNum = [int]$serverVersionNumText
    $postgresMajor = [math]::Floor($serverVersionNum / 10000)

    if ($postgresMajor -ne $requiredPostgresMajor) {
        throw "Unsupported PostgreSQL version: $serverVersion. Inspect installer requires PostgreSQL $requiredPostgresMajor.x from timescale/timescaledb:$requiredTimescaleVersion-pg$requiredPostgresMajor."
    }

    $timescaleVersion = Invoke-DockerOutput -Arguments @(
        "exec", "inspect-postgres-installer",
        "psql", "-U", "inspect_dev", "-d", "inspect_system_dev",
        "-tAc", "SELECT COALESCE(installed_version, default_version, '') FROM pg_available_extensions WHERE name = 'timescaledb';"
    )

    if ([string]::IsNullOrWhiteSpace($timescaleVersion)) {
        throw "TimescaleDB extension is not available in the database container. Inspect installer requires timescale/timescaledb:$requiredTimescaleVersion-pg$requiredPostgresMajor."
    }

    if ($timescaleVersion.Trim() -ne $requiredTimescaleVersion) {
        throw "Unsupported TimescaleDB version: $timescaleVersion. Inspect installer requires TimescaleDB $requiredTimescaleVersion with PostgreSQL $requiredPostgresMajor.x."
    }

    Write-Host "Database runtime verified: PostgreSQL $serverVersion, TimescaleDB $($timescaleVersion.Trim())."
}

if (-not (Test-Path -LiteralPath $composeFile)) {
    throw "Docker Compose file not found: $composeFile"
}

if ($WhatIfPreference) {
    if ($PSCmdlet.ShouldProcess($composeFile, "Start TimescaleDB/PostgreSQL and Redis")) {}
    return
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker CLI not found. Please install and start Docker Desktop, then run Inspect again."
}

try {
    $dockerInfo = Invoke-DockerCommand -Arguments @("info")
    if ($dockerInfo.ExitCode -ne 0) {
        throw "docker info failed. $($dockerInfo.Output)"
    }
} catch {
    throw "Docker is not running. Please start Docker Desktop, then run Inspect again."
}

if ($PSCmdlet.ShouldProcess($composeFile, "Start TimescaleDB/PostgreSQL and Redis")) {
    $composeUp = Invoke-DockerCommand -Arguments @("compose", "-f", $composeFile, "--project-name", "inspect-installer", "up", "-d")
    if (-not [string]::IsNullOrWhiteSpace($composeUp.Output)) {
        Write-Host $composeUp.Output
    }
    if ($composeUp.ExitCode -ne 0) {
        throw "docker compose up failed with exit code $($composeUp.ExitCode). $($composeUp.Output)"
    }
}

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$postgresReady = $false
$redisReady = $false
$lastRuntimeError = ""

while ((Get-Date) -lt $deadline) {
    if (-not $postgresReady) {
        $postgresCheck = Invoke-DockerCommand -Arguments @("exec", "inspect-postgres-installer", "pg_isready", "-U", "inspect_dev", "-d", "inspect_system_dev")
        $postgresReady = ($postgresCheck.ExitCode -eq 0)
    }
    if (-not $redisReady) {
        $redisPing = Invoke-DockerCommand -Arguments @("exec", "inspect-redis-installer", "redis-cli", "-a", "dev_redis_2024", "ping")
        $redisReady = (($redisPing.ExitCode -eq 0) -and ($redisPing.Output -match "PONG"))
    }
    if ($postgresReady -and $redisReady) {
        try {
            Assert-DatabaseRuntime
            Write-Host "Database services are ready."
            return
        } catch {
            $lastRuntimeError = $_.Exception.Message
            Write-Host "Database runtime check is waiting for PostgreSQL initialization to settle."
        }
    }
    Start-Sleep -Seconds 3
}

$composeStatus = ""
$postgresLogs = ""
try {
    $composeStatus = Invoke-DockerOutput -Arguments @("compose", "-f", $composeFile, "--project-name", "inspect-installer", "ps")
} catch {
    $composeStatus = $_.Exception.Message
}
try {
    $postgresLogs = Invoke-DockerOutput -Arguments @("logs", "--tail", "40", "inspect-postgres-installer")
} catch {
    $postgresLogs = $_.Exception.Message
}

throw "Database services did not become ready within $TimeoutSeconds seconds.`nLast runtime check error:`n$lastRuntimeError`nCompose status:`n$composeStatus`nPostgreSQL logs:`n$postgresLogs"
