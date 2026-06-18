[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$scriptPath = Join-Path $repoRoot "installer/scripts/start-backend.ps1"
$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("inspect-start-backend-paths-" + [Guid]::NewGuid().ToString("N"))

try {
    New-Item -ItemType Directory -Force -Path (Join-Path $testRoot "backend") | Out-Null
    New-Item -ItemType Directory -Force -Path (Join-Path $testRoot "config") | Out-Null
    New-Item -ItemType File -Force -Path (Join-Path $testRoot "backend/app.exe") | Out-Null

    @"
SERVER_PORT=9165
DATABASE_URL=postgresql://inspect_dev:dev_password_2024@127.0.0.1:15500/inspect_system_dev
REDIS_URL=redis://:dev_redis_2024@127.0.0.1:26380/0
LOG_FILE=../logs/backend-go/app.log
REPORT_OUTPUT_DIR=../data/reports/monitoring
REPORTS_OUTPUT_DIR=../data/reports
"@ | Set-Content -LiteralPath (Join-Path $testRoot "config/.env") -Encoding UTF8

    $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath -InstallRoot $testRoot -WhatIf 2>&1
    $text = ($output | Out-String)

    $expectedLogFile = Join-Path $testRoot "logs/backend-go/app.log"
    $expectedReportOutputDir = Join-Path $testRoot "data/reports/monitoring"
    $expectedReportsOutputDir = Join-Path $testRoot "data/reports"

    if ($text -notmatch [regex]::Escape("Backend LOG_FILE=$expectedLogFile")) {
        throw "Expected normalized LOG_FILE inside InstallRoot. Output:`n$text"
    }
    if ($text -notmatch [regex]::Escape("Backend REPORT_OUTPUT_DIR=$expectedReportOutputDir")) {
        throw "Expected normalized REPORT_OUTPUT_DIR inside InstallRoot. Output:`n$text"
    }
    if ($text -notmatch [regex]::Escape("Backend REPORTS_OUTPUT_DIR=$expectedReportsOutputDir")) {
        throw "Expected normalized REPORTS_OUTPUT_DIR inside InstallRoot. Output:`n$text"
    }

    Write-Host "start-backend path normalization test passed."
} finally {
    if (Test-Path -LiteralPath $testRoot) {
        Remove-Item -LiteralPath $testRoot -Recurse -Force
    }
}
