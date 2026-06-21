[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$InstallRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [int]$TimeoutSeconds = 180
)

$ErrorActionPreference = "Stop"

$composeFile = Join-Path $InstallRoot "docker-compose.installer.yml"
$envFilePath = Join-Path $InstallRoot "config/.env"
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

function Get-EnvValue {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Name,
        [string]$DefaultValue = ""
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return $DefaultValue
    }

    foreach ($line in Get-Content -LiteralPath $Path) {
        if ($line -match "^\s*$([regex]::Escape($Name))\s*=\s*(.*)\s*$") {
            return $matches[1].Trim().Trim('"').Trim("'")
        }
    }

    return $DefaultValue
}

function Get-EndpointFromUrl {
    param(
        [string]$Url,
        [Parameter(Mandatory = $true)][string]$DefaultHost,
        [Parameter(Mandatory = $true)][int]$DefaultPort
    )

    $endpoint = [pscustomobject]@{
        Host = $DefaultHost
        Port = $DefaultPort
    }

    if ([string]::IsNullOrWhiteSpace($Url)) {
        return $endpoint
    }

    try {
        $uri = [System.Uri]$Url
        if (-not [string]::IsNullOrWhiteSpace($uri.Host)) {
            $endpoint.Host = $uri.Host
        }
        if ($uri.Port -gt 0) {
            $endpoint.Port = $uri.Port
        }
    } catch {
        Write-Host "Unable to parse service URL for host readiness check. Falling back to $DefaultHost`:$DefaultPort."
    }

    return $endpoint
}

function Test-TcpEndpoint {
    param(
        [Parameter(Mandatory = $true)][string]$HostName,
        [Parameter(Mandatory = $true)][int]$Port,
        [int]$TimeoutMilliseconds = 1000
    )

    $client = New-Object System.Net.Sockets.TcpClient
    $asyncResult = $null
    try {
        $asyncResult = $client.BeginConnect($HostName, $Port, $null, $null)
        if (-not $asyncResult.AsyncWaitHandle.WaitOne($TimeoutMilliseconds, $false)) {
            return $false
        }
        $client.EndConnect($asyncResult)
        return $true
    } catch {
        return $false
    } finally {
        if ($null -ne $asyncResult) {
            $asyncResult.AsyncWaitHandle.Close()
        }
        $client.Close()
    }
}

