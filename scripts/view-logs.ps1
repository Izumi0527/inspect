# 企业级网络设备巡检系统 - 日志查看工具
# 支持实时查看、过滤搜索和多服务日志聚合

param(
    [string]$Service = "",           # 服务筛选：backend, frontend, database, all
    [string]$Level = "",             # 日志级别筛选：debug, info, warn, error
    [string]$Filter = "",            # 关键词过滤
    [int]$Tail = 50,                 # 显示最后N行（默认50行）
    [switch]$Follow,                 # 实时跟踪模式（类似tail -f）
    [switch]$Color,                  # 启用彩色输出（默认启用）
    [switch]$NoColor,                # 禁用彩色输出
    [switch]$Timestamp,              # 显示时间戳
    [string]$Since = "",             # 显示指定时间之后的日志 (格式: "2025-01-01 10:00:00")
    [string]$Until = "",             # 显示指定时间之前的日志
    [string]$RequestId = "",         # 按请求ID过滤
    [switch]$Stats,                  # 显示日志统计信息
    [switch]$Export,                 # 导出日志到文件
    [string]$ExportPath = "",        # 导出文件路径
    [switch]$Help                    # 显示帮助信息
)

$ErrorActionPreference = "Stop"

# 全局变量
$script:ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:ProjectRoot = Split-Path -Parent $script:ScriptPath
$script:LogsPath = Join-Path $script:ProjectRoot "logs"
$script:UseColor = $Color -and (-not $NoColor) -and (-not $Export)

# 日志文件路径配置
$script:LogFiles = @{
    "backend" = @{
        "path" = Join-Path $script:LogsPath "backend\app.log"
        "color" = "Blue"
        "prefix" = "[后端]"
    }
    "frontend" = @{
        "path" = Join-Path $script:LogsPath "frontend\app.log"
        "color" = "Green"
        "prefix" = "[前端]"
    }
    "database" = @{
        "path" = Join-Path $script:LogsPath "database\init-migrate.log"
        "color" = "Yellow"
        "prefix" = "[数据库]"
    }
    "nginx" = @{
        "path" = Join-Path $script:LogsPath "nginx\access.log"
        "color" = "Magenta"
        "prefix" = "[代理]"
    }
}

# 日志级别配置
$script:LogLevels = @{
    "DEBUG" = @{ "color" = "Gray"; "priority" = 0 }
    "INFO" = @{ "color" = "White"; "priority" = 1 }
    "WARN" = @{ "color" = "Yellow"; "priority" = 2 }
    "ERROR" = @{ "color" = "Red"; "priority" = 3 }
}

# 日志函数
function Write-ColorLog {
    param(
        [string]$Message,
        [string]$Color = "White",
        [switch]$NoNewline
    )

    if ($script:UseColor) {
        if ($NoNewline) {
            Write-Host $Message -ForegroundColor $Color -NoNewline
        } else {
            Write-Host $Message -ForegroundColor $Color
        }
    } else {
        if ($NoNewline) {
            Write-Host $Message -NoNewline
        } else {
            Write-Host $Message
        }
    }
}

function Write-LogInfo {
    param([string]$Message)
    Write-ColorLog "[信息] $Message" "Cyan"
}

function Write-LogWarning {
    param([string]$Message)
    Write-ColorLog "[警告] $Message" "Yellow"
}

function Write-LogError {
    param([string]$Message)
    Write-ColorLog "[错误] $Message" "Red"
}

# 显示帮助信息
function Show-Help {
    Write-ColorLog "企业级网络设备巡检系统 - 日志查看工具" "Cyan"
    Write-Host ""
    Write-Host "用法:"
    Write-Host "    .\\view-logs.ps1 [选项]"
    Write-Host ""
    Write-Host "服务筛选:"
    Write-Host "    -Service <服务>      指定服务类型 (backend, frontend, database, nginx, all)"
    Write-Host "    -Service all         查看所有服务日志 (默认)"
    Write-Host ""
    Write-Host "日志筛选:"
    Write-Host "    -Level <级别>        按日志级别筛选 (debug, info, warn, error)"
    Write-Host "    -Filter <关键词>     按关键词过滤日志内容"
    Write-Host "    -RequestId <ID>      按请求ID过滤日志"
    Write-Host "    -Since <时间>        显示指定时间之后的日志"
    Write-Host "    -Until <时间>        显示指定时间之前的日志"
    Write-Host ""
    Write-Host "显示选项:"
    Write-Host "    -Tail <行数>         显示最后N行日志 (默认: 50)"
    Write-Host "    -Follow              实时跟踪模式 (类似 tail -f)"
    Write-Host "    -Color               启用彩色输出 (默认)"
    Write-Host "    -NoColor             禁用彩色输出"
    Write-Host "    -Timestamp           显示详细时间戳"
    Write-Host ""
    Write-Host "统计和导出:"
    Write-Host "    -Stats               显示日志统计信息"
    Write-Host "    -Export              导出日志到文件"
    Write-Host "    -ExportPath <路径>   指定导出文件路径"
    Write-Host ""
    Write-Host "示例:"
    Write-Host "    .\\view-logs.ps1                          # 查看所有服务最近50行日志"
    Write-Host "    .\\view-logs.ps1 -Service backend -Follow # 实时跟踪后端日志"
    Write-Host "    .\\view-logs.ps1 -Level error             # 只显示错误日志"
    Write-Host "    .\\view-logs.ps1 -Filter \"API\"           # 搜索包含API的日志"
    Write-Host "    .\\view-logs.ps1 -RequestId req_123       # 按请求ID追踪"
    Write-Host "    .\\view-logs.ps1 -Since \"2025-01-01 10:00\" # 指定时间之后的日志"
    Write-Host "    .\\view-logs.ps1 -Stats                   # 显示日志统计"
    Write-Host "    .\\view-logs.ps1 -Export -ExportPath logs_export.txt"
    Write-Host ""
}

