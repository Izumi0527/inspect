[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$InstallRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"

$envFile = Join-Path $InstallRoot "config/.env"
$runtimeSeedSql = Join-Path $InstallRoot "database/inspect-runtime-seed.sql"
$databaseInitSql = Join-Path $InstallRoot "database/database-init-complete.sql"
$templatesSql = Join-Path $InstallRoot "database/builtin-templates-complete.sql"

if (-not (Test-Path -LiteralPath $envFile)) {
    if ($WhatIfPreference) {
        Write-Host "What if: Runtime .env file would exist after prepare-env.ps1: $envFile"
    } else {
        throw "Runtime .env file not found: $envFile"
    }
}

$sqlFiles = @(
    @{ LocalPath = $runtimeSeedSql; ContainerPath = "/tmp/inspect-runtime-seed.sql"; Description = "Seed RBAC roles, permissions and default admin user" },
    @{ LocalPath = $databaseInitSql; ContainerPath = "/tmp/database-init-complete.sql"; Description = "Run complete database initialization SQL" },
    @{ LocalPath = $templatesSql; ContainerPath = "/tmp/builtin-templates-complete.sql"; Description = "Run built-in inspection templates SQL" }
)

foreach ($item in $sqlFiles) {
    if (-not (Test-Path -LiteralPath $item.LocalPath)) {
        throw "SQL file not found: $($item.LocalPath)"
    }
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

function Invoke-SqlFileInPostgres {
    param(
        [Parameter(Mandatory = $true)][string]$LocalPath,
        [Parameter(Mandatory = $true)][string]$ContainerPath
    )

    $copyResult = Invoke-DockerCommand -Arguments @("cp", $LocalPath, ("inspect-postgres-installer:" + $ContainerPath))
    if (-not [string]::IsNullOrWhiteSpace($copyResult.Output)) {
        Write-Host $copyResult.Output
    }
    if ($copyResult.ExitCode -ne 0) {
        throw "docker cp failed for $LocalPath with exit code $($copyResult.ExitCode). $($copyResult.Output)"
    }

    $psqlResult = Invoke-DockerCommand -Arguments @(
        "exec", "inspect-postgres-installer",
        "psql", "-U", "inspect_dev", "-d", "inspect_system_dev",
        "-v", "ON_ERROR_STOP=1",
        "-f", $ContainerPath
    )
    if (-not [string]::IsNullOrWhiteSpace($psqlResult.Output)) {
        Write-Host $psqlResult.Output
    }
    if ($psqlResult.ExitCode -ne 0) {
        throw "psql failed for $ContainerPath with exit code $($psqlResult.ExitCode). $($psqlResult.Output)"
    }
}

foreach ($item in $sqlFiles) {
    if ($PSCmdlet.ShouldProcess($item.LocalPath, $item.Description)) {
        Invoke-SqlFileInPostgres -LocalPath $item.LocalPath -ContainerPath $item.ContainerPath
    }
}

if ($WhatIfPreference) {
    Write-Host "What if: Database initialization would run."
} else {
    Write-Host "Database initialized."
}