function Test-PostgresProtocolEndpoint {
    param(
        [Parameter(Mandatory = $true)][string]$HostName,
        [Parameter(Mandatory = $true)][int]$Port,
        [int]$TimeoutMilliseconds = 1000
    )

    $client = New-Object System.Net.Sockets.TcpClient
    $asyncResult = $null
    try {
        $asyncResult = $client.BeginConnect($HostName, $Port, $null, $null)
        if (-not $asyncResult.AsyncWaitHandle.WaitOne($TimeoutMilliseconds, $false)) {
            return $false
        }
        $client.EndConnect($asyncResult)

        $stream = $client.GetStream()
        $stream.ReadTimeout = $TimeoutMilliseconds
        $stream.WriteTimeout = $TimeoutMilliseconds

        # PostgreSQL SSLRequest: length=8, code=80877103。服务端应返回 S 或 N；
        # 若发布端口只接受 TCP 后立即断开，会在这里被识别为未就绪。
        [byte[]]$sslRequest = @(0, 0, 0, 8, 4, 210, 22, 47)
        $stream.Write($sslRequest, 0, $sslRequest.Length)

        $response = New-Object byte[] 1
        $read = $stream.Read($response, 0, 1)
        if ($read -ne 1) {
            return $false
        }

        return (($response[0] -eq [byte][char]'S') -or ($response[0] -eq [byte][char]'N'))
    } catch {
        return $false
    } finally {
        if ($null -ne $asyncResult) {
            $asyncResult.AsyncWaitHandle.Close()
        }
        $client.Close()
    }
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

if (-not (Test-Path -LiteralPath $envFilePath)) {
    throw "Runtime environment file not found: $envFilePath. Run prepare-env.ps1 first to generate config/.env (it provides POSTGRES_PASSWORD/REDIS_PASSWORD for the compose stack)."
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
    $composeUp = Invoke-DockerCommand -Arguments @("compose", "--env-file", $envFilePath, "-f", $composeFile, "--project-name", "inspect-installer", "up", "-d")
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
$postgresHostReady = $false
$postgresHostProtocolReady = $false
$redisHostReady = $false
$lastRuntimeError = ""
# Redis 就绪探测口令从运行时 .env 读取，与容器 --requirepass 同源（不再硬编码弱口令）。
$redisPassword = Get-EnvValue -Path $envFilePath -Name "REDIS_PASSWORD" -DefaultValue ""
$databaseEndpoint = Get-EndpointFromUrl -Url (Get-EnvValue -Path $envFilePath -Name "DATABASE_URL" -DefaultValue "") -DefaultHost "127.0.0.1" -DefaultPort 15500
$redisEndpoint = Get-EndpointFromUrl -Url (Get-EnvValue -Path $envFilePath -Name "REDIS_URL" -DefaultValue "") -DefaultHost "127.0.0.1" -DefaultPort 26380

while ((Get-Date) -lt $deadline) {
    if (-not $postgresReady) {
        $postgresCheck = Invoke-DockerCommand -Arguments @("exec", "inspect-postgres-installer", "pg_isready", "-U", "inspect_dev", "-d", "inspect_system_dev")
        $postgresReady = ($postgresCheck.ExitCode -eq 0)
    }
    if (-not $redisReady) {
        $redisPing = Invoke-DockerCommand -Arguments @("exec", "inspect-redis-installer", "redis-cli", "-a", $redisPassword, "ping")
        $redisReady = (($redisPing.ExitCode -eq 0) -and ($redisPing.Output -match "PONG"))
    }
    if ($postgresReady) {
        $postgresHostReady = Test-TcpEndpoint -HostName $databaseEndpoint.Host -Port $databaseEndpoint.Port
        if (-not $postgresHostReady) {
            $lastRuntimeError = "PostgreSQL host port is not ready: $($databaseEndpoint.Host):$($databaseEndpoint.Port)"
            $postgresHostProtocolReady = $false
        } else {
            $postgresHostProtocolReady = Test-PostgresProtocolEndpoint -HostName $databaseEndpoint.Host -Port $databaseEndpoint.Port
            if (-not $postgresHostProtocolReady) {
                $lastRuntimeError = "PostgreSQL host protocol is not ready: $($databaseEndpoint.Host):$($databaseEndpoint.Port)"
            }
        }
    }
    if ($redisReady) {
        $redisHostReady = Test-TcpEndpoint -HostName $redisEndpoint.Host -Port $redisEndpoint.Port
        if (-not $redisHostReady -and $postgresHostReady -and $postgresHostProtocolReady) {
            $lastRuntimeError = "Redis host port is not ready: $($redisEndpoint.Host):$($redisEndpoint.Port)"
        }
    }
    if ($postgresReady -and $redisReady -and $postgresHostReady -and $postgresHostProtocolReady -and $redisHostReady) {
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
    $composeStatus = Invoke-DockerOutput -Arguments @("compose", "--env-file", $envFilePath, "-f", $composeFile, "--project-name", "inspect-installer", "ps")
} catch {
    $composeStatus = $_.Exception.Message
}
try {
    $postgresLogs = Invoke-DockerOutput -Arguments @("logs", "--tail", "40", "inspect-postgres-installer")
} catch {
    $postgresLogs = $_.Exception.Message
}

throw "Database services did not become ready within $TimeoutSeconds seconds. Last readiness error: $lastRuntimeError`nCompose status:`n$composeStatus`nPostgreSQL logs:`n$postgresLogs"
