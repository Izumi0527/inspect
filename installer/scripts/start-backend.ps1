[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$InstallRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [int]$TimeoutSeconds = 120
)

$ErrorActionPreference = "Stop"

$backendExe = Join-Path $InstallRoot "backend/app.exe"
$configDir = Join-Path $InstallRoot "config"
$envFile = Join-Path $configDir ".env"
$envExampleFile = Join-Path $configDir ".env.example"
$logsDir = Join-Path $InstallRoot "logs"
$pidFile = Join-Path $logsDir "backend.pid"
$stdoutLog = Join-Path $logsDir "backend.stdout.log"
$stderrLog = Join-Path $logsDir "backend.stderr.log"

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

function Read-EnvFile {
    param([Parameter(Mandatory = $true)][string]$Path)

    $values = @{}
    if (-not (Test-Path -LiteralPath $Path)) {
        return $values
    }

    foreach ($line in Get-Content -LiteralPath $Path) {
        $normalizedLine = ($line -replace "^\uFEFF", "").Trim()
        if ($normalizedLine -eq "" -or $normalizedLine.StartsWith("#")) {
            continue
        }
        if ($normalizedLine -match "^\s*(?:export\s+)?([^#=\s]+)\s*=\s*(.*)\s*$") {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
                $value = $value.Substring(1, $value.Length - 2)
            }
            $values[$key] = $value
        }
    }

    return $values
}

function Set-EnvVarsFromFile {
    param([Parameter(Mandatory = $true)][string]$Path)

    $values = Read-EnvFile -Path $Path
    foreach ($key in $values.Keys) {
        Set-Item -Path ("Env:{0}" -f $key) -Value $values[$key]
    }

    return $values
}

function Test-PathInsideRoot {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Root
    )

    $fullPath = [System.IO.Path]::GetFullPath($Path).TrimEnd("\", "/")
    $fullRoot = [System.IO.Path]::GetFullPath($Root).TrimEnd("\", "/")
    return $fullPath.Equals($fullRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
        $fullPath.StartsWith($fullRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)
}

function Resolve-InstallerRuntimePath {
    param(
        [string]$Value,
        [Parameter(Mandatory = $true)][string]$DefaultRelativePath,
        [Parameter(Mandatory = $true)][string]$InstallRoot,
        [Parameter(Mandatory = $true)][string]$ConfigDir
    )

    $rawValue = $Value
    if ([string]::IsNullOrWhiteSpace($rawValue)) {
        $rawValue = $DefaultRelativePath
    }
    $trimmedValue = $rawValue.Trim().Trim('"').Trim("'")

    if ([System.IO.Path]::IsPathRooted($trimmedValue)) {
        return [System.IO.Path]::GetFullPath($trimmedValue)
    }

    $baseDir = $InstallRoot
    if ($trimmedValue -match '^\.\.[/\\]') {
        $baseDir = $ConfigDir
    }

    $resolvedPath = [System.IO.Path]::GetFullPath((Join-Path $baseDir $trimmedValue))
    if (-not (Test-PathInsideRoot -Path $resolvedPath -Root $InstallRoot)) {
        $resolvedPath = [System.IO.Path]::GetFullPath((Join-Path $InstallRoot $DefaultRelativePath))
    }

    return $resolvedPath
}

function Set-InstallerPathEnv {
    param(
        [Parameter(Mandatory = $true)][hashtable]$Values,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$DefaultRelativePath,
        [Parameter(Mandatory = $true)][string]$InstallRoot,
        [Parameter(Mandatory = $true)][string]$ConfigDir,
        [switch]$FilePath
    )

    $rawValue = ""
    if ($Values.ContainsKey($Name)) {
        $rawValue = $Values[$Name]
    }

    $resolvedPath = Resolve-InstallerRuntimePath -Value $rawValue -DefaultRelativePath $DefaultRelativePath -InstallRoot $InstallRoot -ConfigDir $ConfigDir
    $Values[$Name] = $resolvedPath
    Set-Item -Path ("Env:{0}" -f $Name) -Value $resolvedPath

    $directory = $resolvedPath
    if ($FilePath) {
        $directory = Split-Path -Parent $resolvedPath
    }
    if (-not [string]::IsNullOrWhiteSpace($directory)) {
        New-Item -ItemType Directory -Force -Path $directory | Out-Null
    }

    return $resolvedPath
}

function Mask-ConnectionString {
    param([string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return ""
    }

    return ($Value -replace '://([^:@/]+):([^@/]+)@', '://$1:***@')
}

function Wait-BackendHealth {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [int]$TimeoutSeconds = 120,
        [int]$ProcessId = 0
    )

    if ($WhatIfPreference) {
        return
    }

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if ($ProcessId -gt 0 -and -not (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) {
            $tail = ""
            if (Test-Path -LiteralPath $stderrLog) {
                $tail = (Get-Content -LiteralPath $stderrLog -Tail 20 -ErrorAction SilentlyContinue) -join [Environment]::NewLine
            }
            throw "Backend process exited before health check passed. See $stderrLog$([Environment]::NewLine)$tail"
        }

        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
                Write-Host "Backend health check passed: $Url"
                return
            }
        } catch {
            Start-Sleep -Seconds 2
        }
    }

    throw "Backend did not become healthy within $TimeoutSeconds seconds: $Url"
}

