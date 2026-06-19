[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$InstallRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"

$composeFile = Join-Path $InstallRoot "docker-compose.installer.yml"
if (-not (Test-Path -LiteralPath $composeFile)) {
    Write-Host "Docker Compose file not found. Skip infrastructure stop."
    return
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "Docker CLI not found. Skip infrastructure stop."
    return
}

if ($PSCmdlet.ShouldProcess($composeFile, "Stop TimescaleDB/PostgreSQL and Redis")) {
    & docker compose -f $composeFile --project-name inspect-installer stop
    if ($LASTEXITCODE -ne 0) {
        throw "docker compose stop failed"
    }
}
