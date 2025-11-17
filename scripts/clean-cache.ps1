# 企业级网络设备巡检系统 - 缓存清理脚本
# 用于清理项目中的各类缓存文件，释放磁盘空间，加速开发构建

param(
    [switch]$All,           # 清理所有缓存
    [switch]$Python,        # 仅清理 Python 缓存
    [switch]$Frontend,      # 仅清理前端缓存
    [switch]$Logs,          # 清理日志文件
    [switch]$Temp,          # 清理临时文件
    [switch]$Force,         # 跳过确认直接清理
    [switch]$WhatIf,        # 预览将要删除的内容（不实际删除）
    [switch]$Verbose,       # 详细输出
    [switch]$Help           # 显示帮助信息
)

$ErrorActionPreference = "Continue"

# 全局变量
$script:ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:ProjectRoot = Split-Path -Parent $script:ScriptPath
$script:BackendPath = Join-Path $script:ProjectRoot "backend"
$script:FrontendPath = Join-Path $script:ProjectRoot "frontend"
$script:LogsPath = Join-Path $script:ProjectRoot "logs"
$script:TotalFreed = 0
$script:TotalFiles = 0

# 日志函数
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

# 显示帮助信息
function Show-Help {
    Write-Host "企业级网络设备巡检系统 - 缓存清理脚本" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "用法:"
    Write-Host "    .\clean-cache.ps1 [选项]"
    Write-Host ""
    Write-Host "清理选项:"
    Write-Host "    -All                清理所有缓存（Python + 前端 + 日志 + 临时文件）"
    Write-Host "    -Python             仅清理 Python 缓存（__pycache__, .pyc, pytest, mypy等）"
    Write-Host "    -Frontend           仅清理前端缓存（node_modules/.cache, .next, dist等）"
    Write-Host "    -Logs               清理日志文件（超过7天的日志）"
    Write-Host "    -Temp               清理临时文件（.DS_Store, Thumbs.db, *.tmp等）"
    Write-Host ""
    Write-Host "执行选项:"
    Write-Host "    -Force              跳过确认直接清理"
    Write-Host "    -WhatIf             预览将要删除的内容（不实际删除）"
    Write-Host "    -Verbose            显示详细输出"
    Write-Host "    -Help               显示此帮助信息"
    Write-Host ""
    Write-Host "示例:"
    Write-Host "    .\clean-cache.ps1                      # 交互式选择清理项"
    Write-Host "    .\clean-cache.ps1 -All -Force          # 清理所有缓存，不确认"
    Write-Host "    .\clean-cache.ps1 -Python              # 仅清理 Python 缓存"
    Write-Host "    .\clean-cache.ps1 -WhatIf              # 预览将要删除的内容"
    Write-Host "    .\clean-cache.ps1 -All -Verbose        # 清理所有并显示详细信息"
    Write-Host ""
    Write-Host "说明:"
    Write-Host "    🧹 安全清理项目缓存文件"
    Write-Host "    📊 显示清理前后空间统计"
    Write-Host "    🔍 支持预览模式"
    Write-Host "    ⚡ 加速开发和构建"
    Write-Host "    🛡️ 避免删除重要文件"
    Write-Host ""
}

# 格式化文件大小
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

# 计算目录大小
function Get-DirectorySize {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        return 0
    }

    try {
        $size = (Get-ChildItem -Path $Path -Recurse -File -ErrorAction SilentlyContinue |
                 Measure-Object -Property Length -Sum -ErrorAction SilentlyContinue).Sum
        return if ($size) { $size } else { 0 }
    } catch {
        return 0
    }
}

# 删除目录或文件
function Remove-CacheItem {
    param(
        [string]$Path,
        [string]$Description
    )

    if (-not (Test-Path $Path)) {
        Write-LogVerbose "跳过不存在的路径: $Path"
        return
    }

    $size = 0
    $fileCount = 0

    # 计算大小
    if (Test-Path $Path -PathType Container) {
        $items = Get-ChildItem -Path $Path -Recurse -File -ErrorAction SilentlyContinue
        $size = ($items | Measure-Object -Property Length -Sum -ErrorAction SilentlyContinue).Sum
        $fileCount = $items.Count
    } else {
        $size = (Get-Item $Path -ErrorAction SilentlyContinue).Length
        $fileCount = 1
    }

    if ($size -eq 0 -and $fileCount -eq 0) {
        Write-LogVerbose "跳过空路径: $Path"
        return
    }

    $sizeStr = Format-FileSize $size

    if ($WhatIf) {
        Write-Host "  [预览] ${Description}: $sizeStr ($fileCount 个文件)" -ForegroundColor Yellow
        return
    }

    try {
        Remove-Item -Path $Path -Recurse -Force -ErrorAction Stop
        Write-LogSuccess "${Description}: $sizeStr ($fileCount 个文件)"
        $script:TotalFreed += $size
        $script:TotalFiles += $fileCount
    } catch {
        Write-LogError "删除失败 ${Description}: $_"
    }
}