# 检查日志文件是否存在
function Test-LogFiles {
    $existingFiles = @{}

    foreach ($serviceName in $script:LogFiles.Keys) {
        $logFile = $script:LogFiles[$serviceName]["path"]
        if (Test-Path $logFile) {
            $existingFiles[$serviceName] = $script:LogFiles[$serviceName]
        }
    }

    if ($existingFiles.Count -eq 0) {
        Write-LogWarning "未找到任何日志文件"
        Write-LogInfo "请确保服务已启动并生成了日志文件"
        Write-LogInfo "预期日志文件位置："
        foreach ($serviceName in $script:LogFiles.Keys) {
            Write-LogInfo "  [$serviceName] $($script:LogFiles[$serviceName]['path'])"
        }
        return $false
    }

    return $existingFiles
}

# 解析日志行
function Parse-LogLine {
    param(
        [string]$Line,
        [string]$ServiceName
    )

    if ([string]::IsNullOrWhiteSpace($Line)) {
        return $null
    }

    # 尝试解析结构化日志 (时间戳 [级别] [模块] 消息)
    $structuredPattern = '^\[?(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2})\]?\s*\[([^\]]+)\]\s*\[([^\]]+)\]\s*(.*)$'
    if ($Line -match $structuredPattern) {
        return @{
            "Timestamp" = [DateTime]::Parse($matches[1])
            "Level" = $matches[2].ToUpper()
            "Module" = $matches[3]
            "Message" = $matches[4]
            "Service" = $ServiceName
            "Raw" = $Line
        }
    }

    # 尝试解析简单格式 (时间戳 级别 消息)
    $simplePattern = '^\[?(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2})\]?\s*(\w+):\s*(.*)$'
    if ($Line -match $simplePattern) {
        return @{
            "Timestamp" = [DateTime]::Parse($matches[1])
            "Level" = $matches[2].ToUpper()
            "Module" = $ServiceName
            "Message" = $matches[3]
            "Service" = $ServiceName
            "Raw" = $Line
        }
    }

    # 如果无法解析，返回原始行
    return @{
        "Timestamp" = Get-Date
        "Level" = "INFO"
        "Module" = $ServiceName
        "Message" = $Line
        "Service" = $ServiceName
        "Raw" = $Line
    }
}

# 过滤日志行
function Test-LogLineFilter {
    param(
        [hashtable]$LogEntry
    )

    # 级别过滤
    if ($Level -and $LogEntry.Level -ne $Level.ToUpper()) {
        return $false
    }

    # 关键词过滤
    if ($Filter -and $LogEntry.Raw -notlike "*$Filter*") {
        return $false
    }

    # 请求ID过滤
    if ($RequestId -and $LogEntry.Raw -notlike "*$RequestId*") {
        return $false
    }

    # 时间范围过滤
    if ($Since) {
        $sinceDate = [DateTime]::Parse($Since)
        if ($LogEntry.Timestamp -lt $sinceDate) {
            return $false
        }
    }

    if ($Until) {
        $untilDate = [DateTime]::Parse($Until)
        if ($LogEntry.Timestamp -gt $untilDate) {
            return $false
        }
    }

    return $true
}

