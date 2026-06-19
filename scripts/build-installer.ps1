#!/usr/bin/env pwsh
<#
.SYNOPSIS
    构建 Windows 安装包（一键）：编译后端、构建前端、组装运行时、Inno Setup 打包。

.DESCRIPTION
    以仓库根 VERSION 文件为唯一版本真相源，在构建时分发版本号：
      - 后端：go build -ldflags 注入 internal/config.defaultAppVersion
      - 前端：NEXT_PUBLIC_APP_VERSION 环境变量注入 next build
      - 安装包：ISCC /DAppVersion 覆盖
    复用既有 InspectRuntime/frontend/node_modules 与 runtime/node.exe（版本无关，体量大）。
    产出 build/installer-output/InspectSetup.exe。

.PARAMETER SkipBackend
    跳过后端 go build（复用已存在 app.exe）。

.PARAMETER SkipFrontend
    跳过前端 next build（复用已存在 .next）。

.PARAMETER SkipInstaller
    跳过 ISCC 编译（仅构建与组装产物）。

.NOTES
    前端用 `next build` 直接产出（next.config.js 已 ignoreBuildErrors / ignoreDuringBuilds）；
    类型与 lint 质量门禁由 scripts/test.ps1 单独承担，避免打包链路被环境差异阻断。
