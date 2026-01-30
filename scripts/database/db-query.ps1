# 企业级网络设备巡检系统 - PostgreSQL数据库查询脚本
# 用于查询Docker容器中的PostgreSQL数据库的表、列和数据

param(
    [string]$Table = "",
    [int]$Limit = 10,
    [ValidateSet("Console", "CSV", "JSON", "HTML")]
    [string]$Format = "Console",
    [string]$Output = "",
    [string]$CustomSQL = "",
    [switch]$ShowSchema,
    [switch]$ShowData,
    [switch]$ShowStats,
    [string]$Pattern = "*",
    [switch]$Help
)

# 设置错误处理
# 设置控制台编码为UTF-8（必须在脚本开始处设置）
try {
    # 方法1: 设置控制台代码页为UTF-8 (65001)
    $null = cmd /c "chcp 65001 >nul 2>&1"

    # 方法2: 强制设置控制台编码
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    [Console]::InputEncoding = [System.Text.Encoding]::UTF8

    # 方法3: 设置PowerShell相关编码变量
    $OutputEncoding = [System.Text.Encoding]::UTF8
    $PSDefaultParameterValues['*:Encoding'] = 'utf8'

    Write-Host "✅ 控制台编码已设置为UTF-8" -ForegroundColor Green
} catch {
    Write-Host "⚠️ 设置控制台编码时出现问题: $($_.Exception.Message)" -ForegroundColor Yellow
}

$ErrorActionPreference = "Stop"

# 全局变量
$script:TotalQueries = 0
$script:SuccessfulQueries = 0
$script:FailedQueries = 0
$script:QueryResults = @{}
$script:StartTime = Get-Date

# 数据库配置
$Config = @{
    Container = "inspect-postgres-dev"
    Database = "inspect_system_dev"
    User = "inspect_dev"
    Password = "dev_password_2024"
    Port = 15500
    Host = "localhost"
}

# ==========================================
# 日志和输出函数
# ==========================================