# 格式化日志输出
function Format-LogLine {
    param(
        [hashtable]$LogEntry
    )

    $service = $script:LogFiles[$LogEntry.Service]
    $level = $script:LogLevels[$LogEntry.Level]

    if (-not $level) {
        $level = @{ "color" = "White" }
    }

    # 构建输出字符串
    $output = ""

    # 时间戳
    if ($Timestamp) {
        $timeStr = $LogEntry.Timestamp.ToString("yyyy-MM-dd HH:mm:ss.fff")
        $output += "[$timeStr] "
    } else {
        $timeStr = $LogEntry.Timestamp.ToString("HH:mm:ss")
        $output += "[$timeStr] "
    }

    # 服务标识
    if ($service) {
        Write-ColorLog "$output" "Gray" -NoNewline
        Write-ColorLog "$($service.prefix) " $service.color -NoNewline
    }

    # 级别标识
    $levelStr = "[$($LogEntry.Level)]"
    Write-ColorLog "$levelStr " $level.color -NoNewline

    # 模块（如果不是服务名本身）
    if ($LogEntry.Module -ne $LogEntry.Service) {
        Write-ColorLog "[$($LogEntry.Module)] " "DarkGray" -NoNewline
    }

    # 消息内容
    Write-ColorLog $LogEntry.Message "White"
}

# 显示日志统计
function Show-LogStats {
    param([array]$LogEntries)

    if (-not $LogEntries -or $LogEntries.Count -eq 0) {
        Write-LogWarning "没有日志数据可供统计"
        return
    }

    Write-ColorLog "`n=== 日志统计信息 ===" "Cyan"

    # 总数统计
    Write-LogInfo "总日志条数: $($LogEntries.Count)"

    # 按服务统计
    $serviceStats = $LogEntries | Group-Object Service
    Write-ColorLog "`n按服务分布:" "Yellow"
    foreach ($stat in $serviceStats) {
        $service = $script:LogFiles[$stat.Name]
        $prefix = if ($service) { $service.prefix } else { "[$($stat.Name)]" }
        Write-LogInfo "  $prefix $($stat.Count) 条日志"
    }

    # 按级别统计
    $levelStats = $LogEntries | Group-Object Level
    Write-ColorLog "`n按级别分布:" "Yellow"
    foreach ($stat in $levelStats | Sort-Object { $script:LogLevels[$_.Name].priority }) {
        $level = $script:LogLevels[$stat.Name]
        $color = if ($level) { $level.color } else { "White" }
        Write-ColorLog "  [$($stat.Name)] $($stat.Count) 条日志" $color
    }

    # 时间范围
    $timeStats = $LogEntries | Measure-Object Timestamp -Minimum -Maximum
    Write-ColorLog "`n时间范围:" "Yellow"
    Write-LogInfo "  最早: $($timeStats.Minimum.ToString('yyyy-MM-dd HH:mm:ss'))"
    Write-LogInfo "  最晚: $($timeStats.Maximum.ToString('yyyy-MM-dd HH:mm:ss'))"

    Write-Host ""
}

# 导出日志
function Export-Logs {
    param(
        [array]$LogEntries,
        [string]$Path
    )

    if (-not $Path) {
        $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
        $Path = Join-Path $PWD "logs_export_$timestamp.txt"
    }

    try {
        $exportContent = @()
        $exportContent += "# 日志导出文件"
        $exportContent += "# 导出时间: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
        $exportContent += "# 总条数: $($LogEntries.Count)"
        $exportContent += "# 过滤条件: Service=$Service, Level=$Level, Filter=$Filter"
        $exportContent += ""

        foreach ($entry in $LogEntries) {
            $line = "$($entry.Timestamp.ToString('yyyy-MM-dd HH:mm:ss')) [$($entry.Level)] [$($entry.Service)] $($entry.Message)"
            $exportContent += $line
        }

        $exportContent | Out-File -FilePath $Path -Encoding UTF8
        Write-LogInfo "日志已导出到: $Path"

    } catch {
        Write-LogError "导出失败: $($_.Exception.Message)"
    }
}

# 读取日志文件
function Read-LogFiles {
    param([hashtable]$Files)

    $allLogEntries = @()

    foreach ($serviceName in $Files.Keys) {
        $logFile = $Files[$serviceName]["path"]

        if (-not (Test-Path $logFile)) {
            continue
        }

        try {
            $lines = if ($Tail -gt 0) {
                Get-Content $logFile -Tail $Tail -ErrorAction SilentlyContinue
            } else {
                Get-Content $logFile -ErrorAction SilentlyContinue
            }

            foreach ($line in $lines) {
                $logEntry = Parse-LogLine -Line $line -ServiceName $serviceName
                if ($logEntry -and (Test-LogLineFilter $logEntry)) {
                    $allLogEntries += $logEntry
                }
            }
        } catch {
            Write-LogWarning "读取日志文件失败: $logFile - $($_.Exception.Message)"
        }
    }

    # 按时间戳排序
    return $allLogEntries | Sort-Object Timestamp
}

