# 企业级网络设备巡检系统 - 缓存清理脚本
# 用于清理项目中的各类缓存文件，释放磁盘空间，加速开发构建

param(
    [switch]$All,              # 清理所有缓存
    [switch]$Backend,          # 仅清理后端缓存（Go）
    [switch]$Frontend,         # 仅清理前端缓存
    [switch]$Logs,             # 清理日志文件
    [switch]$Temp,             # 清理临时文件
    [switch]$ProjectFiles,     # 清理项目特定临时文件
    [switch]$GoBuild,          # 清理 Go 构建缓存与编译产物
    [switch]$PackageCache,     # 清理包管理器缓存（pnpm）
    [switch]$Playwright,       # 清理 Playwright 测试产物
    [switch]$Force,            # 跳过确认直接清理
    [switch]$WhatIf,           # 预览将要删除的内容（不实际删除）
    [switch]$Verbose,          # 详细输出
    [switch]$Help              # 显示帮助信息
)

$ErrorActionPreference = "Continue"

# 全局变量
$script:ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:ScriptsRoot = $script:ScriptPath
$script:ProjectRoot = Split-Path -Parent $script:ScriptsRoot
$script:BackendPath = Join-Path $script:ProjectRoot "backend-go"
$script:FrontendPath = Join-Path $script:ProjectRoot "frontend"
$script:LogsPath = Join-Path $script:ProjectRoot "logs"
$script:BackendLogsPath = Join-Path $script:BackendPath "logs"
$script:TotalFreed = 0
$script:TotalFiles = 0
$script:ProjectRootResolved = (Resolve-Path -LiteralPath $script:ProjectRoot).ProviderPath
$script:Selection = [ordered]@{
    All          = [bool]$All
    Backend      = [bool]$Backend
    Frontend     = [bool]$Frontend
    Logs         = [bool]$Logs
    Temp         = [bool]$Temp
    ProjectFiles = [bool]$ProjectFiles
    GoBuild      = [bool]$GoBuild
    PackageCache = [bool]$PackageCache
    Playwright   = [bool]$Playwright
}
$script:ExcludedTraversalDirectories = @(
    ".git",
    ".vscode",
    ".idea",
    "node_modules",
    ".next",
    "dist",
    "build",
    "out",
    "vendor"
)

# ──────────────────────────────────────────────
# 日志函数
# ──────────────────────────────────────────────

function Write-LogInfo {
    param([string]$Message)
    Write-Host "[信息] $Message" -ForegroundColor Blue
}

function Write-LogSuccess {
    param([string]$Message)
    Write-Host "[成功] $Message" -ForegroundColor Green
}

function Write-LogWarning {
    param([string]$Message)
    Write-Host "[警告] $Message" -ForegroundColor Yellow
}

function Write-LogError {
    param([string]$Message)
    Write-Host "[错误] $Message" -ForegroundColor Red
}

function Write-LogStep {
    param([string]$Message)
    Write-Host "[步骤] $Message" -ForegroundColor Cyan
}

function Write-LogVerbose {
    param([string]$Message)
    if ($Verbose) {
        Write-Host "[详细] $Message" -ForegroundColor Magenta
    }
}

# ──────────────────────────────────────────────
# 帮助信息
# ──────────────────────────────────────────────

