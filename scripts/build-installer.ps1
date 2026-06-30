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
$InstallerFrontendApiUrl = "http://localhost:9165"
$InstallerFrontendWsUrl  = "ws://localhost:9165"

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
    Write-Step "构建前端（NEXT_PUBLIC_APP_VERSION=$Version, NEXT_PUBLIC_API_URL=$InstallerFrontendApiUrl）"
    $previousNextPublicAppVersion = $env:NEXT_PUBLIC_APP_VERSION
    $previousNextPublicApiUrl = $env:NEXT_PUBLIC_API_URL
    $previousNextPublicWsUrl = $env:NEXT_PUBLIC_WS_URL
    $previousNextPublicEnv = $env:NEXT_PUBLIC_ENV
    Push-Location $FrontendDir
    try {
        $env:NEXT_PUBLIC_APP_VERSION = $Version
        # Next.js 会把 NEXT_PUBLIC_* 内联进客户端产物；安装包必须在 build 阶段注入 9165，
        # 否则仓库 frontend/.env.local 的开发端口 18080 会被烘焙进登录页。
        $env:NEXT_PUBLIC_API_URL = $InstallerFrontendApiUrl
        $env:NEXT_PUBLIC_WS_URL = $InstallerFrontendWsUrl
        $env:NEXT_PUBLIC_ENV = "production"
        & pnpm exec next build --no-lint
        if ($LASTEXITCODE -ne 0) { throw "next build 失败（退出码 $LASTEXITCODE）" }
    } finally {
        Pop-Location
        if ($null -ne $previousNextPublicAppVersion) { $env:NEXT_PUBLIC_APP_VERSION = $previousNextPublicAppVersion } else { Remove-Item Env:NEXT_PUBLIC_APP_VERSION -ErrorAction SilentlyContinue }
        if ($null -ne $previousNextPublicApiUrl) { $env:NEXT_PUBLIC_API_URL = $previousNextPublicApiUrl } else { Remove-Item Env:NEXT_PUBLIC_API_URL -ErrorAction SilentlyContinue }
        if ($null -ne $previousNextPublicWsUrl) { $env:NEXT_PUBLIC_WS_URL = $previousNextPublicWsUrl } else { Remove-Item Env:NEXT_PUBLIC_WS_URL -ErrorAction SilentlyContinue }
        if ($null -ne $previousNextPublicEnv) { $env:NEXT_PUBLIC_ENV = $previousNextPublicEnv } else { Remove-Item Env:NEXT_PUBLIC_ENV -ErrorAction SilentlyContinue }
    }

    Write-Step "组装前端产物到 InspectRuntime"
    if (-not (Test-Path -LiteralPath (Join-Path $RuntimeFrontend "node_modules"))) {
        throw "缺少可移植前端依赖: $RuntimeFrontend\node_modules。`n该目录是版本无关的生产依赖（约 550MB），需先组装一次后再运行本脚本（参照既有 InspectRuntime 或用 pnpm 部署生产依赖至该目录）。"
    }

    # 复制 public 目录
    $publicSrc = Join-Path $FrontendDir "public"
    $publicDst = Join-Path $RuntimeFrontend "public"
    if (Test-Path -LiteralPath $publicSrc) {
        if (Test-Path -LiteralPath $publicDst) { Remove-Item -LiteralPath $publicDst -Recurse -Force }
        Copy-Item -LiteralPath $publicSrc -Destination $publicDst -Recurse -Force
    }

    # 复制 .next 目录（排除 cache 子目录，节省约 700MB）
    $nextSrc = Join-Path $FrontendDir ".next"
    $nextDst = Join-Path $RuntimeFrontend ".next"
    if (-not (Test-Path -LiteralPath $nextSrc)) { throw "前端产物缺失: $nextSrc" }
    if (Test-Path -LiteralPath $nextDst) { Remove-Item -LiteralPath $nextDst -Recurse -Force }
    # 使用 robocopy 排除 cache 目录（比 Copy-Item 更高效）
    $robocopyResult = & robocopy $nextSrc $nextDst /E /XD "cache" /NFL /NDL /NJH /NJS /NC /NS /NP 2>&1
    $robocopyExitCode = $LASTEXITCODE
    if ($robocopyExitCode -gt 1) {
        Write-Warn2 "robocopy 复制 .next 时出现警告（退出码 $robocopyExitCode），回退使用 Copy-Item"
        Copy-Item -LiteralPath $nextSrc -Destination $nextDst -Recurse -Force
        # 删除 cache 目录
        $cacheDir = Join-Path $nextDst "cache"
        if (Test-Path -LiteralPath $cacheDir) { Remove-Item -LiteralPath $cacheDir -Recurse -Force }
    }
    # robocopy 的 1 表示“成功且复制了文件”，但会污染 PowerShell 进程退出码。
    $global:LASTEXITCODE = 0

    foreach ($f in @("package.json", "next.config.js")) {
        Copy-Item -LiteralPath (Join-Path $FrontendDir $f) -Destination (Join-Path $RuntimeFrontend $f) -Force
    }

    # 生成前端生产环境配置文件 .env.local
    # 前端在生产模式下需要此文件来获取后端 API 地址
    $frontendEnvLocal = Join-Path $RuntimeFrontend ".env.local"
    $frontendEnvContent = @"
# 前端生产环境配置（由 build-installer.ps1 自动生成）
# 后端 API 地址（默认端口 9165）
NEXT_PUBLIC_API_URL=$InstallerFrontendApiUrl
NEXT_PUBLIC_WS_URL=$InstallerFrontendWsUrl

# 生产环境标识
NODE_ENV=production
NEXT_PUBLIC_ENV=production
"@
    Set-Content -LiteralPath $frontendEnvLocal -Value $frontendEnvContent -Encoding UTF8
    Write-Ok "前端产物已更新（复用 node_modules，排除 .next/cache）+ .env.local 已生成"
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

    # 安装包名附加 版本号-日期-时间，便于区分/归档多次构建产物（ISCC 固定产出 InspectSetup.exe 后重命名）。
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $stampedExe = Join-Path (Split-Path -Parent $OutputExe) "InspectSetup-$Version-$stamp.exe"
    Move-Item -LiteralPath $OutputExe -Destination $stampedExe -Force

    $sizeMb = "{0:N2} MB" -f ((Get-Item -LiteralPath $stampedExe).Length / 1MB)
    Write-Ok "安装包已生成: $stampedExe ($sizeMb, v$Version)"
}

Write-Host "`n[DONE] Inspect v$Version 构建完成" -ForegroundColor Green
