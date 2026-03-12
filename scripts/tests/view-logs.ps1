#!/usr/bin/env pwsh
<#
.SYNOPSIS
    日志查看工具（简化版，适配当前项目日志目录）

.DESCRIPTION
    自动扫描项目根目录下的 logs/ 目录（递归查找 *.log），支持：
    - 按服务（日志子目录名）筛选
    - 关键词过滤
    - 日志级别过滤（按行中出现的 DEBUG/INFO/WARN/ERROR 等关键字）
    - 时间范围过滤（解析行首时间戳）
    - Tail/Follow
    - 统计与导出

.PARAMETER Service
    服务名（即 logs/ 下的一级子目录名），如 backend-go。默认 all。

.PARAMETER Tail
    每个文件读取最后 N 行（默认 200）。

.PARAMETER Follow
    实时跟踪（仅支持单文件或单服务且最终只命中一个文件）。

.PARAMETER Filter
    关键词过滤（对原始行做包含匹配）。

.PARAMETER Level
    级别过滤（debug/info/warn/error/fatal/panic）。

.PARAMETER Since
    起始时间（格式示例：2026-03-11 11:11:06）。

.PARAMETER Until
    结束时间（格式同 Since）。

.PARAMETER Stats
    输出统计信息（按级别计数）。

.PARAMETER ExportPath
    导出到指定文件（UTF-8）。仅导出最终过滤后的行。

.EXAMPLE
    .\scripts\tests\view-logs.ps1

.EXAMPLE
    .\scripts\tests\view-logs.ps1 -Service backend-go -Tail 300

.EXAMPLE
    .\scripts\tests\view-logs.ps1 -Filter "ERROR" -Stats

.EXAMPLE
    .\scripts\tests\view-logs.ps1 -Service backend-go -Follow
#>

