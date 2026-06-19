[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$scriptPath = Join-Path $repoRoot "installer/scripts/start-frontend.ps1"
$content = Get-Content -LiteralPath $scriptPath -Raw

$blockedPatterns = @(
    "Invoke-WebRequest",
    "-WindowStyle Hidden",
    "Invoke-Expression",
    "EncodedCommand",
    "FromBase64String",
    "DownloadString",
    "DownloadFile",
    "Add-MpPreference",
    "Set-MpPreference",
    "DisableRealtimeMonitoring"
)

foreach ($pattern in $blockedPatterns) {
    if ($content -match [regex]::Escape($pattern)) {
        throw "start-frontend.ps1 contains high-risk PowerShell pattern: $pattern"
    }
}

Write-Host "start-frontend security pattern test passed."