function Show-Help {
    Write-Host "企业级网络设备巡检系统 - 缓存清理脚本" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "用法:"
    Write-Host "    .\scripts\clean-cache.ps1 [选项]"
    Write-Host ""
    Write-Host "清理选项:"
    Write-Host "    -All                 清理所有缓存（含以下全部类别）"
    Write-Host "    -Backend             清理后端缓存（Go 覆盖率 / 临时文件 / go clean）"
    Write-Host "    -Frontend            清理前端缓存（Next.js / Turbo / ESLint / SWC 等）"
    Write-Host "    -Logs                清理日志文件（超过7天的日志，含 backend-go/logs/）"
    Write-Host "    -Temp                清理临时文件（.DS_Store / Thumbs.db / *.tmp）"
    Write-Host "    -ProjectFiles        清理项目特定文件（context.json / lint报告 / 覆盖率 / MCP 快照等）"
    Write-Host "    -GoBuild             清理 Go 构建缓存目录与编译产物（*.exe / .gocache / backend-go/backend-go 等）"
    Write-Host "    -PackageCache        清理包管理器缓存（pnpm store）"
    Write-Host "    -Playwright          清理 Playwright 测试产物（报告 / 测试结果 / MCP 快照）"
    Write-Host ""
    Write-Host "执行选项:"
    Write-Host "    -Force               跳过确认直接清理"
    Write-Host "    -WhatIf              预览将要删除的内容（不实际删除）"
    Write-Host "    -Verbose             显示详细输出"
    Write-Host "    -Help                显示此帮助信息"
    Write-Host ""
    Write-Host "示例:"
    Write-Host "    .\scripts\clean-cache.ps1                         # 交互式选择清理项"
    Write-Host "    .\scripts\clean-cache.ps1 -All -Force             # 清理所有缓存，不确认"
    Write-Host "    .\scripts\clean-cache.ps1 -GoBuild                # 仅清理 Go 构建缓存"
    Write-Host "    .\scripts\clean-cache.ps1 -PackageCache           # 仅清理包管理器缓存"
    Write-Host "    .\scripts\clean-cache.ps1 -Playwright             # 仅清理 Playwright 产物"
    Write-Host "    .\scripts\clean-cache.ps1 -WhatIf                 # 预览将要删除的内容"
    Write-Host "    .\scripts\clean-cache.ps1 -All -Verbose           # 清理所有并显示详细信息"
    Write-Host ""
    Write-Host "说明:"
    Write-Host "    🧹 覆盖 Go / pnpm / Playwright 等多类缓存"
    Write-Host "    📊 显示清理前后空间统计"
    Write-Host "    🔍 支持预览模式（-WhatIf）"
    Write-Host "    ⚡ 加速开发和构建"
    Write-Host "    🛡️ 避免删除 node_modules / .git / .vscode 等重要目录"
    Write-Host "    ⚠️ -PackageCache 会删除 pnpm 缓存，下次安装需重新下载依赖"
    Write-Host ""
}

# ──────────────────────────────────────────────
# 工具函数
# ──────────────────────────────────────────────

function Format-FileSize {
    param([long]$Size)

    if ($Size -ge 1GB) {
        return "{0:N2} GB" -f ($Size / 1GB)
    } elseif ($Size -ge 1MB) {
        return "{0:N2} MB" -f ($Size / 1MB)
    } elseif ($Size -ge 1KB) {
        return "{0:N2} KB" -f ($Size / 1KB)
    } else {
        return "$Size Bytes"
    }
}

function Get-SafeResolvedPath {
    param([string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path)) {
        return $null
    }

    try {
        return (Resolve-Path -LiteralPath $Path -ErrorAction Stop).ProviderPath
    } catch {
        Write-LogVerbose "路径解析失败，跳过: $Path"
        return $null
    }
}

