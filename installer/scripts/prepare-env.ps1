[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$InstallRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"

$configDir = Join-Path $InstallRoot "config"
$envFile = Join-Path $configDir ".env"
$envExampleFile = Join-Path $configDir ".env.example"

$dirs = @(
    (Join-Path $InstallRoot "logs"),
    (Join-Path $InstallRoot "logs/backend-go"),
    (Join-Path $InstallRoot "data"),
    (Join-Path $InstallRoot "data/postgres"),
    (Join-Path $InstallRoot "data/redis"),
    (Join-Path $InstallRoot "data/reports"),
    (Join-Path $InstallRoot "data/reports/monitoring"),
    (Join-Path $InstallRoot "data/backups"),
    $configDir
)

foreach ($dir in $dirs) {
    if ($PSCmdlet.ShouldProcess($dir, "Create runtime directory")) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }
}

if (-not (Test-Path -LiteralPath $envFile)) {
    if (-not (Test-Path -LiteralPath $envExampleFile)) {
        throw "Environment example file not found: $envExampleFile"
    }
    if ($PSCmdlet.ShouldProcess($envFile, "Create .env from .env.example")) {
        Copy-Item -LiteralPath $envExampleFile -Destination $envFile -Force
        Write-Host "Created config/.env from config/.env.example"
    }
}

function New-InspectSecret {
    $bytes = New-Object byte[] 48
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($bytes)
        return [Convert]::ToBase64String($bytes)
    } finally {
        $rng.Dispose()
    }
}

function New-InspectPassword {
    # 32 字节随机 → hex（64 字符，纯 [0-9a-f]，URL-safe，绝不破坏 DATABASE_URL/REDIS_URL 解析）
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($bytes)
        return (($bytes | ForEach-Object { $_.ToString('x2') }) -join '')
    } finally {
        $rng.Dispose()
    }
}

if ((Test-Path -LiteralPath $envFile) -and -not $WhatIfPreference) {
    $content = Get-Content -LiteralPath $envFile -Raw
    $changed = $false

    if ($content -match '(?m)^SECRET_KEY=change-me-generated-on-first-start\s*$') {
        $content = $content -replace '(?m)^SECRET_KEY=change-me-generated-on-first-start\s*$', ('SECRET_KEY=' + (New-InspectSecret))
        $changed = $true
    }
    if ($content -match '(?m)^JWT_SECRET_KEY=change-me-generated-on-first-start\s*$') {
        $content = $content -replace '(?m)^JWT_SECRET_KEY=change-me-generated-on-first-start\s*$', ('JWT_SECRET_KEY=' + (New-InspectSecret))
        $changed = $true
    }

    # 数据库口令：存量卷感知。Postgres 仅在首次初始化空数据卷时固化 DB 用户口令，
    # 此后改 env 不会改已有口令；故卷若已初始化仍随机化会导致后端连不上库。
    # 占位符 __DB_PASSWORD__ 同时出现在 DATABASE_URL 与 POSTGRES_PASSWORD，-replace 一次求值、
    # 全部匹配同值替换，从根本保证两者一致（单一真相来源）。
    if ($content -match '__DB_PASSWORD__') {
        $postgresInitialized = Test-Path -LiteralPath (Join-Path $InstallRoot "data/postgres/PG_VERSION")
        if ($postgresInitialized) {
            # 卷已被旧版安装包（S11 之前）以 dev_password_2024 初始化；沿用以保证连库，不破坏存量库。
            $content = $content -replace '__DB_PASSWORD__', 'dev_password_2024'
            Write-Warning "检测到已初始化的 PostgreSQL 数据卷（data/postgres），沿用既有 DB 口令以避免连库失败。如需轮换为强随机口令，请参考安装文档的存量升级指引（ALTER USER）。"
        } else {
            $content = $content -replace '__DB_PASSWORD__', (New-InspectPassword)
        }
        $changed = $true
    }

    # Redis 口令：--requirepass 每次启动从命令行读取、不锁进数据卷，可安全随机化。
    if ($content -match '__REDIS_PASSWORD__') {
        $content = $content -replace '__REDIS_PASSWORD__', (New-InspectPassword)
        $changed = $true
    }

    if ($changed) {
        Set-Content -LiteralPath $envFile -Value $content -Encoding UTF8
        Write-Host "Generated runtime secrets (SECRET_KEY/JWT_SECRET_KEY and DB/Redis passwords as needed) in config/.env"
    }
}
