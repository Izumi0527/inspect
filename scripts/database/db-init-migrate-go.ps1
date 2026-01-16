# 企业级网络设备巡检系统 - Go 后端数据库迁移脚本
# 使用 Go 迁移逻辑（AutoMigrate + TimescaleDB 初始化）

param(
    [switch]$Migrate,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

if ($Help) {
    Write-Host "Go 后端数据库迁移脚本" -ForegroundColor Cyan
    Write-Host "用法:" -ForegroundColor Cyan
    Write-Host "    .\db-init-migrate-go.ps1 [-Migrate]" -ForegroundColor White
    Write-Host "说明: 默认执行迁移，读取根目录 .env/.env.development" -ForegroundColor Gray
    exit 0
}

if (-not $Migrate) {
    $Migrate = $true
}

if (-not (Get-Command "go" -ErrorAction SilentlyContinue)) {
    throw "未检测到 Go 运行时，请先安装 Go 1.22+"
}

$script:ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:ScriptsRoot = Split-Path -Parent $script:ScriptPath
$script:ProjectRoot = Split-Path -Parent $script:ScriptsRoot
$backendPath = Join-Path $script:ProjectRoot "backend-go"

if (-not (Test-Path $backendPath)) {
    throw "backend-go 目录不存在: $backendPath"
}

$envFile = Join-Path $script:ProjectRoot ".env.development"
if (-not (Test-Path $envFile)) {
    $envFile = Join-Path $script:ProjectRoot ".env"
}

if (Test-Path $envFile) {
    $env:ENV_FILE = $envFile
    Write-Host "[信息] 使用环境文件: $envFile" -ForegroundColor Blue
} else {
    Write-Host "[警告] 未找到 .env 文件，将使用默认配置" -ForegroundColor Yellow
}

Push-Location $backendPath
try {
    Write-Host "[信息] 执行 Go 数据库迁移..." -ForegroundColor Blue
    go run ./cmd/migrate
    Write-Host "[成功] 数据库迁移完成" -ForegroundColor Green
} finally {
    Pop-Location
}
