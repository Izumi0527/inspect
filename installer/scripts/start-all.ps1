[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$InstallRoot = "",
    [int]$FrontendPort = 13000,
    [string]$FrontendHostname = "0.0.0.0",
    [switch]$SkipInfra,
    [switch]$SkipDatabaseInit
)

$ErrorActionPreference = "Stop"

function Resolve-InstallRoot {
    param([string]$Root)

    if ([string]::IsNullOrWhiteSpace($Root)) {
        $Root = Join-Path $PSScriptRoot ".."
    }

    try {
        return (Resolve-Path -LiteralPath $Root -ErrorAction Stop).Path
    } catch {
        return [System.IO.Path]::GetFullPath($Root)
    }
}

function New-WritableLogDirectory {
    param([Parameter(Mandatory = $true)][string]$Root)

    $candidates = New-Object System.Collections.Generic.List[string]
    $candidates.Add((Join-Path $Root "logs"))

    if (-not [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
        $candidates.Add((Join-Path $env:LOCALAPPDATA "Inspect/logs"))
    }

    $candidates.Add((Join-Path ([System.IO.Path]::GetTempPath()) "Inspect/logs"))

    $failures = New-Object System.Collections.Generic.List[string]
    foreach ($candidate in $candidates) {
        try {
            New-Item -ItemType Directory -Force -Path $candidate -ErrorAction Stop | Out-Null
            $probe = Join-Path $candidate (".write-test-{0}.tmp" -f $PID)
            Set-Content -LiteralPath $probe -Value "ok" -Encoding UTF8 -ErrorAction Stop
            Remove-Item -LiteralPath $probe -Force -ErrorAction SilentlyContinue
            return (Resolve-Path -LiteralPath $candidate -ErrorAction Stop).Path
        } catch {
            $failures.Add(("{0}: {1}" -f $candidate, $_.Exception.Message))
        }
    }

    throw "Unable to create a writable startup log directory. Tried: $($failures -join '; ')"
}

function Write-StartupLog {
    param(
        [Parameter(Mandatory = $true)][string]$Message,
        [string]$Level = "INFO"
    )

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss.fff"
    $lines = $Message -split "(`r`n|`n|`r)"
    foreach ($line in $lines) {
        if ($null -eq $line) {
            continue
        }
        $entry = "{0} [{1}] {2}" -f $timestamp, $Level, $line
        Add-Content -LiteralPath $script:StartupLogPath -Value $entry -Encoding UTF8
        Write-Host $entry
    }
}

function Invoke-StartupStep {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][scriptblock]$Action
    )

    Write-StartupLog "Start step: $Name"
    try {
        $output = & $Action *>&1
        foreach ($item in @($output)) {
            if ($null -ne $item) {
                Write-StartupLog (($item | Out-String).TrimEnd()) "OUTPUT"
            }
        }
        Write-StartupLog "Step completed: $Name"
    } catch {
        Write-StartupLog "Step failed: $Name" "ERROR"
        Write-StartupLog $_.Exception.Message "ERROR"
        if ($_.ScriptStackTrace) {
            Write-StartupLog $_.ScriptStackTrace "ERROR"
        }
        throw
    }
}

$InstallRoot = Resolve-InstallRoot -Root $InstallRoot
$startupLogDir = New-WritableLogDirectory -Root $InstallRoot
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$script:StartupLogPath = Join-Path $startupLogDir ("start-all-{0}.log" -f $timestamp)
$latestStartupLogPath = Join-Path $startupLogDir "start-all.latest.log"

Set-Content -LiteralPath $script:StartupLogPath -Value @(
    "Inspect startup log",
    "CreatedAt=$(Get-Date -Format o)",
    "InstallRoot=$InstallRoot",
    "LogDirectory=$startupLogDir"
) -Encoding UTF8

$prepareEnvScript = Join-Path $PSScriptRoot "prepare-env.ps1"
$infraScript = Join-Path $PSScriptRoot "start-infra.ps1"
$databaseScript = Join-Path $PSScriptRoot "init-database.ps1"
$backendScript = Join-Path $PSScriptRoot "start-backend.ps1"
$frontendScript = Join-Path $PSScriptRoot "start-frontend.ps1"

try {
    Write-StartupLog "InstallRoot: $InstallRoot"
    $versionFile = Join-Path $InstallRoot "VERSION"
    if (Test-Path -LiteralPath $versionFile) {
        $inspectVersion = (Get-Content -LiteralPath $versionFile -Raw).Trim()
        Write-StartupLog "Inspect v$inspectVersion"
    }
    Write-StartupLog "Startup log: $script:StartupLogPath"
    if ($startupLogDir -ne (Join-Path $InstallRoot "logs")) {
        Write-StartupLog "Install logs directory is not writable. Fallback log directory: $startupLogDir" "WARN"
    }

    Invoke-StartupStep -Name "prepare environment" -Action {
        & $prepareEnvScript -InstallRoot $InstallRoot -WhatIf:$WhatIfPreference
    }

    if (-not $SkipInfra) {
        Invoke-StartupStep -Name "start infrastructure" -Action {
            & $infraScript -InstallRoot $InstallRoot -WhatIf:$WhatIfPreference
        }
    } else {
        Write-StartupLog "Skip step: start infrastructure"
    }

    Invoke-StartupStep -Name "start backend" -Action {
        & $backendScript -InstallRoot $InstallRoot -WhatIf:$WhatIfPreference
    }

    if (-not $SkipDatabaseInit) {
        Invoke-StartupStep -Name "initialize database" -Action {
            & $databaseScript -InstallRoot $InstallRoot -WhatIf:$WhatIfPreference
        }
    } else {
        Write-StartupLog "Skip step: initialize database"
    }

    Invoke-StartupStep -Name "start frontend" -Action {
        & $frontendScript -InstallRoot $InstallRoot -Port $FrontendPort -Hostname $FrontendHostname -WhatIf:$WhatIfPreference
    }

    if (-not $WhatIfPreference) {
        Write-StartupLog "Inspect started."
        Write-StartupLog "Frontend URL: http://localhost:$FrontendPort"
    }
} catch {
    Write-StartupLog "Inspect startup failed. See startup log: $script:StartupLogPath" "ERROR"
    throw
} finally {
    Copy-Item -LiteralPath $script:StartupLogPath -Destination $latestStartupLogPath -Force -ErrorAction SilentlyContinue
}