function Write-LogInfo {
    param([string]$Message)
    Write-Host "[信息] $Message" -ForegroundColor Cyan
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

function Write-LogDebug {
    param([string]$Message)
    Write-Host "[调试] $Message" -ForegroundColor DarkGray
}

function Show-Help {
    $helpText = @"

企业级网络设备巡检系统 - PostgreSQL数据库查询工具

用法:
    .\db-query.ps1 [参数]

参数:
    -Table <表名>          指定要查询的表名
    -Limit <数量>          限制查询的数据行数 (默认: 10)
    -Format <格式>         输出格式: Console|CSV|JSON|HTML (默认: Console)
    -Output <文件路径>      输出文件路径 (不指定则输出到控制台)
    -CustomSQL <SQL>       执行自定义SQL查询
    -ShowSchema           只显示表结构信息
    -ShowData             只显示表数据
    -ShowStats            显示表统计信息
    -Pattern <模式>        表名过滤模式，支持通配符 (默认: *)
    -Help                 显示此帮助信息

示例:
    # 查询所有表的信息
    .\db-query.ps1

    # 查询特定表
    .\db-query.ps1 -Table users -Limit 20

    # 只显示表结构
    .\db-query.ps1 -ShowSchema

    # 导出为JSON格式
    .\db-query.ps1 -Format JSON -Output "database_info.json"

    # 执行自定义SQL
    .\db-query.ps1 -CustomSQL "SELECT COUNT(*) FROM users WHERE is_active = true"

    # 查询包含"device"的表
    .\db-query.ps1 -Pattern "*device*"

"@
    Write-Host $helpText -ForegroundColor White
}

# ==========================================
# 数据库连接和查询函数
# ==========================================

function Test-DockerContainer {
    Write-LogInfo "检查Docker容器状态..."

    try {
        $containerStatus = docker ps -f "name=$($Config.Container)" --format "table {{.Names}}\t{{.Status}}"

        if ($containerStatus -match $Config.Container) {
            Write-LogSuccess "Docker容器 '$($Config.Container)' 正在运行"
            return $true
        } else {
            Write-LogError "Docker容器 '$($Config.Container)' 未运行或不存在"
            return $false
        }
    } catch {
        Write-LogError "无法检查Docker容器状态: $($_.Exception.Message)"
        return $false
    }
}

function Test-DatabaseConnection {
    Write-LogInfo "测试数据库连接..."

    $testQuery = "SELECT version();"

    try {
        $result = Invoke-PostgreSQLQuery -Query $testQuery -SuppressOutput
        if ($result) {
            Write-LogSuccess "数据库连接成功"
            Write-LogDebug "数据库版本: $($result[0].version)"
            return $true
        }
    } catch {
        Write-LogError "数据库连接失败: $($_.Exception.Message)"
        return $false
    }

    return $false
}

function Invoke-PostgreSQLQuery {
    param(
        [string]$Query,
        [switch]$SuppressOutput
    )

    $script:TotalQueries++

    if (-not $SuppressOutput) {
        Write-LogDebug "执行SQL: $($Query.Substring(0, [Math]::Min(50, $Query.Length)))..."
    }

    try {
        # 使用docker exec执行SQL查询，确保UTF-8编码和正确的格式
        $dockerCmd = @(
            "exec", "-i",
            "-e", "LANG=C.UTF-8",
            "-e", "LC_ALL=C.UTF-8",
            "-e", "PGCLIENTENCODING=UTF8",
            $Config.Container,
            "psql",
            "-h", "localhost",
            "-U", $Config.User,
            "-d", $Config.Database,
            "--tuples-only",
            "--no-align",
            "--field-separator=`t",
            "--set", "client_encoding=UTF8",
            "-c", $Query
        )

        $env:PGPASSWORD = $Config.Password
        $rawResult = & docker @dockerCmd 2>&1
        Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue

        if ($LASTEXITCODE -ne 0) {
            throw "SQL查询失败: $rawResult"
        }

        # 解析结果
        if ($rawResult) {
            $lines = $rawResult -split "`n" | Where-Object { $_.Trim() -ne "" }
            if ($lines.Count -gt 0) {
                $script:SuccessfulQueries++
                return $lines
            }
        }

        $script:SuccessfulQueries++
        return @()

    } catch {
        $script:FailedQueries++
        if (-not $SuppressOutput) {
            Write-LogError "查询执行失败: $($_.Exception.Message)"
        }
        throw
    }
}

# ==========================================
# 数据库查询功能函数
# ==========================================

function Get-DatabaseTables {
    param([string]$Pattern = "*")

    Write-LogInfo "获取数据库表列表..."

    $query = @"
SELECT table_name,
       table_type,
       (SELECT COUNT(*)
        FROM information_schema.columns
        WHERE table_name = t.table_name AND table_schema = 'public') as column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
"@

    try {
        $rawResults = Invoke-PostgreSQLQuery -Query $query
        Write-LogDebug "原始查询结果行数: $($rawResults.Count)"

        if ($rawResults.Count -gt 0) {
            Write-LogDebug "第一行结果: '$($rawResults[0])'"
            Write-LogDebug "第一行结果长度: $($rawResults[0].Length)"
        }

        $tables = @()

        foreach ($line in $rawResults) {
            Write-LogDebug "处理行: '$line'"
            if ($line -and $line.Trim()) {
                $columns = $line -split "`t"
                Write-LogDebug "分割后列数: $($columns.Count)"
                if ($columns.Count -ge 3) {
                    Write-LogDebug "列数据: '$($columns[0])' | '$($columns[1])' | '$($columns[2])'"
                    $tableName = $columns[0].Trim()

                    # 应用模式过滤
                    if ($Pattern -ne "*" -and $tableName -notlike $Pattern) {
                        continue
                    }

                    $tables += @{
                        Name = $tableName
                        Type = $columns[1].Trim()
                        ColumnCount = [int]$columns[2].Trim()
                    }
                }
            }
        }

        Write-LogSuccess "找到 $($tables.Count) 个数据表"
        return $tables

    } catch {
        Write-LogError "获取表列表失败: $($_.Exception.Message)"
        return @()
    }
}

function Get-TableSchema {
    param([string]$TableName)

    Write-LogInfo "获取表 '$TableName' 的结构信息..."

    $query = @"
SELECT
    column_name,
    data_type,
    character_maximum_length,
    is_nullable,
    column_default,
    (SELECT COUNT(*) FROM pg_constraint
     WHERE conrelid = (SELECT oid FROM pg_class WHERE relname = '$TableName')
     AND pg_constraint.conkey[1] = (SELECT attnum FROM pg_attribute
                                    WHERE attrelid = (SELECT oid FROM pg_class WHERE relname = '$TableName')
                                    AND attname = c.column_name)
     AND contype = 'p') > 0 as is_primary_key
FROM information_schema.columns c
WHERE table_name = '$TableName'
  AND table_schema = 'public'
ORDER BY ordinal_position;
"@

    try {
        $rawResults = Invoke-PostgreSQLQuery -Query $query
        $schema = @()

        foreach ($line in $rawResults) {
            if ($line.Trim()) {
                $columns = $line -split "`t"
                if ($columns.Count -ge 6) {
                    $schema += @{
                        ColumnName = $columns[0].Trim()
                        DataType = $columns[1].Trim()
                        MaxLength = if ($columns[2].Trim() -eq "") { $null } else { $columns[2].Trim() }
                        IsNullable = $columns[3].Trim() -eq "YES"
                        DefaultValue = if ($columns[4].Trim() -eq "") { $null } else { $columns[4].Trim() }
                        IsPrimaryKey = $columns[5].Trim() -eq "t"
                    }
                }
            }
        }

        Write-LogSuccess "获取到 $($schema.Count) 个列定义"
        return $schema

    } catch {
        Write-LogError "获取表结构失败: $($_.Exception.Message)"
        return @()
    }
}

function Get-TableData {
    param(
        [string]$TableName,
        [int]$Limit = 10
    )

    Write-LogInfo "获取表 '$TableName' 的数据 (限制 $Limit 行)..."

    $query = "SELECT * FROM `"$TableName`" LIMIT $Limit;"

    try {
        $rawResults = Invoke-PostgreSQLQuery -Query $query

        if ($rawResults.Count -eq 0) {
            Write-LogWarning "表 '$TableName' 没有数据"
            return @()
        }

        # 首先获取列名
        $schemaQuery = "SELECT column_name FROM information_schema.columns WHERE table_name = '$TableName' AND table_schema = 'public' ORDER BY ordinal_position;"
        $columnResults = Invoke-PostgreSQLQuery -Query $schemaQuery -SuppressOutput
        $columnNames = $columnResults | ForEach-Object { $_.Trim() }

        # 解析数据行
        $data = @()
        foreach ($line in $rawResults) {
            if ($line.Trim()) {
                $values = $line -split "`t"
                $row = @{}
                for ($i = 0; $i -lt [Math]::Min($columnNames.Count, $values.Count); $i++) {
                    $row[$columnNames[$i]] = $values[$i].Trim()
                }
                $data += $row
            }
        }

        Write-LogSuccess "获取到 $($data.Count) 行数据"
        return $data

    } catch {
        Write-LogError "获取表数据失败: $($_.Exception.Message)"
        return @()
    }
}