# 清理 Python 缓存
function Clear-PythonCache {
    Write-LogStep "清理 Python 缓存..."

    # __pycache__ 目录
    Get-ChildItem -Path $script:BackendPath -Recurse -Directory -Filter "__pycache__" -ErrorAction SilentlyContinue | ForEach-Object {
        Remove-CacheItem -Path $_.FullName -Description "Python 字节码缓存 (__pycache__)"
    }

    # .pyc 和 .pyo 文件
    Get-ChildItem -Path $script:BackendPath -Recurse -Include "*.pyc","*.pyo" -File -ErrorAction SilentlyContinue | ForEach-Object {
        Remove-CacheItem -Path $_.FullName -Description "Python 编译文件"
    }

    # pytest 缓存
    $pytestCache = Join-Path $script:BackendPath ".pytest_cache"
    if (Test-Path $pytestCache) {
        Remove-CacheItem -Path $pytestCache -Description "pytest 测试缓存"
    }

    # mypy 缓存
    $mypyCache = Join-Path $script:BackendPath ".mypy_cache"
    if (Test-Path $mypyCache) {
        Remove-CacheItem -Path $mypyCache -Description "mypy 类型检查缓存"
    }

    # 构建产物
    $buildDirs = @("build", "dist")
    foreach ($dir in $buildDirs) {
        $path = Join-Path $script:BackendPath $dir
        if (Test-Path $path) {
            Remove-CacheItem -Path $path -Description "Python 构建产物 ($dir)"
        }
    }

    # .egg-info 目录
    Get-ChildItem -Path $script:BackendPath -Recurse -Directory -Filter "*.egg-info" -ErrorAction SilentlyContinue | ForEach-Object {
        Remove-CacheItem -Path $_.FullName -Description "Python 包信息 (.egg-info)"
    }
}

# 清理前端缓存
function Clear-FrontendCache {
    Write-LogStep "清理前端缓存..."

    # node_modules/.cache
    $nodeCache = Join-Path $script:FrontendPath "node_modules\.cache"
    if (Test-Path $nodeCache) {
        Remove-CacheItem -Path $nodeCache -Description "npm/pnpm 缓存"
    }

    # Next.js 缓存
    $nextCache = Join-Path $script:FrontendPath ".next"
    if (Test-Path $nextCache) {
        Remove-CacheItem -Path $nextCache -Description "Next.js 构建缓存"
    }

    # 构建输出
    $buildDirs = @("dist", "build", "out")
    foreach ($dir in $buildDirs) {
        $path = Join-Path $script:FrontendPath $dir
        if (Test-Path $path) {
            Remove-CacheItem -Path $path -Description "前端构建输出 ($dir)"
        }
    }

    # Turbo 缓存
    $turboCache = Join-Path $script:FrontendPath ".turbo"
    if (Test-Path $turboCache) {
        Remove-CacheItem -Path $turboCache -Description "Turbo 构建缓存"
    }

    # ESLint 缓存
    $eslintCache = Join-Path $script:FrontendPath ".eslintcache"
    if (Test-Path $eslintCache) {
        Remove-CacheItem -Path $eslintCache -Description "ESLint 缓存"
    }
}

# 清理日志文件
function Clear-LogFiles {
    Write-LogStep "清理日志文件..."

    if (-not (Test-Path $script:LogsPath)) {
        Write-LogInfo "日志目录不存在，跳过"
        return
    }

    # 清理超过7天的日志
    $cutoffDate = (Get-Date).AddDays(-7)
    $oldLogs = Get-ChildItem -Path $script:LogsPath -Recurse -Include "*.log" -File -ErrorAction SilentlyContinue |
                Where-Object { $_.LastWriteTime -lt $cutoffDate }

    if ($oldLogs.Count -eq 0) {
        Write-LogInfo "没有超过7天的日志文件"
        return
    }

    foreach ($log in $oldLogs) {
        Remove-CacheItem -Path $log.FullName -Description "旧日志文件 ($($log.Name))"
    }
}

# 清理临时文件
function Clear-TempFiles {
    Write-LogStep "清理临时文件..."

    # .DS_Store (macOS)
    Get-ChildItem -Path $script:ProjectRoot -Recurse -Filter ".DS_Store" -File -ErrorAction SilentlyContinue | ForEach-Object {
        Remove-CacheItem -Path $_.FullName -Description "macOS 系统文件 (.DS_Store)"
    }

    # Thumbs.db (Windows)
    Get-ChildItem -Path $script:ProjectRoot -Recurse -Filter "Thumbs.db" -File -ErrorAction SilentlyContinue | ForEach-Object {
        Remove-CacheItem -Path $_.FullName -Description "Windows 缩略图 (Thumbs.db)"
    }

    # *.tmp 文件
    Get-ChildItem -Path $script:ProjectRoot -Recurse -Filter "*.tmp" -File -ErrorAction SilentlyContinue | ForEach-Object {
        Remove-CacheItem -Path $_.FullName -Description "临时文件 (*.tmp)"
    }
}

# 显示清理摘要
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

# 交互式选择
function Show-InteractiveMenu {
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "  缓存清理选项" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  [1] 清理所有缓存"
    Write-Host "  [2] 仅清理 Python 缓存"
    Write-Host "  [3] 仅清理前端缓存"
    Write-Host "  [4] 仅清理日志文件"
    Write-Host "  [5] 仅清理临时文件"
    Write-Host "  [0] 取消"
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host ""

    $choice = Read-Host "请选择 (0-5)"

    switch ($choice) {
        "1" { $script:All = $true }
        "2" { $script:Python = $true }
        "3" { $script:Frontend = $true }
        "4" { $script:Logs = $true }
        "5" { $script:Temp = $true }
        "0" {
            Write-LogInfo "已取消清理操作"
            exit 0
        }
        default {
            Write-LogError "无效的选择"
            exit 1
        }
    }
}

# 主函数
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
    if (-not ($All -or $Python -or $Frontend -or $Logs -or $Temp)) {
        Show-InteractiveMenu
    }

    # 确认操作
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
    if ($All -or $Python) {
        Clear-PythonCache
    }

    if ($All -or $Frontend) {
        Clear-FrontendCache
    }

    if ($All -or $Logs) {
        Clear-LogFiles
    }

    if ($All -or $Temp) {
        Clear-TempFiles
    }

    # 显示摘要
    Show-Summary

    if (-not $WhatIf) {
        Write-LogSuccess "缓存清理完成！"
    }
}

# 执行主函数
Main
