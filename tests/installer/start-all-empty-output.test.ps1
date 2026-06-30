[CmdletBinding()]
param()

# start-all.ps1 空输出容错回归测试。
# 复制总控脚本到临时安装目录，并用假子脚本模拟 init-database.ps1 输出空行。

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$sourceStartAll = Join-Path $repoRoot "installer/scripts/start-all.ps1"
$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("inspect-start-all-empty-output-" + [Guid]::NewGuid().ToString("N"))
$scriptsDir = Join-Path $testRoot "scripts"

function Write-Utf8BomFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Content
    )

    $encoding = New-Object System.Text.UTF8Encoding($true)
    [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

try {
    New-Item -ItemType Directory -Force -Path $scriptsDir | Out-Null
    Copy-Item -LiteralPath $sourceStartAll -Destination (Join-Path $scriptsDir "start-all.ps1") -Force
    Set-Content -LiteralPath (Join-Path $testRoot "VERSION") -Value "test" -Encoding ascii

    $fakePrepareEnv = @'
[CmdletBinding(SupportsShouldProcess = $true)]
param([string]$InstallRoot)
Write-Host "prepared"
'@
    $fakeBackend = @'
[CmdletBinding(SupportsShouldProcess = $true)]
param([string]$InstallRoot)
Write-Host "backend started"
'@
    $fakeDatabase = @'
[CmdletBinding(SupportsShouldProcess = $true)]
param([string]$InstallRoot)
Write-Host "Database initialized."
Write-Host ""
Write-Host "admin credential would be printed"
'@
    $fakeFrontend = @'
[CmdletBinding(SupportsShouldProcess = $true)]
param([string]$InstallRoot, [int]$Port, [string]$Hostname)
Write-Host "frontend started"
'@

    Write-Utf8BomFile -Path (Join-Path $scriptsDir "prepare-env.ps1") -Content $fakePrepareEnv
    Write-Utf8BomFile -Path (Join-Path $scriptsDir "start-backend.ps1") -Content $fakeBackend
    Write-Utf8BomFile -Path (Join-Path $scriptsDir "init-database.ps1") -Content $fakeDatabase
    Write-Utf8BomFile -Path (Join-Path $scriptsDir "start-frontend.ps1") -Content $fakeFrontend

    $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $scriptsDir "start-all.ps1") -InstallRoot $testRoot -SkipInfra 2>&1
    $exitCode = $LASTEXITCODE
    $text = ($output | Out-String)

    if ($exitCode -ne 0) {
        throw "start-all.ps1 should tolerate empty child output. ExitCode=$exitCode Output:`n$text"
    }
    if ($text -match "无法将参数绑定到参数") {
        throw "start-all.ps1 still fails on empty Message binding. Output:`n$text"
    }
    if ($text -notmatch "Step completed: initialize database") {
        throw "Expected initialize database step to complete. Output:`n$text"
    }
    if ($text -notmatch "Inspect started.") {
        throw "Expected startup flow to reach final success. Output:`n$text"
    }

    Write-Host "start-all empty output tolerance test passed."
} finally {
    Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue
}