if (-not (Test-Path -LiteralPath $backendExe)) {
    throw "Backend executable not found: $backendExe"
}

if ($PSCmdlet.ShouldProcess($logsDir, "Create backend logs directory")) {
    New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
}

if (-not (Test-Path -LiteralPath $envFile)) {
    if (Test-Path -LiteralPath $envExampleFile) {
        if ($PSCmdlet.ShouldProcess($envFile, "Create .env from .env.example")) {
            Copy-Item -LiteralPath $envExampleFile -Destination $envFile -Force
        }
    }
}

if (Test-Path -LiteralPath $envFile) {
    $env:ENV_FILE = $envFile
    $loadedEnv = Set-EnvVarsFromFile -Path $envFile
    $backendLogFile = Set-InstallerPathEnv -Values $loadedEnv -Name "LOG_FILE" -DefaultRelativePath "logs/backend-go/app.log" -InstallRoot $InstallRoot -ConfigDir $configDir -FilePath
    $reportOutputDir = Set-InstallerPathEnv -Values $loadedEnv -Name "REPORT_OUTPUT_DIR" -DefaultRelativePath "data/reports/monitoring" -InstallRoot $InstallRoot -ConfigDir $configDir
    $reportsOutputDir = Set-InstallerPathEnv -Values $loadedEnv -Name "REPORTS_OUTPUT_DIR" -DefaultRelativePath "data/reports" -InstallRoot $InstallRoot -ConfigDir $configDir
} else {
    if ($WhatIfPreference) {
        Write-Host "What if: Environment file would be created from $envExampleFile"
        $env:ENV_FILE = $envFile
        $loadedEnv = @{}
        $backendLogFile = Resolve-InstallerRuntimePath -Value "" -DefaultRelativePath "logs/backend-go/app.log" -InstallRoot $InstallRoot -ConfigDir $configDir
        $reportOutputDir = Resolve-InstallerRuntimePath -Value "" -DefaultRelativePath "data/reports/monitoring" -InstallRoot $InstallRoot -ConfigDir $configDir
        $reportsOutputDir = Resolve-InstallerRuntimePath -Value "" -DefaultRelativePath "data/reports" -InstallRoot $InstallRoot -ConfigDir $configDir
    } else {
        throw "Environment file not found: $envFile or $envExampleFile"
    }
}

$serverPort = [int](Get-EnvValue -Path $envFile -Name "SERVER_PORT" -DefaultValue "9165")
$healthUrl = "http://127.0.0.1:$serverPort/health"
$databaseUrl = Get-EnvValue -Path $envFile -Name "DATABASE_URL" -DefaultValue ""
$redisUrl = Get-EnvValue -Path $envFile -Name "REDIS_URL" -DefaultValue ""

Write-Host "Backend ENV_FILE=$envFile"
Write-Host "Backend SERVER_PORT=$serverPort"
Write-Host "Backend DATABASE_URL=$(Mask-ConnectionString -Value $databaseUrl)"
Write-Host "Backend REDIS_URL=$(Mask-ConnectionString -Value $redisUrl)"
Write-Host "Backend LOG_FILE=$backendLogFile"
Write-Host "Backend REPORT_OUTPUT_DIR=$reportOutputDir"
Write-Host "Backend REPORTS_OUTPUT_DIR=$reportsOutputDir"
Write-Host "Backend environment variables loaded: $($loadedEnv.Count)"

if (Test-Path -LiteralPath $pidFile) {
    $oldPid = Get-Content -LiteralPath $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($oldPid -and (Get-Process -Id $oldPid -ErrorAction SilentlyContinue)) {
        Write-Host "Backend is already running. PID=$oldPid"
        Wait-BackendHealth -Url $healthUrl -TimeoutSeconds $TimeoutSeconds -ProcessId ([int]$oldPid)
        return
    }
}

if ($PSCmdlet.ShouldProcess($backendExe, "Start backend service")) {
    $process = Start-Process `
        -FilePath $backendExe `
        -WorkingDirectory $InstallRoot `
        -WindowStyle Minimized `
        -RedirectStandardOutput $stdoutLog `
        -RedirectStandardError $stderrLog `
        -PassThru

    Set-Content -LiteralPath $pidFile -Value $process.Id
    Write-Host "Backend started. PID=$($process.Id)"
    Wait-BackendHealth -Url $healthUrl -TimeoutSeconds $TimeoutSeconds -ProcessId $process.Id
}