function Get-TableStatistics {
    param([string]$TableName)

    Write-LogInfo "获取表 '$TableName' 的统计信息..."

    $query = @"
SELECT
    COUNT(*) as total_rows,
    pg_size_pretty(pg_total_relation_size('$TableName')) as table_size,
    pg_size_pretty(pg_relation_size('$TableName')) as data_size,
    pg_size_pretty(pg_total_relation_size('$TableName') - pg_relation_size('$TableName')) as index_size
FROM $TableName;
"@

    try {
        $rawResults = Invoke-PostgreSQLQuery -Query $query

        if ($rawResults.Count -gt 0) {
            $line = $rawResults[0]
            $columns = $line -split "`t"

            if ($columns.Count -ge 4) {
                $stats = @{
                    TotalRows = [int]$columns[0].Trim()
                    TableSize = $columns[1].Trim()
                    DataSize = $columns[2].Trim()
                    IndexSize = $columns[3].Trim()
                }

                Write-LogSuccess "获取统计信息成功"
                return $stats
            }
        }

        return $null

    } catch {
        Write-LogError "获取表统计信息失败: $($_.Exception.Message)"
        return $null
    }
}

# ==========================================
# 输出格式化函数
# ==========================================

function Format-ConsoleOutput {
    param($Results)

    Write-Host "`n" + "=" * 80 -ForegroundColor Blue
    Write-Host "         PostgreSQL 数据库查询报告" -ForegroundColor White -BackgroundColor Blue
    Write-Host "=" * 80 -ForegroundColor Blue

    Write-Host "`n数据库信息:" -ForegroundColor Yellow
    Write-Host "  容器: $($Config.Container)" -ForegroundColor White
    Write-Host "  数据库: $($Config.Database)" -ForegroundColor White
    Write-Host "  用户: $($Config.User)" -ForegroundColor White
    Write-Host "  端口: $($Config.Port)" -ForegroundColor White

    if ($Results.Tables) {
        Write-Host "`n数据表概览:" -ForegroundColor Yellow
        Write-Host ("  {0,-25} {1,-10} {2,-8} {3}" -f "表名", "列数", "行数", "大小") -ForegroundColor Cyan
        Write-Host "  " + "-" * 60 -ForegroundColor Gray

        foreach ($table in $Results.Tables) {
            $rowCount = if ($Results.Statistics -and $Results.Statistics[$table.Name]) {
                $Results.Statistics[$table.Name].TotalRows
            } else { "N/A" }

            $tableSize = if ($Results.Statistics -and $Results.Statistics[$table.Name]) {
                $Results.Statistics[$table.Name].TableSize
            } else { "N/A" }

            Write-Host ("  {0,-25} {1,-10} {2,-8} {3}" -f $table.Name, $table.ColumnCount, $rowCount, $tableSize) -ForegroundColor White
        }
    }

    if ($Results.TableDetails) {
        foreach ($tableName in $Results.TableDetails.Keys) {
            $details = $Results.TableDetails[$tableName]

            Write-Host "`n" + "─" * 60 -ForegroundColor Gray
            Write-Host "表: $tableName" -ForegroundColor Green
            Write-Host "─" * 60 -ForegroundColor Gray

            if ($details.Schema -and (-not $ShowData)) {
                Write-Host "`n表结构:" -ForegroundColor Yellow
                Write-Host ("  {0,-20} {1,-15} {2,-8} {3,-8} {4}" -f "列名", "数据类型", "可空", "主键", "默认值") -ForegroundColor Cyan
                Write-Host "  " + "-" * 70 -ForegroundColor Gray

                foreach ($column in $details.Schema) {
                    $nullable = if ($column.IsNullable) { "是" } else { "否" }
                    $primaryKey = if ($column.IsPrimaryKey) { "是" } else { "否" }
                    $defaultValue = if ($column.DefaultValue) { $column.DefaultValue.Substring(0, [Math]::Min(15, $column.DefaultValue.Length)) } else { "" }

                    Write-Host ("  {0,-20} {1,-15} {2,-8} {3,-8} {4}" -f
                        $column.ColumnName,
                        $column.DataType,
                        $nullable,
                        $primaryKey,
                        $defaultValue) -ForegroundColor White
                }
            }

            if ($details.Data -and (-not $ShowSchema)) {
                Write-Host "`n示例数据:" -ForegroundColor Yellow

                if ($details.Data.Count -gt 0) {
                    # 获取所有列名
                    $allColumns = @()
                    foreach ($row in $details.Data) {
                        foreach ($key in $row.Keys) {
                            if ($allColumns -notcontains $key) {
                                $allColumns += $key
                            }
                        }
                    }

                    # 显示表头
                    $headerLine = "  " + (($allColumns | ForEach-Object { [string]$_.ToString().PadRight(15) }) -join " ")
                    Write-Host $headerLine -ForegroundColor Cyan
                    Write-Host ("  " + "-" * ($headerLine.Length - 2)) -ForegroundColor Gray

                    # 显示数据行
                    foreach ($row in $details.Data) {
                        $dataLine = "  " + (($allColumns | ForEach-Object {
                            $value = if ($row[$_]) { $row[$_] } else { "" }
                            [string]$value.ToString().PadRight(15)
                        }) -join " ")
                        Write-Host $dataLine -ForegroundColor White
                    }
                } else {
                    Write-Host "  (无数据)" -ForegroundColor Gray
                }
            }

            if ($details.Statistics) {
                Write-Host "`n统计信息:" -ForegroundColor Yellow
                Write-Host "  总行数: $($details.Statistics.TotalRows)" -ForegroundColor White
                Write-Host "  表大小: $($details.Statistics.TableSize)" -ForegroundColor White
                Write-Host "  数据大小: $($details.Statistics.DataSize)" -ForegroundColor White
                Write-Host "  索引大小: $($details.Statistics.IndexSize)" -ForegroundColor White
            }
        }
    }

    # 显示执行统计
    Write-Host "`n" + "=" * 80 -ForegroundColor Blue
    $endTime = Get-Date
    $duration = $endTime - $script:StartTime

    Write-Host "执行统计:" -ForegroundColor Yellow
    Write-Host "  总查询数: $script:TotalQueries" -ForegroundColor White
    Write-Host "  成功查询: $script:SuccessfulQueries" -ForegroundColor Green
    Write-Host "  失败查询: $script:FailedQueries" -ForegroundColor Red
    Write-Host "  执行时间: $($duration.TotalSeconds.ToString('F2')) 秒" -ForegroundColor White
    Write-Host "=" * 80 -ForegroundColor Blue
}