#>
[CmdletBinding()]
param(
    [switch]$SkipBackend,
    [switch]$SkipFrontend,
    [switch]$SkipInstaller
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$ProjectRoot     = Split-Path -Parent $PSScriptRoot
$BackendDir      = Join-Path $ProjectRoot "backend-go"
$FrontendDir     = Join-Path $ProjectRoot "frontend"
$RuntimeRoot     = Join-Path $ProjectRoot "build/installer/InspectRuntime"
$RuntimeBackend  = Join-Path $RuntimeRoot "backend"
$RuntimeFrontend = Join-Path $RuntimeRoot "frontend"
$RuntimeNode     = Join-Path $RuntimeRoot "runtime"
$IssFile         = Join-Path $ProjectRoot "installer/inspect.iss"
$OutputExe       = Join-Path $ProjectRoot "build/installer-output/InspectSetup.exe"
$GoModule        = "github.com/your-org/inspect-system/backend-go"

function Write-Step { param([string]$Message) Write-Host "`n=== $Message ===" -ForegroundColor Cyan }
function Write-Ok   { param([string]$Message) Write-Host "[OK] $Message" -ForegroundColor Green }
function Write-Warn2{ param([string]$Message) Write-Host "[WARN] $Message" -ForegroundColor Yellow }

# 校验 installer 运行时 .env 模板满足 prepare-env / docker-compose.installer 的契约（防静默漂移）。
# 两文件各司其职：根 .env.example = 开发者参考；installer/config/.env.example = 安装运行时模板。
# 本校验保证后者始终具备「首启自动生成密钥/口令」所需的占位符标记、必需键与 S11 一致性不变量，
# 缺失即在打包阶段 fail-fast，避免装到用户机才静默崩（如密钥/口令未生成）。
function Test-InstallerEnvContract {
    $envExample = Join-Path $ProjectRoot "installer/config/.env.example"
    if (-not (Test-Path -LiteralPath $envExample)) { throw "缺少 installer 运行时模板: $envExample" }
    $content = Get-Content -LiteralPath $envExample -Raw

    $problems = @()

    # 1) prepare-env.ps1 据此替换的占位符/标记
    if ($content -notmatch '(?m)^SECRET_KEY=change-me-generated-on-first-start\s*$') {
        $problems += "缺少 prepare-env 标记: SECRET_KEY=change-me-generated-on-first-start"
    }
    if ($content -notmatch '(?m)^JWT_SECRET_KEY=change-me-generated-on-first-start\s*$') {
        $problems += "缺少 prepare-env 标记: JWT_SECRET_KEY=change-me-generated-on-first-start"
    }
    if ($content -notmatch '__DB_PASSWORD__')    { $problems += "缺少占位符 __DB_PASSWORD__（prepare-env 据此生成 DB 口令）" }
    if ($content -notmatch '__REDIS_PASSWORD__') { $problems += "缺少占位符 __REDIS_PASSWORD__（prepare-env 据此生成 Redis 口令）" }

    # 2) 后端 / docker-compose.installer.yml 必需键
    foreach ($k in @("SECRET_KEY","JWT_SECRET_KEY","SERVER_PORT","DATABASE_URL","REDIS_URL","POSTGRES_PASSWORD","REDIS_PASSWORD")) {
        if ($content -notmatch ("(?m)^" + [regex]::Escape($k) + "=")) { $problems += "缺少必需键: $k" }
    }

    # 3) S11 一致性不变量：占位符须同时出现在 URL 与独立口令变量
    if ($content -notmatch '(?m)^DATABASE_URL=.*__DB_PASSWORD__')        { $problems += "DATABASE_URL 未内嵌 __DB_PASSWORD__" }
    if ($content -notmatch '(?m)^POSTGRES_PASSWORD=__DB_PASSWORD__\s*$')  { $problems += "POSTGRES_PASSWORD 应为 __DB_PASSWORD__" }
    if ($content -notmatch '(?m)^REDIS_URL=.*__REDIS_PASSWORD__')         { $problems += "REDIS_URL 未内嵌 __REDIS_PASSWORD__" }
    if ($content -notmatch '(?m)^REDIS_PASSWORD=__REDIS_PASSWORD__\s*$')  { $problems += "REDIS_PASSWORD 应为 __REDIS_PASSWORD__" }

    if ($problems.Count -gt 0) {
        throw ("installer/config/.env.example 契约校验失败（共 $($problems.Count) 项）：`n  - " + ($problems -join "`n  - ") + "`n（根 .env.example 为开发者参考；installer 运行时模板必须满足上述 prepare-env/compose 契约）")
    }
    Write-Ok "installer 运行时 .env 模板契约校验通过（占位符 + 必需键 + 一致性）"
}

# 安装脚本由安装机的 Windows PowerShell 5.1 执行；它对无 BOM 的 .ps1 按系统 ANSI 代码页读取，
# 含中文等非 ASCII 会被误读、吞掉引号/花括号导致解析崩溃（见 2026-06-19 安装事故）。
# 故确保 installer/scripts/*.ps1 均带 UTF-8 BOM；缺失则自动补上（自愈，防编辑工具剥离 BOM 后打进坏包）。
function Set-InstallerScriptsBom {
    $scriptsDir = Join-Path $ProjectRoot "installer/scripts"
    $bom = [byte[]](0xEF, 0xBB, 0xBF)
    $fixed = @()
    Get-ChildItem -LiteralPath $scriptsDir -Filter *.ps1 -File | ForEach-Object {
        $bytes = [System.IO.File]::ReadAllBytes($_.FullName)
        if ($bytes.Length -lt 3 -or $bytes[0] -ne 0xEF -or $bytes[1] -ne 0xBB -or $bytes[2] -ne 0xBF) {
            [System.IO.File]::WriteAllBytes($_.FullName, $bom + $bytes)
            $fixed += $_.Name
        }
    }
    if ($fixed.Count -gt 0) {
        Write-Warn2 ("已为安装脚本补加 UTF-8 BOM（PS 5.1 安全）: " + ($fixed -join ", "))
    } else {
        Write-Ok "installer/scripts/*.ps1 均已带 UTF-8 BOM（PS 5.1 安全）"
    }
}

# 1) 读取版本真相源
$versionFile = Join-Path $ProjectRoot "VERSION"
if (-not (Test-Path -LiteralPath $versionFile)) { throw "未找到版本源文件: $versionFile" }
$Version = (Get-Content -LiteralPath $versionFile -Raw).Trim()
if ([string]::IsNullOrWhiteSpace($Version)) { throw "VERSION 文件为空" }
Write-Step "Inspect 安装包构建 — 版本 $Version"

# 1.5) 校验 installer 运行时 .env 模板契约 + 确保安装脚本带 UTF-8 BOM（PS 5.1 安全）
Test-InstallerEnvContract
Set-InstallerScriptsBom

# 2) 后端：注入版本编译 app.exe
if ($SkipBackend) {
    Write-Warn2 "跳过后端构建（-SkipBackend）"
} else {
    Write-Step "编译后端 app.exe（注入版本 $Version）"
    New-Item -ItemType Directory -Force -Path $RuntimeBackend | Out-Null
    $ldflags = "-s -w -X $GoModule/internal/config.defaultAppVersion=$Version"
    Push-Location $BackendDir
    try {
        & go build -ldflags $ldflags -o (Join-Path $RuntimeBackend "app.exe") ./cmd/api
        if ($LASTEXITCODE -ne 0) { throw "go build 失败（退出码 $LASTEXITCODE）" }
    } finally { Pop-Location }
    Write-Ok "后端编译完成: $RuntimeBackend\app.exe"
}

# 3) 前端：注入版本构建并组装产物（复用 node_modules）
if ($SkipFrontend) {
    Write-Warn2 "跳过前端构建（-SkipFrontend）"
} else {
    Write-Step "构建前端（NEXT_PUBLIC_APP_VERSION=$Version）"
    Push-Location $FrontendDir
    try {
        $env:NEXT_PUBLIC_APP_VERSION = $Version
        & pnpm exec next build --no-lint
        if ($LASTEXITCODE -ne 0) { throw "next build 失败（退出码 $LASTEXITCODE）" }
    } finally {
        Pop-Location
        Remove-Item Env:NEXT_PUBLIC_APP_VERSION -ErrorAction SilentlyContinue
    }

    Write-Step "组装前端产物到 InspectRuntime"
    if (-not (Test-Path -LiteralPath (Join-Path $RuntimeFrontend "node_modules"))) {
        throw "缺少可移植前端依赖: $RuntimeFrontend\node_modules。`n该目录是版本无关的生产依赖（约 550MB），需先组装一次后再运行本脚本（参照既有 InspectRuntime 或用 pnpm 部署生产依赖至该目录）。"
    }
    foreach ($d in @(".next", "public")) {
        $src = Join-Path $FrontendDir $d
        $dst = Join-Path $RuntimeFrontend $d
        if (-not (Test-Path -LiteralPath $src)) { throw "前端产物缺失: $src" }
        if (Test-Path -LiteralPath $dst) { Remove-Item -LiteralPath $dst -Recurse -Force }
        Copy-Item -LiteralPath $src -Destination $dst -Recurse -Force
    }
    foreach ($f in @("package.json", "next.config.js")) {
        Copy-Item -LiteralPath (Join-Path $FrontendDir $f) -Destination (Join-Path $RuntimeFrontend $f) -Force
    }
    Write-Ok "前端产物已更新（复用 node_modules）"
}

if (-not (Test-Path -LiteralPath (Join-Path $RuntimeNode "node.exe"))) {
    Write-Warn2 "未找到 $RuntimeNode\node.exe（安装机将回退系统 node）"
}

# 4) Inno Setup 打包（/D 覆盖 AppVersion）
if ($SkipInstaller) {
    Write-Warn2 "跳过安装包编译（-SkipInstaller）"
} else {
    Write-Step "Inno Setup 编译安装包（AppVersion=$Version）"
    $isccCmd = Get-Command ISCC.exe -ErrorAction SilentlyContinue
    $iscc = if ($isccCmd) { $isccCmd.Source } else { $null }
    if (-not $iscc) {
        $candidate = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
        if (Test-Path -LiteralPath $candidate) { $iscc = $candidate }
    }
    if (-not $iscc) { throw "未找到 ISCC.exe（Inno Setup 6）。请安装 Inno Setup 6 或将 ISCC.exe 加入 PATH。" }

    & $iscc "/DAppVersion=$Version" $IssFile
    if ($LASTEXITCODE -ne 0) { throw "ISCC 编译失败（退出码 $LASTEXITCODE）" }

    if (-not (Test-Path -LiteralPath $OutputExe)) { throw "未生成安装包: $OutputExe" }
    $sizeMb = "{0:N2} MB" -f ((Get-Item -LiteralPath $OutputExe).Length / 1MB)
    Write-Ok "安装包已生成: $OutputExe ($sizeMb, v$Version)"
}

Write-Host "`n[DONE] Inspect v$Version 构建完成" -ForegroundColor Green