# 实时跟踪模式
function Start-FollowMode {
    param([hashtable]$Files)

    Write-LogInfo "进入实时跟踪模式，按 Ctrl+C 退出..."
    Write-Host ""

    $lastPositions = @{}

    # 初始化文件位置
    foreach ($serviceName in $Files.Keys) {
        $logFile = $Files[$serviceName]["path"]
        if (Test-Path $logFile) {
            $lastPositions[$serviceName] = (Get-Item $logFile).Length
        }
    }

    try {
        while ($true) {
            $hasNewContent = $false

            foreach ($serviceName in $Files.Keys) {
                $logFile = $Files[$serviceName]["path"]

                if (-not (Test-Path $logFile)) {
                    continue
                }

                $currentLength = (Get-Item $logFile).Length
                $lastPosition = $lastPositions[$serviceName]

                if ($currentLength -gt $lastPosition) {
                    # 读取新增内容
                    $stream = [System.IO.File]::Open($logFile, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
                    $stream.Seek($lastPosition, [System.IO.SeekOrigin]::Begin) | Out-Null

                    $reader = [System.IO.StreamReader]::new($stream)
                    while (-not $reader.EndOfStream) {
                        $line = $reader.ReadLine()
                        if ($line) {
                            $logEntry = Parse-LogLine -Line $line -ServiceName $serviceName
                            if ($logEntry -and (Test-LogLineFilter $logEntry)) {
                                Format-LogLine $logEntry
                                $hasNewContent = $true
                            }
                        }
                    }

                    $reader.Close()
                    $stream.Close()

                    $lastPositions[$serviceName] = $currentLength
                }
            }

            Start-Sleep -Milliseconds 500
        }
    } catch {
        Write-LogInfo "`n实时跟踪已停止"
    }
}

# 主函数
function Main {
    try {
        # 显示帮助
        if ($Help) {
            Show-Help
            return
        }

        # 检查日志目录
        if (-not (Test-Path $script:LogsPath)) {
            Write-LogError "日志目录不存在: $script:LogsPath"
            Write-LogInfo "请确保服务已启动并生成了日志文件"
            return
        }

        # 检查可用的日志文件
        $availableFiles = Test-LogFiles
        if (-not $availableFiles) {
            return
        }

        # 筛选服务
        $targetFiles = @{}
        if ($Service -and $Service -ne "all") {
            if ($availableFiles.ContainsKey($Service.ToLower())) {
                $targetFiles[$Service.ToLower()] = $availableFiles[$Service.ToLower()]
            } else {
                Write-LogError "指定的服务 '$Service' 的日志文件不存在"
                Write-LogInfo "可用服务: $($availableFiles.Keys -join ', ')"
                return
            }
        } else {
            $targetFiles = $availableFiles
        }

        # 显示标题
        Write-ColorLog "`n🔍 企业级网络设备巡检系统 - 日志查看器" "Cyan"
        Write-ColorLog "==========================================" "Cyan"

        # 显示筛选条件
        if ($Service -or $Level -or $Filter -or $RequestId) {
            Write-ColorLog "`n筛选条件:" "Yellow"
            if ($Service) { Write-LogInfo "  服务: $Service" }
            if ($Level) { Write-LogInfo "  级别: $Level" }
            if ($Filter) { Write-LogInfo "  关键词: $Filter" }
            if ($RequestId) { Write-LogInfo "  请求ID: $RequestId" }
        }

        Write-LogInfo "`n可用日志文件:"
        foreach ($serviceName in $targetFiles.Keys) {
            $logFile = $targetFiles[$serviceName]["path"]
            $fileSize = if (Test-Path $logFile) {
                "{0:N2} MB" -f ((Get-Item $logFile).Length / 1MB)
            } else {
                "不存在"
            }
            Write-LogInfo "  $($targetFiles[$serviceName]['prefix']) $logFile ($fileSize)"
        }

        Write-Host ""

        # 实时跟踪模式
        if ($Follow) {
            Start-FollowMode $targetFiles
            return
        }

        # 读取日志
        Write-LogInfo "正在读取日志文件..."
        $logEntries = Read-LogFiles $targetFiles

        if (-not $logEntries -or $logEntries.Count -eq 0) {
            Write-LogWarning "没有找到匹配的日志条目"
            return
        }

        Write-LogInfo "找到 $($logEntries.Count) 条日志记录`n"

        # 显示统计信息
        if ($Stats) {
            Show-LogStats $logEntries
        }

        # 导出日志
        if ($Export) {
            Export-Logs $logEntries $ExportPath
            if (-not $Stats) {
                return
            }
        }

        # 显示日志内容（如果不是仅导出模式）
        if (-not $Export -or $Stats) {
            Write-ColorLog "=== 日志内容 ===" "Green"
            foreach ($entry in $logEntries) {
                Format-LogLine $entry
            }
        }

    } catch {
        Write-LogError "程序执行失败: $($_.Exception.Message)"
        if ($Debug) {
            Write-Host $_.ScriptStackTrace -ForegroundColor Red
        }
        exit 1
    }
}

# 执行主函数
Main