function Export-ToCSV {
    param(
        $Results,
        [string]$FilePath
    )

    Write-LogInfo "导出CSV文件: $FilePath"

    try {
        $csvData = @()

        # 表概览
        if ($Results.Tables) {
            foreach ($table in $Results.Tables) {
                $csvData += [PSCustomObject]@{
                    Type = "Table"
                    TableName = $table.Name
                    ColumnName = ""
                    DataType = ""
                    ColumnCount = $table.ColumnCount
                    TotalRows = if ($Results.Statistics -and $Results.Statistics[$table.Name]) { $Results.Statistics[$table.Name].TotalRows } else { "" }
                    TableSize = if ($Results.Statistics -and $Results.Statistics[$table.Name]) { $Results.Statistics[$table.Name].TableSize } else { "" }
                }
            }
        }

        # 表详情
        if ($Results.TableDetails) {
            foreach ($tableName in $Results.TableDetails.Keys) {
                $details = $Results.TableDetails[$tableName]

                if ($details.Schema) {
                    foreach ($column in $details.Schema) {
                        $csvData += [PSCustomObject]@{
                            Type = "Column"
                            TableName = $tableName
                            ColumnName = $column.ColumnName
                            DataType = $column.DataType
                            IsNullable = $column.IsNullable
                            IsPrimaryKey = $column.IsPrimaryKey
                            DefaultValue = $column.DefaultValue
                        }
                    }
                }
            }
        }

        $csvData | Export-Csv -Path $FilePath -NoTypeInformation -Encoding UTF8
        Write-LogSuccess "CSV导出完成"

    } catch {
        Write-LogError "CSV导出失败: $($_.Exception.Message)"
    }
}

