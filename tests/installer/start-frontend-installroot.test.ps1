[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$scriptPath = Join-Path $repoRoot "installer/scripts/start-frontend.ps1"
$relativeInstallRoot = "build/installer/InspectRuntime"
$absoluteInstallRoot = (Resolve-Path (Join-Path $repoRoot $relativeInstallRoot)).Path

$output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath -InstallRoot $relativeInstallRoot -Port 3100 -TimeoutSeconds 5 -WhatIf 2>&1
$text = ($output | Out-String)

$expectedTarget = Join-Path $absoluteInstallRoot "frontend"
if ($text -notmatch [regex]::Escape($expectedTarget)) {
    throw "Expected start-frontend.ps1 to normalize relative InstallRoot to $absoluteInstallRoot. Output:`n$text"
}

Write-Host "start-frontend install root normalization test passed."
