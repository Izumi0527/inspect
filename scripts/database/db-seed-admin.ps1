# 企业级网络设备巡检系统 - 初始化默认管理员账号（含角色/权限种子）
#
# 作用：
# - 初始化/补齐 RBAC 基础数据（permissions / roles / role_permissions）
# - 创建或更新默认管理员账号
#
# 说明：
# - 依赖 Go 环境（用于执行 backend-go/cmd/seed）
# - 会读取项目根目录的 .env（或 .env.development）作为配置来源

param(
    [string]$Username = "admin",
    [string]$Password = "admin123",
    [string]$Email = "admin@admin.com",
    [string]$Role = "superadmin",
    [string]$FullName = "系统管理员",
    [switch]$SkipMigrate,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

if ($Help) {
    Write-Host "初始化默认管理员账号（含角色/权限种子）" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "用法:" -ForegroundColor Cyan
    Write-Host "  .\\scripts\\database\\db-seed-admin.ps1 [参数]" -ForegroundColor White
    Write-Host ""
    Write-Host "参数:" -ForegroundColor Cyan
    Write-Host "  -Username <用户名>      默认: admin" -ForegroundColor White
    Write-Host "  -Password <密码>        默认: admin123" -ForegroundColor White
    Write-Host "  -Email <邮箱>           默认: admin@admin.com" -ForegroundColor White
    Write-Host "  -Role <角色>            默认: superadmin（会映射为 admin）" -ForegroundColor White
    Write-Host "  -FullName <显示名>       默认: 系统管理员" -ForegroundColor White
    Write-Host "  -SkipMigrate            跳过数据库迁移（不推荐）" -ForegroundColor White
    Write-Host "  -Help                   显示帮助" -ForegroundColor White
    Write-Host ""
    Write-Host "示例:" -ForegroundColor Cyan
    Write-Host "  .\\scripts\\database\\db-seed-admin.ps1" -ForegroundColor White
    Write-Host "  .\\scripts\\database\\db-seed-admin.ps1 -Email \"admin@admin.com\" -Role \"superadmin\"" -ForegroundColor White
    exit 0
}

# 计算项目根目录
$script:ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:ScriptsRoot = Split-Path -Parent $script:ScriptPath
$script:ProjectRoot = Split-Path -Parent $script:ScriptsRoot

# 选择环境文件（优先 .env）
$envFile = Join-Path $script:ProjectRoot ".env"
if (-not (Test-Path $envFile)) {
    $envFile = Join-Path $script:ProjectRoot ".env.development"
}
if (Test-Path $envFile) {
    $env:ENV_FILE = $envFile
    Write-Host "[信息] 使用环境文件: $envFile" -ForegroundColor DarkGray
} else {
    Write-Host "[警告] 未找到 .env/.env.development，将使用后端默认配置（可能连接不到数据库）" -ForegroundColor Yellow
}

# 兼容受限环境：将 Go 编译缓存放到项目目录，避免写入用户目录失败
$goCacheRoot = Join-Path $script:ProjectRoot ".gocache"
$goBuildCache = Join-Path $goCacheRoot "build"
$goTmpDir = Join-Path $goCacheRoot "tmp"
New-Item -ItemType Directory -Force -Path $goBuildCache, $goTmpDir | Out-Null
$env:GOCACHE = $goBuildCache
$env:GOTMPDIR = $goTmpDir

if (-not (Get-Command "go" -ErrorAction SilentlyContinue)) {
    throw "未检测到 Go 环境，请先安装 Go（用于执行 backend-go/cmd/seed）"
}

# 执行后端种子工具
Push-Location (Join-Path $script:ProjectRoot "backend-go")
try {
    $args = @(
        "run",
        "./cmd/seed",
        "--username", $Username,
        "--password", $Password,
        "--email", $Email,
        "--role", $Role,
        "--full-name", $FullName
    )
    if ($SkipMigrate) {
        $args += "--skip-migrate"
    }

    Write-Host "[信息] 开始初始化管理员账号与权限..." -ForegroundColor Cyan
    & go @args
    if ($LASTEXITCODE -ne 0) {
        throw "初始化失败，退出代码: $LASTEXITCODE"
    }
    Write-Host "[成功] 初始化完成，可使用 $Username / $Password 登录" -ForegroundColor Green
} finally {
    Pop-Location
}

