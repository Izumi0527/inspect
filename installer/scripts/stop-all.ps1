[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$InstallRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"

$logsDir = Join-Path $InstallRoot "logs"
$infraScript = Join-Path $PSScriptRoot "stop-infra.ps1"
$pidFiles = @(
    Join-Path $logsDir "frontend.pid"
    Join-Path $logsDir "backend.pid"
)

foreach ($pidFile in $pidFiles) {
    if (-not (Test-Path -LiteralPath $pidFile)) {
        continue
    }

    $pidValue = Get-Content -LiteralPath $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $pidValue) {
        Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
        continue
    }

    $process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
    if ($process) {
        if ($PSCmdlet.ShouldProcess("PID=$pidValue", "Stop Inspect process")) {
            Stop-Process -Id $pidValue -Force
            Write-Host "Stopped process PID=$pidValue"
        }
    }

    if (-not $WhatIfPreference) {
        Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
    }
}

if (-not $WhatIfPreference) {
    Write-Host "Inspect stopped."
}

if (Test-Path -LiteralPath $infraScript) {
    & $infraScript -InstallRoot $InstallRoot -WhatIf:$WhatIfPreference
}
