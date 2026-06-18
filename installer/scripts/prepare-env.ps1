[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$InstallRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"

$configDir = Join-Path $InstallRoot "config"
$envFile = Join-Path $configDir ".env"
$envExampleFile = Join-Path $configDir ".env.example"

$dirs = @(
    (Join-Path $InstallRoot "logs"),
    (Join-Path $InstallRoot "logs/backend-go"),
    (Join-Path $InstallRoot "data"),
    (Join-Path $InstallRoot "data/postgres"),
    (Join-Path $InstallRoot "data/redis"),
    (Join-Path $InstallRoot "data/reports"),
    (Join-Path $InstallRoot "data/reports/monitoring"),
    (Join-Path $InstallRoot "data/backups"),
    $configDir
)

foreach ($dir in $dirs) {
    if ($PSCmdlet.ShouldProcess($dir, "Create runtime directory")) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }
}

if (-not (Test-Path -LiteralPath $envFile)) {
    if (-not (Test-Path -LiteralPath $envExampleFile)) {
        throw "Environment example file not found: $envExampleFile"
    }
    if ($PSCmdlet.ShouldProcess($envFile, "Create .env from .env.example")) {
        Copy-Item -LiteralPath $envExampleFile -Destination $envFile -Force
        Write-Host "Created config/.env from config/.env.example"
    }
}

function New-InspectSecret {
    $bytes = New-Object byte[] 48
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($bytes)
        return [Convert]::ToBase64String($bytes)
    } finally {
        $rng.Dispose()
    }
}

if ((Test-Path -LiteralPath $envFile) -and -not $WhatIfPreference) {
    $content = Get-Content -LiteralPath $envFile -Raw
    $changed = $false

    if ($content -match '(?m)^SECRET_KEY=change-me-generated-on-first-start\s*$') {
        $content = $content -replace '(?m)^SECRET_KEY=change-me-generated-on-first-start\s*$', ('SECRET_KEY=' + (New-InspectSecret))
        $changed = $true
    }
    if ($content -match '(?m)^JWT_SECRET_KEY=change-me-generated-on-first-start\s*$') {
        $content = $content -replace '(?m)^JWT_SECRET_KEY=change-me-generated-on-first-start\s*$', ('JWT_SECRET_KEY=' + (New-InspectSecret))
        $changed = $true
    }

    if ($changed) {
        Set-Content -LiteralPath $envFile -Value $content -Encoding UTF8
        Write-Host "Generated runtime SECRET_KEY and JWT_SECRET_KEY in config/.env"
    }
}