function Test-IsSafeCachePath {
    param([string]$Path)

    $resolvedPath = Get-SafeResolvedPath -Path $Path
    if (-not $resolvedPath) {
        return $false
    }

    $projectRoot = $script:ProjectRootResolved.TrimEnd('\', '/')
    $normalizedPath = $resolvedPath.TrimEnd('\', '/')

    if ([string]::Equals($normalizedPath, $projectRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        Write-LogError "拒绝删除项目根目录: $resolvedPath"
        return $false
    }

    $projectPrefix = "$projectRoot\"
    if (-not $normalizedPath.StartsWith($projectPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        Write-LogError "拒绝删除项目外路径: $resolvedPath"
        return $false
    }

    return $true
}

function Get-RelativeProjectPath {
    param([string]$Path)

    try {
        return [IO.Path]::GetRelativePath($script:ProjectRootResolved, $Path)
    } catch {
        return $Path.Replace($script:ProjectRootResolved, "").TrimStart("\", "/")
    }
}

function Get-ProjectFileItems {
    param(
        [string]$RootPath,
        [string]$Filter
    )

    $resolvedRoot = Get-SafeResolvedPath -Path $RootPath
    if (-not $resolvedRoot) {
        return @()
    }

    $queue = [System.Collections.Generic.Queue[string]]::new()
    $queue.Enqueue($resolvedRoot)

    while ($queue.Count -gt 0) {
        $current = $queue.Dequeue()

        Get-ChildItem -LiteralPath $current -Directory -Force -ErrorAction SilentlyContinue | ForEach-Object {
            if ($script:ExcludedTraversalDirectories -contains $_.Name) {
                Write-LogVerbose "跳过目录扫描: $($_.FullName)"
            } else {
                $queue.Enqueue($_.FullName)
            }
        }

        Get-ChildItem -LiteralPath $current -Filter $Filter -File -Force -ErrorAction SilentlyContinue
    }
}

function Get-DirectorySize {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        return 0
    }

    try {
        $size = (Get-ChildItem -LiteralPath $Path -Recurse -File -ErrorAction SilentlyContinue |
                 Measure-Object -Property Length -Sum -ErrorAction SilentlyContinue).Sum
        return if ($size) { $size } else { 0 }
    } catch {
        return 0
    }
}

function Remove-CacheItem {
    param(
        [string]$Path,
        [string]$Description
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        Write-LogVerbose "跳过不存在的路径: $Path"
        return
    }

    if (-not (Test-IsSafeCachePath -Path $Path)) {
        return
    }

    $size = 0
    $fileCount = 0
    $isContainer = Test-Path -LiteralPath $Path -PathType Container

    if ($isContainer) {
        $items = @(Get-ChildItem -LiteralPath $Path -Recurse -File -Force -ErrorAction SilentlyContinue)
        $size = ($items | Measure-Object -Property Length -Sum -ErrorAction SilentlyContinue).Sum
        $fileCount = $items.Count
    } else {
        $size = (Get-Item -LiteralPath $Path -ErrorAction SilentlyContinue).Length
        $fileCount = 1
    }

    if ($null -eq $size) {
        $size = 0
    }

    if (-not $isContainer -and $fileCount -eq 0) {
        Write-LogVerbose "跳过空路径: $Path"
        return
    }

    $sizeStr = Format-FileSize $size

    if ($WhatIf) {
        $detail = if ($isContainer -and $fileCount -eq 0) { "空目录" } else { "$fileCount 个文件" }
        Write-Host "  [预览] ${Description}: $sizeStr ($detail)" -ForegroundColor Yellow
        return
    }

    try {
        Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
        $detail = if ($isContainer -and $fileCount -eq 0) { "空目录" } else { "$fileCount 个文件" }
        Write-LogSuccess "${Description}: $sizeStr ($detail)"
        $script:TotalFreed += $size
        $script:TotalFiles += $fileCount
    } catch {
        Write-LogError "删除失败 ${Description}: $_"
    }
}

function Remove-CacheDirectoryFiles {
    param(
        [string]$Path,
        [string]$Description
    )

    if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
        Write-LogVerbose "跳过不存在的目录: $Path"
        return
    }

    if (-not (Test-IsSafeCachePath -Path $Path)) {
        return
    }

    $items = @(Get-ChildItem -LiteralPath $Path -Recurse -File -Force -ErrorAction SilentlyContinue)
    $size = ($items | Measure-Object -Property Length -Sum -ErrorAction SilentlyContinue).Sum
    $fileCount = $items.Count
    if ($null -eq $size) {
        $size = 0
    }

    if ($fileCount -eq 0) {
        Write-LogVerbose "跳过无文件目录: $Path"
        return
    }

    $sizeStr = Format-FileSize $size

    if ($WhatIf) {
        Write-Host "  [预览] ${Description}: $sizeStr ($fileCount 个文件，保留目录)" -ForegroundColor Yellow
        return
    }

    $removedSize = 0
    $removedFiles = 0
    foreach ($item in $items) {
        try {
            Remove-Item -LiteralPath $item.FullName -Force -ErrorAction Stop
            $removedSize += $item.Length
            $removedFiles++
        } catch {
            Write-LogError "删除失败 $($item.FullName): $_"
        }
    }

    if ($removedFiles -gt 0) {
        Write-LogSuccess "${Description}: $(Format-FileSize $removedSize) ($removedFiles 个文件，保留目录)"
        $script:TotalFreed += $removedSize
        $script:TotalFiles += $removedFiles
    }
}

# ──────────────────────────────────────────────
# 清理后端缓存（Go）
# ──────────────────────────────────────────────

function Clear-BackendCache {
    Write-LogStep "清理后端缓存（Go）..."

    if (-not (Test-Path -LiteralPath $script:BackendPath)) {
        Write-LogWarning "未发现后端目录: $script:BackendPath"
        return
    }

    # Go 覆盖率/剖析文件
    $backendCoverageFiles = @(
        (Join-Path $script:BackendPath "coverage.out"),
        (Join-Path $script:BackendPath "coverage.html"),
        (Join-Path $script:BackendPath "cover.out"),
        (Join-Path $script:BackendPath "cover.html")
    )
    foreach ($f in $backendCoverageFiles) {
        if (Test-Path -LiteralPath $f) {
            Remove-CacheItem -Path $f -Description "后端覆盖率文件 ($([IO.Path]::GetFileName($f)))"
        }
    }

    # Go 测试/构建过程中可能产生的临时目录
    $backendTempDirs = @(
        (Join-Path $script:BackendPath "tmp"),
        (Join-Path $script:BackendPath ".tmp")
    )
    foreach ($d in $backendTempDirs) {
        if (Test-Path -LiteralPath $d) {
            Remove-CacheItem -Path $d -Description "后端临时目录 ($([IO.Path]::GetFileName($d)))"
        }
    }

    # 清理 Go 全局缓存（标准 GOPATH/GOCACHE 路径）
    $pushedLocation = $false
    try {
        $null = Get-Command "go" -ErrorAction Stop
        if ($WhatIf) {
            Write-Host "  [预览] Go 编译/测试缓存（go clean -cache -testcache）" -ForegroundColor Yellow
            return
        }

        Write-LogInfo "执行: go clean -cache -testcache（清理 Go 编译/测试缓存）"
        Push-Location $script:BackendPath
        $pushedLocation = $true
        & go clean -cache -testcache | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "go clean 退出代码: $LASTEXITCODE"
        }
        Write-LogSuccess "Go 缓存清理完成（go clean）"
    } catch {
        Write-LogWarning "跳过 go clean（未安装 Go 或执行失败）：$($_.Exception.Message)"
    } finally {
        if ($pushedLocation) {
            Pop-Location
        }
    }
}

# ──────────────────────────────────────────────
# 清理前端缓存
# ──────────────────────────────────────────────

function Clear-FrontendCache {
    Write-LogStep "清理前端缓存..."

    # node_modules/.cache
    $nodeCache = Join-Path $script:FrontendPath "node_modules\.cache"
    if (Test-Path -LiteralPath $nodeCache) {
        Remove-CacheItem -Path $nodeCache -Description "npm/pnpm 缓存"
    }

    # Next.js 构建缓存
    $nextCache = Join-Path $script:FrontendPath ".next"
    if (Test-Path -LiteralPath $nextCache) {
        Remove-CacheItem -Path $nextCache -Description "Next.js 构建缓存"
    }

    # 构建输出目录
    $buildDirs = @("dist", "build", "out")
    foreach ($dir in $buildDirs) {
        $path = Join-Path $script:FrontendPath $dir
        if (Test-Path -LiteralPath $path) {
            Remove-CacheItem -Path $path -Description "前端构建输出 ($dir)"
        }
    }

    # Turbo 缓存
    $turboCache = Join-Path $script:FrontendPath ".turbo"
    if (Test-Path -LiteralPath $turboCache) {
        Remove-CacheItem -Path $turboCache -Description "Turbo 构建缓存"
    }

    # ESLint 缓存
    $eslintCache = Join-Path $script:FrontendPath ".eslintcache"
    if (Test-Path -LiteralPath $eslintCache) {
        Remove-CacheItem -Path $eslintCache -Description "ESLint 缓存"
    }

    # SWC (Speedy Web Compiler) 缓存
    $swcCache = Join-Path $script:FrontendPath ".swc"
    if (Test-Path -LiteralPath $swcCache) {
        Remove-CacheItem -Path $swcCache -Description "SWC 编译器缓存"
    }
}

# ──────────────────────────────────────────────
# 清理日志文件
# ──────────────────────────────────────────────

function Clear-LogFiles {
    Write-LogStep "清理日志文件..."

    # 需要扫描的日志目录列表
    $logDirs = @($script:LogsPath)
    if (Test-Path -LiteralPath $script:BackendLogsPath) {
        $logDirs += $script:BackendLogsPath
    }

    $cutoffDate = (Get-Date).AddDays(-7)
    $foundAny = $false

    foreach ($logDir in $logDirs) {
        if (-not (Test-Path -LiteralPath $logDir)) {
            Write-LogVerbose "日志目录不存在，跳过: $logDir"
            continue
        }

        $oldLogs = Get-ChildItem -LiteralPath $logDir -Recurse -Include "*.log" -File -Force -ErrorAction SilentlyContinue |
                    Where-Object { $_.LastWriteTime -lt $cutoffDate }

        if ($oldLogs.Count -eq 0) {
            Write-LogVerbose "$logDir 中没有超过7天的日志文件"
            continue
        }

        $foundAny = $true
        foreach ($log in $oldLogs) {
            $relPath = Get-RelativeProjectPath -Path $log.FullName
            Remove-CacheItem -Path $log.FullName -Description "旧日志文件 ($relPath)"
        }
    }

    if (-not $foundAny) {
        Write-LogInfo "没有超过7天的日志文件"
    }
}

# ──────────────────────────────────────────────
# 清理操作系统临时文件
# ──────────────────────────────────────────────

function Clear-TempFiles {
    Write-LogStep "清理临时文件..."

    # .DS_Store (macOS)
    Get-ProjectFileItems -RootPath $script:ProjectRoot -Filter ".DS_Store" | ForEach-Object {
        Remove-CacheItem -Path $_.FullName -Description "macOS 系统文件 (.DS_Store)"
    }

    # Thumbs.db (Windows)
    Get-ProjectFileItems -RootPath $script:ProjectRoot -Filter "Thumbs.db" | ForEach-Object {
        Remove-CacheItem -Path $_.FullName -Description "Windows 缩略图 (Thumbs.db)"
    }

    # *.tmp 文件
    Get-ProjectFileItems -RootPath $script:ProjectRoot -Filter "*.tmp" | ForEach-Object {
        $relPath = Get-RelativeProjectPath -Path $_.FullName
        Remove-CacheItem -Path $_.FullName -Description "临时文件 ($relPath)"
    }
}

# ──────────────────────────────────────────────
# 清理项目特定临时文件
# ──────────────────────────────────────────────

function Clear-ProjectSpecificCache {
    Write-LogStep "清理项目特定临时文件..."

    # 运行时配置文件
    $contextJson = Join-Path $script:ProjectRoot "context.json"
    if (Test-Path -LiteralPath $contextJson) {
        Remove-CacheItem -Path $contextJson -Description "运行时配置 (context.json)"
    }

    # 前端 Lint 报告
    $frontendLintReport = Join-Path $script:FrontendPath "lint-report.json"
    if (Test-Path -LiteralPath $frontendLintReport) {
        Remove-CacheItem -Path $frontendLintReport -Description "ESLint 报告 (lint-report.json)"
    }

    $frontendLintResult = Join-Path $script:FrontendPath "lint-result.json"
    if (Test-Path -LiteralPath $frontendLintResult) {
        Remove-CacheItem -Path $frontendLintResult -Description "ESLint 结果 (lint-result.json)"
    }

    # 前端覆盖率报告
    $frontendCoverageReport = Join-Path $script:FrontendPath "coverage-report"
    if (Test-Path -LiteralPath $frontendCoverageReport) {
        Remove-CacheItem -Path $frontendCoverageReport -Description "前端覆盖率报告"
    }

    # TypeScript 构建信息
    Get-ProjectFileItems -RootPath $script:FrontendPath -Filter "*.tsbuildinfo" | ForEach-Object {
        Remove-CacheItem -Path $_.FullName -Description "TypeScript 构建信息 ($($_.Name))"
    }

    # 后端覆盖率文件（Go）
    $backendCoverage = Join-Path $script:BackendPath "coverage.out"
    if (Test-Path -LiteralPath $backendCoverage) {
        Remove-CacheItem -Path $backendCoverage -Description "后端覆盖率数据 (coverage.out)"
    }

    # 前端认证令牌（开发环境临时文件）—— 仅警告，不自动删除
    $frontendAuth = Join-Path $script:FrontendPath "auth.json"
    if (Test-Path -LiteralPath $frontendAuth) {
        Write-LogWarning "发现前端认证文件 (auth.json)，如需清理请手动删除"
        Write-LogVerbose "路径: $frontendAuth"
    }

    # Vitest 测试缓存
    $vitestCache = Join-Path $script:FrontendPath ".vitest"
    if (Test-Path -LiteralPath $vitestCache) {
        Remove-CacheItem -Path $vitestCache -Description "Vitest 测试缓存"
    }

    # Playwright MCP 服务端产生的日志与快照
    $playwrightMcp = Join-Path $script:ProjectRoot ".playwright-mcp"
    if (Test-Path -LiteralPath $playwrightMcp) {
        Remove-CacheDirectoryFiles -Path $playwrightMcp -Description "Playwright MCP 快照与日志"
    }

    # Go 临时工作目录
    $goTmp = Join-Path $script:ProjectRoot ".gotmp"
    if (Test-Path -LiteralPath $goTmp) {
        Remove-CacheItem -Path $goTmp -Description "Go 临时目录 (.gotmp)"
    }
}

# ──────────────────────────────────────────────
# 清理 Go 构建缓存与编译产物（非标准路径）
# ──────────────────────────────────────────────

function Clear-GoBuildArtifacts {
    Write-LogStep "清理 Go 构建缓存与编译产物..."

    # 项目根目录下的 Go 缓存（非标准 GOPATH/GOCACHE 路径）
    $rootGoCaches = @(
        (Join-Path $script:ProjectRoot ".gocache"),
        (Join-Path $script:ProjectRoot ".gomodcache")
    )
    foreach ($d in $rootGoCaches) {
        if (Test-Path -LiteralPath $d) {
            Remove-CacheItem -Path $d -Description "Go 缓存目录 ($([IO.Path]::GetFileName($d)))"
        }
    }

    # .cache 目录下的 Go 子缓存（go-build / go-mod）
    $cacheDir = Join-Path $script:ProjectRoot ".cache"
    if (Test-Path -LiteralPath $cacheDir) {
        $goSubCaches = @("go-build", "go-mod")
        foreach ($sub in $goSubCaches) {
            $subPath = Join-Path $cacheDir $sub
            if (Test-Path -LiteralPath $subPath) {
                Remove-CacheItem -Path $subPath -Description "Go 缓存目录 (.cache/$sub)"
            }
        }
        # 如果 .cache 目录在清理后为空，则一并移除
        $remaining = Get-ChildItem -LiteralPath $cacheDir -Force -ErrorAction SilentlyContinue
        if (-not $remaining) {
            Remove-CacheItem -Path $cacheDir -Description "空缓存目录 (.cache)"
        }
    }

    # backend-go 内部的 Go 缓存（可能由 IDE 或本地环境变量产生）
    $backendGoCaches = @(
        (Join-Path $script:BackendPath ".gocache"),
        (Join-Path $script:BackendPath ".gomodcache")
    )
    foreach ($d in $backendGoCaches) {
        if (Test-Path -LiteralPath $d) {
            Remove-CacheItem -Path $d -Description "后端 Go 缓存目录 (backend-go/$([IO.Path]::GetFileName($d)))"
        }
    }

    # Go 编译产物（可执行文件）
    $goExePatterns = @("*.exe")
    foreach ($pattern in $goExePatterns) {
        Get-ChildItem -LiteralPath $script:BackendPath -Filter $pattern -File -ErrorAction SilentlyContinue | ForEach-Object {
            Remove-CacheItem -Path $_.FullName -Description "Go 编译产物 ($($_.Name))"
        }
    }

    # 后端重复输出目录（历史构建可能生成 backend-go/backend-go）
    $backendNestedOutput = Join-Path $script:BackendPath "backend-go"
    if (Test-Path -LiteralPath $backendNestedOutput) {
        Remove-CacheDirectoryFiles -Path $backendNestedOutput -Description "后端重复输出目录文件 (backend-go/backend-go)"
    }

    # Go 覆盖率 / 剖析文件（根目录级别）
    $rootCoverageFiles = @(
        (Join-Path $script:ProjectRoot "coverage.out"),
        (Join-Path $script:ProjectRoot "coverage.html"),
        (Join-Path $script:ProjectRoot "cover.out"),
        (Join-Path $script:ProjectRoot "cover.html")
    )
    foreach ($f in $rootCoverageFiles) {
        if (Test-Path -LiteralPath $f) {
            Remove-CacheItem -Path $f -Description "Go 覆盖率文件（根目录）($([IO.Path]::GetFileName($f)))"
        }
    }
}

# ──────────────────────────────────────────────
# 清理包管理器缓存（pnpm store）
# ──────────────────────────────────────────────

function Clear-PackageManagerCache {
    Write-LogStep "清理包管理器缓存..."

    if (-not $WhatIf -and -not $Force) {
        Write-LogWarning "即将删除 pnpm store，下次安装依赖时将重新下载所有包。"
        $confirm = Read-Host "确认清理包管理器缓存？ (Y/N)"
        if ($confirm -ne "Y" -and $confirm -ne "y") {
            Write-LogInfo "已跳过包管理器缓存清理"
            return
        }
    }

    if ($WhatIf) {
        Write-LogWarning "预览模式：包管理器缓存需要重新下载（pnpm）"
    }

    # pnpm store（项目根目录）
    $pnpmStoreRoot = Join-Path $script:ProjectRoot ".pnpm-store"
    if (Test-Path -LiteralPath $pnpmStoreRoot) {
        Remove-CacheItem -Path $pnpmStoreRoot -Description "pnpm 全局存储 (.pnpm-store)"
    }

    # pnpm store（前端目录内）
    $pnpmStoreFrontend = Join-Path $script:FrontendPath ".pnpm-store"
    if (Test-Path -LiteralPath $pnpmStoreFrontend) {
        Remove-CacheItem -Path $pnpmStoreFrontend -Description "pnpm 存储 (frontend/.pnpm-store)"
    }
}

# ──────────────────────────────────────────────
# 清理 Playwright 测试产物
# ──────────────────────────────────────────────

function Clear-PlaywrightArtifacts {
    Write-LogStep "清理 Playwright 测试产物..."

    # Playwright HTML 测试报告
    $pwReport = Join-Path $script:FrontendPath "playwright-report"
    if (Test-Path -LiteralPath $pwReport) {
        Remove-CacheItem -Path $pwReport -Description "Playwright 测试报告"
    }

    # Playwright 测试结果（含认证状态、运行记录等）
    $pwResults = Join-Path $script:FrontendPath "test-results"
    if (Test-Path -LiteralPath $pwResults) {
        Remove-CacheItem -Path $pwResults -Description "Playwright 测试结果"
    }

    # Playwright MCP 服务端快照与日志（同时由 Clear-ProjectSpecificCache 覆盖，
    # 此处保留以支持独立 -Playwright 调用）
    $pwMcp = Join-Path $script:ProjectRoot ".playwright-mcp"
    if (Test-Path -LiteralPath $pwMcp) {
        Remove-CacheDirectoryFiles -Path $pwMcp -Description "Playwright MCP 快照与日志"
    }
}

# ──────────────────────────────────────────────
# 清理摘要
# ──────────────────────────────────────────────

function Show-Summary {
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "  清理摘要" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host ""

    if ($WhatIf) {
        Write-Host "  模式:     预览模式（未实际删除）" -ForegroundColor Yellow
    } else {
        Write-Host "  已删除:   $script:TotalFiles 个文件" -ForegroundColor Green
        Write-Host "  释放空间: " -NoNewline
        Write-Host (Format-FileSize $script:TotalFreed) -ForegroundColor Green
    }

    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host ""
}

# ──────────────────────────────────────────────
# 交互式菜单
# ──────────────────────────────────────────────

function Show-InteractiveMenu {
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "  缓存清理选项" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  ── 核心清理 ──"
    Write-Host "  [1] 清理所有缓存（推荐）"
    Write-Host "  [2] 仅清理后端缓存（Go 覆盖率 / go clean）"
    Write-Host "  [3] 仅清理前端缓存（Next.js / Turbo / ESLint / SWC）"
    Write-Host "  [4] 仅清理日志文件（logs/ + backend-go/logs/）"
    Write-Host "  [5] 仅清理临时文件（.DS_Store / Thumbs.db / *.tmp）"
    Write-Host "  [6] 仅清理项目特定文件（lint 报告 / 覆盖率 / MCP 快照等）"
    Write-Host "  ── 扩展清理 ──"
    Write-Host "  [7] Go 构建缓存与编译产物（.gocache / app.exe / backend-go/backend-go 等）"
    Write-Host "  [8] 包管理器缓存（pnpm store）⚠ 需重新下载"
    Write-Host "  [9] Playwright 测试产物（报告 / 测试结果 / MCP 快照）"
    Write-Host "  ──"
    Write-Host "  [0] 取消"
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host ""

    $choice = Read-Host "请选择 (0-9)"

    switch ($choice) {
        "1"  { $script:Selection["All"] = $true }
        "2"  { $script:Selection["Backend"] = $true }
        "3"  { $script:Selection["Frontend"] = $true }
        "4"  { $script:Selection["Logs"] = $true }
        "5"  { $script:Selection["Temp"] = $true }
        "6"  { $script:Selection["ProjectFiles"] = $true }
        "7"  { $script:Selection["GoBuild"] = $true }
        "8"  { $script:Selection["PackageCache"] = $true }
        "9"  { $script:Selection["Playwright"] = $true }
        "0"  {
            Write-LogInfo "已取消清理操作"
            exit 0
        }
        default {
            Write-LogError "无效的选择"
            exit 1
        }
    }
}

# ──────────────────────────────────────────────
# 主函数
# ──────────────────────────────────────────────

function Main {
    Write-Host ""
    Write-Host "🧹 企业级网络设备巡检系统 - 缓存清理" -ForegroundColor Cyan
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host ""

    # 显示帮助
    if ($Help) {
        Show-Help
        exit 0
    }

    # 如果没有指定任何选项，显示交互式菜单
    $hasSelection = $script:Selection.Values -contains $true
    if (-not $hasSelection) {
        Show-InteractiveMenu
    }

    # 确认操作（-Force 或 -WhatIf 模式跳过）
    if (-not $Force -and -not $WhatIf) {
        Write-Host ""
        $confirm = Read-Host "确认要清理缓存吗？ (Y/N)"
        if ($confirm -ne "Y" -and $confirm -ne "y") {
            Write-LogInfo "已取消清理操作"
            exit 0
        }
        Write-Host ""
    }

    if ($WhatIf) {
        Write-LogWarning "预览模式：将显示要删除的内容，但不会实际删除"
        Write-Host ""
    }

    # 执行清理
    if ($script:Selection["All"] -or $script:Selection["Backend"]) {
        Clear-BackendCache
    }

    if ($script:Selection["All"] -or $script:Selection["Frontend"]) {
        Clear-FrontendCache
    }

    if ($script:Selection["All"] -or $script:Selection["Logs"]) {
        Clear-LogFiles
    }

    if ($script:Selection["All"] -or $script:Selection["Temp"]) {
        Clear-TempFiles
    }

    if ($script:Selection["All"] -or $script:Selection["ProjectFiles"]) {
        Clear-ProjectSpecificCache
    }

    if ($script:Selection["All"] -or $script:Selection["GoBuild"]) {
        Clear-GoBuildArtifacts
    }

    if ($script:Selection["All"] -or $script:Selection["PackageCache"]) {
        Clear-PackageManagerCache
    }

    if ($script:Selection["All"] -or $script:Selection["Playwright"]) {
        Clear-PlaywrightArtifacts
    }

    # 显示摘要
    Show-Summary

    if (-not $WhatIf) {
        Write-LogSuccess "缓存清理完成！"
    }
}

# 执行主函数
Main