[CmdletBinding()]
param(
    [string]$Service = "all",
    [int]$Tail = 200,
    [switch]$Follow,
    [string]$Filter = "",
    [ValidateSet("", "debug", "info", "warn", "error", "fatal", "panic")]
    [string]$Level = "",
    [string]$Since = "",
    [string]$Until = "",
    [switch]$Stats,
    [string]$ExportPath = "",
    [switch]$Help
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$script:ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:ScriptsRoot = Split-Path -Parent $script:ScriptPath
$script:ProjectRoot = Split-Path -Parent $script:ScriptsRoot
$script:LogsRoot = Join-Path $script:ProjectRoot "logs"

function Write-Info { param([string]$m) Write-Host "[信息] $m" -ForegroundColor Cyan }
function Write-Warn { param([string]$m) Write-Host "[警告] $m" -ForegroundColor Yellow }
function Write-Err { param([string]$m) Write-Host "[错误] $m" -ForegroundColor Red }

function Show-Help {
    Write-Host "日志查看工具（自动扫描 logs/*.log）" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "用法:"
    Write-Host "  .\\view-logs.ps1 [-Service <name|all>] [-Tail <n>] [-Follow] [-Filter <text>] [-Level <debug|info|warn|error|fatal|panic>] [-Since <time>] [-Until <time>] [-Stats] [-ExportPath <file>]"
    Write-Host ""
    Write-Host "示例:"
    Write-Host "  .\\view-logs.ps1"
    Write-Host "  .\\view-logs.ps1 -Service backend-go -Tail 300"
    Write-Host "  .\\view-logs.ps1 -Filter 'ERROR' -Stats"
    Write-Host "  .\\view-logs.ps1 -Service backend-go -Follow"
    Write-Host ""
    Write-Host "说明:"
    Write-Host "  - Service 为 logs/ 下的一级子目录名；Service=all 表示全部"
    Write-Host "  - Follow 仅支持最终命中 1 个文件（避免多文件实时混流导致难以阅读）"
    Write-Host ""
}

function Try-ParseTime {
    param([string]$Value)
    if ([string]::IsNullOrWhiteSpace($Value)) { return $null }
    try { return [DateTime]::Parse($Value) } catch { return $null }
}

function Try-ParseLineTimestamp {
    param([string]$Line)
    if ([string]::IsNullOrWhiteSpace($Line)) { return $null }

    # 兼容：2026-03-11 11:11:06.878 | INFO | ...
    # 兼容：2026-03-11T11:11:06Z ...
    $pattern = '^\s*(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d{1,9})?(Z)?'
    if ($Line -match $pattern) {
        $raw = "$($matches[1]) $($matches[2])"
        try { return [DateTime]::Parse($raw) } catch { return $null }
    }
    return $null
}

function Get-LineLevel {
    param([string]$Line)
    if ([string]::IsNullOrWhiteSpace($Line)) { return "" }
    if ($Line -match '\b(DEBUG|INFO|WARN|WARNING|ERROR|FATAL|PANIC)\b') {
        $v = $matches[1].ToUpper()
        if ($v -eq "WARNING") { return "WARN" }
        return $v
    }
    return ""
}

function Test-Line {
    param(
        [string]$Line,
        [DateTime]$SinceTime,
        [DateTime]$UntilTime,
        [string]$Needle,
        [string]$NeedLevel
    )

    if ([string]::IsNullOrWhiteSpace($Line)) { return $false }

    if (-not [string]::IsNullOrWhiteSpace($Needle)) {
        if ($Line -notlike "*$Needle*") { return $false }
    }

    if (-not [string]::IsNullOrWhiteSpace($NeedLevel)) {
        $lineLevel = Get-LineLevel $Line
        $expect = $NeedLevel.ToUpper()
        if ($expect -eq "WARN") { $expect = "WARN" }
        if ($lineLevel -ne $expect) { return $false }
    }

    if ($null -ne $SinceTime -or $null -ne $UntilTime) {
        $ts = Try-ParseLineTimestamp $Line
        if ($null -ne $SinceTime -and $null -ne $ts -and $ts -lt $SinceTime) { return $false }
        if ($null -ne $UntilTime -and $null -ne $ts -and $ts -gt $UntilTime) { return $false }
        # 无法解析时间戳时：不做时间过滤（避免误过滤）
    }

    return $true
}

function Get-LogFiles {
    if (-not (Test-Path $script:LogsRoot)) {
        return @()
    }

    $files = Get-ChildItem -Path $script:LogsRoot -Recurse -File -Filter "*.log" -ErrorAction SilentlyContinue
    if ($null -eq $files) { return @() }

    # 计算“服务名”：logs/ 下一级目录名；若直接在 logs/ 下则为 root
    $result = @()
    foreach ($f in $files) {
        $relative = $f.FullName.Substring($script:LogsRoot.Length).TrimStart('\','/')
        $serviceName = "root"
        if ($relative -match '^[^\\/]+') {
            $serviceName = ($relative -split '[\\/]', 2)[0]
        }
        $result += [PSCustomObject]@{
            Service = $serviceName
            Path = $f.FullName
        }
    }
    return $result
}

function Read-And-Print {
    param(
        [PSCustomObject[]]$Targets,
        [DateTime]$SinceTime,
        [DateTime]$UntilTime,
        [string]$Needle,
        [string]$NeedLevel,
        [int]$TailLines,
        [switch]$FollowMode
    )

    $allLines = New-Object System.Collections.Generic.List[string]

    foreach ($t in $Targets) {
        Write-Info "读取: [$($t.Service)] $($t.Path)"
        if ($FollowMode) {
            # Follow 仅支持单文件（在外层已校验）
            Get-Content -Path $t.Path -Tail $TailLines -Wait | ForEach-Object {
                if (Test-Line -Line $_ -SinceTime $SinceTime -UntilTime $UntilTime -Needle $Needle -NeedLevel $NeedLevel) {
                    Write-Host $_
                    $allLines.Add($_) | Out-Null
                }
            }
            continue
        }

        $lines = @()
        try {
            $lines = Get-Content -Path $t.Path -Tail $TailLines -ErrorAction Stop
        } catch {
            Write-Warn "无法读取文件：$($t.Path)（$($_.Exception.Message)）"
            continue
        }

        foreach ($line in $lines) {
            if (Test-Line -Line $line -SinceTime $SinceTime -UntilTime $UntilTime -Needle $Needle -NeedLevel $NeedLevel) {
                Write-Host $line
                $allLines.Add($line) | Out-Null
            }
        }
    }

    return $allLines
}

function Show-Stats {
    param([System.Collections.Generic.List[string]]$Lines)

    $counters = @{
        DEBUG = 0
        INFO = 0
        WARN = 0
        ERROR = 0
        FATAL = 0
        PANIC = 0
        OTHER = 0
    }

    foreach ($line in $Lines) {
        $lvl = Get-LineLevel $line
        if ([string]::IsNullOrWhiteSpace($lvl)) { $counters.OTHER++; continue }
        if ($counters.ContainsKey($lvl)) { $counters[$lvl]++ } else { $counters.OTHER++ }
    }

    Write-Host ""
    Write-Host "日志统计（按级别计数）" -ForegroundColor Green
    foreach ($k in @("DEBUG","INFO","WARN","ERROR","FATAL","PANIC","OTHER")) {
        Write-Host ("  {0,-5}: {1}" -f $k, $counters[$k])
    }
}

function Export-Lines {
    param(
        [System.Collections.Generic.List[string]]$Lines,
        [string]$Path
    )

    if ([string]::IsNullOrWhiteSpace($Path)) { return }
    $dir = Split-Path -Parent $Path
    if (-not [string]::IsNullOrWhiteSpace($dir) -and -not (Test-Path $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }
    $Lines | Out-File -FilePath $Path -Encoding UTF8
    Write-Info "已导出：$Path（$($Lines.Count) 行）"
}

function Main {
    if ($Help) {
        Show-Help
        return
    }

    if (-not (Test-Path $script:LogsRoot)) {
        Write-Err "未找到日志目录：$script:LogsRoot"
        return
    }

    $sinceTime = Try-ParseTime $Since
    if ($Since -and $null -eq $sinceTime) { Write-Warn "Since 时间解析失败：$Since（将忽略 Since 过滤）" }
    $untilTime = Try-ParseTime $Until
    if ($Until -and $null -eq $untilTime) { Write-Warn "Until 时间解析失败：$Until（将忽略 Until 过滤）" }

    $files = Get-LogFiles
    if ($files.Count -eq 0) {
        Write-Warn "未扫描到任何 *.log 文件（目录：$script:LogsRoot）"
        return
    }

    $serviceKey = ($Service ?? "all").Trim()
    if ([string]::IsNullOrWhiteSpace($serviceKey)) { $serviceKey = "all" }

    $targets = @()
    if ($serviceKey -ieq "all") {
        $targets = $files
    } else {
        $targets = $files | Where-Object { $_.Service -ieq $serviceKey }
        if ($targets.Count -eq 0) {
            $available = ($files | Select-Object -ExpandProperty Service | Sort-Object -Unique) -join ", "
            Write-Err "未找到指定服务 '$serviceKey' 的日志文件。可用服务：$available"
            return
        }
    }

    # Follow 仅支持单文件
    if ($Follow -and $targets.Count -ne 1) {
        Write-Err "Follow 仅支持命中 1 个日志文件（当前命中 $($targets.Count) 个）。请使用 -Service 精确到单服务，或缩小 logs/ 下文件数量。"
        return
    }

    Write-Host ""
    Write-Host "🔍 日志查看器" -ForegroundColor Cyan
    Write-Host ("日志目录: {0}" -f $script:LogsRoot)
    Write-Host ("目标文件: {0}" -f $targets.Count)
    Write-Host ("过滤: service={0}, level={1}, filter='{2}', since='{3}', until='{4}', tail={5}, follow={6}" -f $serviceKey, $Level, $Filter, $Since, $Until, $Tail, $Follow)
    Write-Host ""

    $lines = Read-And-Print -Targets $targets -SinceTime $sinceTime -UntilTime $untilTime -Needle $Filter -NeedLevel $Level -TailLines $Tail -FollowMode:$Follow

    if ($Stats) {
        Show-Stats $lines
    }

    if (-not [string]::IsNullOrWhiteSpace($ExportPath)) {
        Export-Lines $lines $ExportPath
    }
}

Main