function Export-ToJSON {
    param(
        $Results,
        [string]$FilePath
    )

    Write-LogInfo "导出JSON文件: $FilePath"

    try {
        $jsonData = @{
            DatabaseInfo = @{
                Container = $Config.Container
                Database = $Config.Database
                User = $Config.User
                Port = $Config.Port
            }
            ExecutionStats = @{
                TotalQueries = $script:TotalQueries
                SuccessfulQueries = $script:SuccessfulQueries
                FailedQueries = $script:FailedQueries
                ExecutionTime = ((Get-Date) - $script:StartTime).TotalSeconds
            }
            Tables = $Results.Tables
            TableDetails = $Results.TableDetails
            Statistics = $Results.Statistics
        }

        $jsonData | ConvertTo-Json -Depth 10 | Out-File -FilePath $FilePath -Encoding UTF8
        Write-LogSuccess "JSON导出完成"

    } catch {
        Write-LogError "JSON导出失败: $($_.Exception.Message)"
    }
}

function Export-ToHTML {
    param(
        $Results,
        [string]$FilePath
    )

    Write-LogInfo "导出HTML文件: $FilePath"

    try {
        $html = @"
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PostgreSQL 数据库报告</title>
    <style>
        body {
            font-family: 'Segoe UI', Arial, sans-serif;
            margin: 20px;
            background-color: #f5f5f5;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 10px;
            margin-bottom: 20px;
        }
        .section {
            background: white;
            padding: 15px;
            margin: 10px 0;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        table {
            border-collapse: collapse;
            width: 100%;
            margin: 10px 0;
        }
        th, td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
        }
        th {
            background-color: #4CAF50;
            color: white;
        }
        tr:nth-child(even) {
            background-color: #f2f2f2;
        }
        .stats {
            display: flex;
            justify-content: space-around;
            flex-wrap: wrap;
        }
        .stat-card {
            background: #e8f5e8;
            padding: 15px;
            border-radius: 8px;
            text-align: center;
            margin: 5px;
            min-width: 120px;
        }
        .table-name {
            color: #2c3e50;
            font-size: 1.2em;
            font-weight: bold;
            margin: 15px 0 10px 0;
        }
        .primary-key {
            background-color: #ffd700 !important;
            font-weight: bold;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>PostgreSQL 数据库查询报告</h1>
        <p>生成时间: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')</p>
        <p>数据库: $($Config.Database) | 容器: $($Config.Container)</p>
    </div>
"@

        if ($Results.Tables) {
            $html += @"
    <div class="section">
        <h2>数据表概览</h2>
        <div class="stats">
            <div class="stat-card">
                <h3>$($Results.Tables.Count)</h3>
                <p>数据表总数</p>
            </div>
            <div class="stat-card">
                <h3>$script:TotalQueries</h3>
                <p>执行查询数</p>
            </div>
            <div class="stat-card">
                <h3>$script:SuccessfulQueries</h3>
                <p>成功查询数</p>
            </div>
        </div>

        <table>
            <thead>
                <tr>
                    <th>表名</th>
                    <th>列数</th>
                    <th>行数</th>
                    <th>表大小</th>
                </tr>
            </thead>
            <tbody>
"@

            foreach ($table in $Results.Tables) {
                $rowCount = if ($Results.Statistics -and $Results.Statistics[$table.Name]) { $Results.Statistics[$table.Name].TotalRows } else { "N/A" }
                $tableSize = if ($Results.Statistics -and $Results.Statistics[$table.Name]) { $Results.Statistics[$table.Name].TableSize } else { "N/A" }

                $html += "                <tr><td>$($table.Name)</td><td>$($table.ColumnCount)</td><td>$rowCount</td><td>$tableSize</td></tr>`n"
            }

            $html += @"
            </tbody>
        </table>
    </div>
"@
        }

        if ($Results.TableDetails) {
            $html += "    <div class='section'><h2>表结构详情</h2>"

            foreach ($tableName in $Results.TableDetails.Keys) {
                $details = $Results.TableDetails[$tableName]

                $html += "<div class='table-name'>📋 $tableName</div>"

                if ($details.Schema -and (-not $ShowData)) {
                    $html += @"
        <table>
            <thead>
                <tr>
                    <th>列名</th>
                    <th>数据类型</th>
                    <th>可空</th>
                    <th>主键</th>
                    <th>默认值</th>
                </tr>
            </thead>
            <tbody>
"@

                    foreach ($column in $details.Schema) {
                        $nullable = if ($column.IsNullable) { "是" } else { "否" }
                        $primaryKey = if ($column.IsPrimaryKey) { "是" } else { "否" }
                        $defaultValue = if ($column.DefaultValue) { $column.DefaultValue } else { "" }
                        $rowClass = if ($column.IsPrimaryKey) { " class='primary-key'" } else { "" }

                        $html += "                <tr$rowClass><td>$($column.ColumnName)</td><td>$($column.DataType)</td><td>$nullable</td><td>$primaryKey</td><td>$defaultValue</td></tr>`n"
                    }

                    $html += "            </tbody></table>`n"
                }
            }

            $html += "    </div>"
        }

        $endTime = Get-Date
        $duration = ($endTime - $script:StartTime).TotalSeconds

        $html += @"
    <div class="section">
        <h2>执行统计</h2>
        <div class="stats">
            <div class="stat-card">
                <h3>$script:TotalQueries</h3>
                <p>总查询数</p>
            </div>
            <div class="stat-card">
                <h3>$script:SuccessfulQueries</h3>
                <p>成功查询</p>
            </div>
            <div class="stat-card">
                <h3>$script:FailedQueries</h3>
                <p>失败查询</p>
            </div>
            <div class="stat-card">
                <h3>$($duration.ToString('F2'))s</h3>
                <p>执行时间</p>
            </div>
        </div>
    </div>
</body>
</html>
"@

        $html | Out-File -FilePath $FilePath -Encoding UTF8
        Write-LogSuccess "HTML导出完成"

    } catch {
        Write-LogError "HTML导出失败: $($_.Exception.Message)"
    }
}

# ==========================================
# 主程序逻辑
# ==========================================

function Main {
    Write-Host "`n企业级网络设备巡检系统 - PostgreSQL查询工具 v1.0.0`n" -ForegroundColor Green

    # 显示帮助信息
    if ($Help) {
        Show-Help
        return
    }

    # 检查Docker容器状态
    if (-not (Test-DockerContainer)) {
        Write-LogError "请确保Docker容器正在运行"
        return
    }

    # 测试数据库连接
    if (-not (Test-DatabaseConnection)) {
        Write-LogError "无法连接到数据库"
        return
    }

    $results = @{
        Tables = @()
        TableDetails = @{}
        Statistics = @{}
    }

    # 执行自定义SQL查询
    if ($CustomSQL) {
        Write-LogInfo "执行自定义SQL查询..."
        try {
            $customResults = Invoke-PostgreSQLQuery -Query $CustomSQL
            Write-Host "`n自定义查询结果:" -ForegroundColor Yellow
            foreach ($line in $customResults) {
                Write-Host $line -ForegroundColor White
            }
        } catch {
            Write-LogError "自定义查询执行失败: $($_.Exception.Message)"
        }
        return
    }

    # 获取数据表列表
    if ($Table) {
        # 查询指定表
        Write-LogInfo "查询指定表: $Table"
        $results.Tables = @(@{ Name = $Table; Type = "BASE TABLE"; ColumnCount = 0 })
        $tablesToProcess = @($Table)
    } else {
        # 获取所有表
        $results.Tables = Get-DatabaseTables -Pattern $Pattern
        $tablesToProcess = $results.Tables | ForEach-Object { $_.Name }
    }

    if ($tablesToProcess.Count -eq 0) {
        Write-LogWarning "没有找到匹配的数据表"
        return
    }

    # 处理每个表
    foreach ($tableName in $tablesToProcess) {
        $tableDetails = @{}

        # 获取表结构
        if (-not $ShowData) {
            $tableDetails.Schema = Get-TableSchema -TableName $tableName
        }

        # 获取表数据
        if (-not $ShowSchema) {
            $tableDetails.Data = Get-TableData -TableName $tableName -Limit $Limit
        }

        # 获取统计信息
        if ($ShowStats -or $Format -ne "Console") {
            $stats = Get-TableStatistics -TableName $tableName
            if ($stats) {
                $tableDetails.Statistics = $stats
                $results.Statistics[$tableName] = $stats
            }
        }

        $results.TableDetails[$tableName] = $tableDetails

        # 更新表的列数
        if ($results.Tables) {
            $tableInfo = $results.Tables | Where-Object { $_.Name -eq $tableName }
            if ($tableInfo -and $tableDetails.Schema) {
                $tableInfo.ColumnCount = $tableDetails.Schema.Count
            }
        }
    }

    # 输出结果
    switch ($Format) {
        "Console" {
            Format-ConsoleOutput -Results $results
        }
        "CSV" {
            $outputPath = if ($Output) { $Output } else { "database_query_$(Get-Date -Format 'yyyyMMdd_HHmmss').csv" }
            Export-ToCSV -Results $results -FilePath $outputPath
        }
        "JSON" {
            $outputPath = if ($Output) { $Output } else { "database_query_$(Get-Date -Format 'yyyyMMdd_HHmmss').json" }
            Export-ToJSON -Results $results -FilePath $outputPath
        }
        "HTML" {
            $outputPath = if ($Output) { $Output } else { "database_query_$(Get-Date -Format 'yyyyMMdd_HHmmss').html" }
            Export-ToHTML -Results $results -FilePath $outputPath
        }
    }

    # 如果指定了输出文件且不是控制台格式，也显示简要信息
    if ($Output -and $Format -ne "Console") {
        Write-Host "`n查询完成！" -ForegroundColor Green
        Write-Host "  处理表数: $($tablesToProcess.Count)" -ForegroundColor White
        Write-Host "  输出文件: $Output" -ForegroundColor White
        Write-Host "  执行时间: $((Get-Date) - $script:StartTime | ForEach-Object { '{0:F2}' -f $_.TotalSeconds}) 秒" -ForegroundColor White
    }
}

# 捕获所有未处理的异常
try {
    Main
} catch {
    Write-LogError "程序执行失败: $($_.Exception.Message)"
    Write-LogDebug "详细错误信息: $($_.Exception.ToString())"
    exit 1
}