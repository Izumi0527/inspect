[CmdletBinding()]
param()

# S11 —— prepare-env.ps1 DB/Redis 口令随机化静态测试。
# 风格对齐既有 installer 测试：裸脚本 + throw 即失败 + 末尾 Write-Host 表示通过。
# 通过在临时 InstallRoot 真实运行 prepare-env.ps1 并断言产物 config/.env，覆盖：
#   1) 全新安装：占位符被替换、无弱口令、64 位 hex、DATABASE_URL 与 POSTGRES_PASSWORD 同口令；
#   2) 幂等：二次运行不改变已生成口令；
#   3) 存量卷：data/postgres 已初始化时 DB 口令回退 legacy 值并告警，Redis 仍随机化。

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$prepareEnvScript = Join-Path $repoRoot "installer/scripts/prepare-env.ps1"
$envExampleFile = Join-Path $repoRoot "installer/config/.env.example"

if (-not (Test-Path -LiteralPath $prepareEnvScript)) {
    throw "prepare-env.ps1 not found: $prepareEnvScript"
}
if (-not (Test-Path -LiteralPath $envExampleFile)) {
    throw ".env.example not found: $envExampleFile"
}

# 与 start-backend.ps1 / start-infra.ps1 的 Get-EnvValue 读取规则一致。
function Get-EnvVal {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Name
    )
    foreach ($line in (Get-Content -LiteralPath $Path)) {
        if ($line -match ("^\s*" + [regex]::Escape($Name) + "\s*=\s*(.*)\s*$")) {
            return $matches[1].Trim().Trim('"').Trim("'")
        }
    }
    return ""
}

function New-TempInstallRoot {
    $root = Join-Path ([System.IO.Path]::GetTempPath()) ("inspect-s11-{0}" -f ([guid]::NewGuid().ToString('N')))
    New-Item -ItemType Directory -Force -Path (Join-Path $root "config") | Out-Null
    Copy-Item -LiteralPath $envExampleFile -Destination (Join-Path $root "config/.env.example") -Force
    return $root
}

$hexPattern = '^[0-9a-f]{64}$'

# ───────────── 用例 1：全新安装（无存量卷）─────────────
$work = New-TempInstallRoot
try {
    & $prepareEnvScript -InstallRoot $work | Out-Null
    $envFile = Join-Path $work "config/.env"
    if (-not (Test-Path -LiteralPath $envFile)) { throw "用例1：prepare-env 未生成 config/.env" }
    $raw = Get-Content -LiteralPath $envFile -Raw

    if ($raw -match '__DB_PASSWORD__' -or $raw -match '__REDIS_PASSWORD__') {
        throw "用例1：占位符未被全部替换"
    }
    if ($raw -match 'dev_password_2024') { throw "用例1：全新安装仍残留 dev_password_2024" }
    if ($raw -match 'dev_redis_2024') { throw "用例1：全新安装仍残留 dev_redis_2024" }

    $dbPwd = Get-EnvVal -Path $envFile -Name 'POSTGRES_PASSWORD'
    $dbUrl = Get-EnvVal -Path $envFile -Name 'DATABASE_URL'
    $redisPwd = Get-EnvVal -Path $envFile -Name 'REDIS_PASSWORD'
    $redisUrl = Get-EnvVal -Path $envFile -Name 'REDIS_URL'

    if ($dbPwd -notmatch $hexPattern) { throw "用例1：POSTGRES_PASSWORD 非 64 位 hex: '$dbPwd'" }
    if ($redisPwd -notmatch $hexPattern) { throw "用例1：REDIS_PASSWORD 非 64 位 hex: '$redisPwd'" }

    # 单一真相来源：URL 内嵌口令必须与独立变量一致
    if ($dbUrl -notlike "*$dbPwd*") { throw "用例1：DATABASE_URL 口令与 POSTGRES_PASSWORD 不一致" }
    if ($redisUrl -notlike "*$redisPwd*") { throw "用例1：REDIS_URL 口令与 REDIS_PASSWORD 不一致" }

    if ($dbPwd -eq $redisPwd) { throw "用例1：DB 与 Redis 口令意外相同（应各自独立随机）" }

    # ───────────── 用例 2：幂等 ─────────────
    & $prepareEnvScript -InstallRoot $work | Out-Null
    $dbPwd2 = Get-EnvVal -Path $envFile -Name 'POSTGRES_PASSWORD'
    $redisPwd2 = Get-EnvVal -Path $envFile -Name 'REDIS_PASSWORD'
    if ($dbPwd2 -ne $dbPwd) { throw "用例2：幂等性失败——二次运行改变了 DB 口令" }
    if ($redisPwd2 -ne $redisPwd) { throw "用例2：幂等性失败——二次运行改变了 Redis 口令" }
} finally {
    Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
}

# ───────────── 用例 3：存量卷回退 legacy DB 口令 ─────────────
$work3 = New-TempInstallRoot
try {
    # 模拟已被旧版安装包初始化的 Postgres 数据卷（存在 PG_VERSION 标记）
    $pgDataDir = Join-Path $work3 "data/postgres"
    New-Item -ItemType Directory -Force -Path $pgDataDir | Out-Null
    Set-Content -LiteralPath (Join-Path $pgDataDir "PG_VERSION") -Value "16" -Encoding ascii

    & $prepareEnvScript -InstallRoot $work3 -WarningVariable dbWarn -WarningAction SilentlyContinue | Out-Null
    $envFile3 = Join-Path $work3 "config/.env"
    $dbPwd3 = Get-EnvVal -Path $envFile3 -Name 'POSTGRES_PASSWORD'
    $redisPwd3 = Get-EnvVal -Path $envFile3 -Name 'REDIS_PASSWORD'

    if ($dbPwd3 -ne 'dev_password_2024') {
        throw "用例3：存量卷场景 DB 口令应回退为 legacy 值，实际为 '$dbPwd3'"
    }
    if ($redisPwd3 -notmatch $hexPattern) {
        throw "用例3：存量卷场景 Redis 仍应随机化（不受 PG 卷影响），实际为 '$redisPwd3'"
    }
    if (-not $dbWarn -or $dbWarn.Count -lt 1) {
        throw "用例3：存量卷回退应发出 Warning 提示，但未捕获到告警"
    }
} finally {
    Remove-Item -LiteralPath $work3 -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "prepare-env password generation test passed (fresh / idempotent / existing-volume fallback)."
