# 纯前端构建；不安装依赖、不生成环境文件、不触发部署。
[CmdletBinding()]
param([string]$FrontendDirectory = "")
$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if ([string]::IsNullOrWhiteSpace($FrontendDirectory)) { $FrontendDirectory = Join-Path $projectRoot "frontend" }
if (-not (Test-Path -LiteralPath (Join-Path $FrontendDirectory "package.json"))) { throw "前端目录缺少 package.json" }
$buildLogDirectory = Join-Path $projectRoot "logs"
New-Item -ItemType Directory -Path $buildLogDirectory -Force | Out-Null
$buildExitCode = 1
Push-Location -LiteralPath $FrontendDirectory
try {
    & pnpm run build 2>&1 | Tee-Object -FilePath (Join-Path $buildLogDirectory "frontend-build.log")
    $buildExitCode = $LASTEXITCODE
} finally {
    Pop-Location
}
exit $buildExitCode
