# 清理历史 Mbps 带宽数据脚本
# 用途：删除旧的 Mbps 单位的带宽数据，为新的 bps 数据腾出空间
# 
# 使用方法：
#   powershell -ExecutionPolicy Bypass -File scripts/maintenance/clean-bandwidth-mbps-data.ps1

param(
    [switch]$DryRun = $false,  # 仅显示将要删除的数据，不实际删除
    [switch]$Force = $false     # 跳过确认提示
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  带宽数据清理脚本 (Mbps → bps)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 从 .env 文件读取数据库配置
$envFile = ".env"
if (-not (Test-Path $envFile)) {
    Write-Host "错误: 找不到 .env 文件" -ForegroundColor Red
    exit 1
}

$dbHost = "localhost"
$dbPort = "5432"
$dbName = "inspect_system_dev"
$dbUser = "inspect_dev"
$dbPassword = "dev_password_2024"

# 读取 .env 文件
Get-Content $envFile | ForEach-Object {
    if ($_ -match "^DB_HOST=(.+)$") { $dbHost = $matches[1] }
    if ($_ -match "^DB_PORT=(.+)$") { $dbPort = $matches[1] }
    if ($_ -match "^DB_NAME=(.+)$") { $dbName = $matches[1] }
    if ($_ -match "^DB_USER=(.+)$") { $dbUser = $matches[1] }
    if ($_ -match "^DB_PASSWORD=(.+)$") { $dbPassword = $matches[1] }
}

Write-Host "数据库配置:" -ForegroundColor Yellow
Write-Host "  主机: $dbHost" -ForegroundColor Gray
Write-Host "  端口: $dbPort" -ForegroundColor Gray
Write-Host "  数据库: $dbName" -ForegroundColor Gray
Write-Host "  用户: $dbUser" -ForegroundColor Gray
Write-Host ""

# 设置 PostgreSQL 环境变量
$env:PGPASSWORD = $dbPassword

# 检查 Docker 是否可用以及 PostgreSQL 容器是否运行
$dockerPath = "docker"
$postgresContainer = "inspect-postgres-dev"

try {
    $null = & $dockerPath --version 2>&1
} catch {
    Write-Host "错误: 找不到 docker 命令" -ForegroundColor Red
    Write-Host "请确保 Docker 已安装并正在运行" -ForegroundColor Red
    exit 1
}

# 检查 PostgreSQL 容器是否运行
$containerStatus = & $dockerPath ps --filter "name=$postgresContainer" --format "{{.Names}}" 2>&1
if ($containerStatus -ne $postgresContainer) {
    Write-Host "错误: PostgreSQL 容器 '$postgresContainer' 未运行" -ForegroundColor Red
    Write-Host "请先启动容器" -ForegroundColor Red
    exit 1
}

Write-Host "步骤 1: 检查当前带宽数据..." -ForegroundColor Yellow
Write-Host ""

# 查询当前数据统计
$statsQuery = @"
SELECT 
    metric_name,
    COUNT(*) as total_records,
    MIN(metric_value) as min_value,
    MAX(metric_value) as max_value,
    AVG(metric_value) as avg_value,
    MIN(collected_at) as oldest_record,
    MAX(collected_at) as newest_record
FROM device_metrics 
WHERE metric_name IN ('bandwidth_in', 'bandwidth_out')
GROUP BY metric_name
ORDER BY metric_name;
"@

Write-Host "当前带宽数据统计:" -ForegroundColor Cyan
& $dockerPath exec -e PGPASSWORD=$dbPassword $postgresContainer psql -h localhost -p $dbPort -U $dbUser -d $dbName -c $statsQuery

Write-Host ""
Write-Host "步骤 2: 识别异常数据（可能是 Mbps 单位）..." -ForegroundColor Yellow
Write-Host ""

# 查询可能是 Mbps 的异常数据（假设正常 bps 值应该很大）
# 如果值小于 100,000 bps (100 Kbps)，可能是 Mbps 单位的数据
$anomalyQuery = @"
SELECT 
    metric_name,
    COUNT(*) as anomaly_count,
    MIN(metric_value) as min_value,
    MAX(metric_value) as max_value,
    AVG(metric_value) as avg_value
FROM device_metrics 
WHERE metric_name IN ('bandwidth_in', 'bandwidth_out')
  AND metric_value < 100000  -- 小于 100 Kbps，可能是 Mbps 数据
GROUP BY metric_name
ORDER BY metric_name;
"@

Write-Host "疑似 Mbps 单位的数据（值 < 100,000 bps）:" -ForegroundColor Cyan
& $dockerPath exec -e PGPASSWORD=$dbPassword $postgresContainer psql -h localhost -p $dbPort -U $dbUser -d $dbName -c $anomalyQuery

Write-Host ""
Write-Host "步骤 3: 识别超大异常数据..." -ForegroundColor Yellow
Write-Host ""

# 查询超过 10 Gbps 的异常数据
$largeAnomalyQuery = @"
SELECT 
    metric_name,
    COUNT(*) as large_anomaly_count,
    MIN(metric_value) as min_value,
    MAX(metric_value) as max_value,
    AVG(metric_value) as avg_value
FROM device_metrics 
WHERE metric_name IN ('bandwidth_in', 'bandwidth_out')
  AND metric_value > 10000000000  -- 大于 10 Gbps
GROUP BY metric_name
ORDER BY metric_name;
"@

Write-Host "超大异常数据（值 > 10 Gbps）:" -ForegroundColor Cyan
& $dockerPath exec -e PGPASSWORD=$dbPassword $postgresContainer psql -h localhost -p $dbPort -U $dbUser -d $dbName -c $largeAnomalyQuery

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  清理选项" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "请选择清理策略:" -ForegroundColor Yellow
Write-Host "  1. 删除所有带宽数据（推荐 - 重新采集）" -ForegroundColor White
Write-Host "  2. 仅删除疑似 Mbps 数据（值 < 100,000 bps）" -ForegroundColor White
Write-Host "  3. 仅删除超大异常数据（值 > 10 Gbps）" -ForegroundColor White
Write-Host "  4. 删除所有异常数据（选项 2 + 3）" -ForegroundColor White
Write-Host "  5. 取消操作" -ForegroundColor White
Write-Host ""

if (-not $Force) {
    $choice = Read-Host "请输入选项 (1-5)"
} else {
    $choice = "1"
    Write-Host "使用 -Force 参数，自动选择选项 1" -ForegroundColor Yellow
}

$deleteQuery = ""
$description = ""

switch ($choice) {
    "1" {
        $deleteQuery = "DELETE FROM device_metrics WHERE metric_name IN ('bandwidth_in', 'bandwidth_out');"
        $description = "删除所有带宽数据"
    }
    "2" {
        $deleteQuery = "DELETE FROM device_metrics WHERE metric_name IN ('bandwidth_in', 'bandwidth_out') AND metric_value < 100000;"
        $description = "删除疑似 Mbps 数据（值 < 100,000 bps）"
    }
    "3" {
        $deleteQuery = "DELETE FROM device_metrics WHERE metric_name IN ('bandwidth_in', 'bandwidth_out') AND metric_value > 10000000000;"
        $description = "删除超大异常数据（值 > 10 Gbps）"
    }
    "4" {
        $deleteQuery = "DELETE FROM device_metrics WHERE metric_name IN ('bandwidth_in', 'bandwidth_out') AND (metric_value < 100000 OR metric_value > 10000000000);"
        $description = "删除所有异常数据"
    }
    "5" {
        Write-Host ""
        Write-Host "操作已取消" -ForegroundColor Yellow
        exit 0
    }
    default {
        Write-Host ""
        Write-Host "错误: 无效的选项" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  执行清理" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if ($DryRun) {
    Write-Host "【模拟模式】将执行以下操作:" -ForegroundColor Magenta
    Write-Host "  $description" -ForegroundColor White
    Write-Host "  SQL: $deleteQuery" -ForegroundColor Gray
    Write-Host ""
    Write-Host "使用 -DryRun:`$false 参数来实际执行删除操作" -ForegroundColor Yellow
    exit 0
}

Write-Host "即将执行: $description" -ForegroundColor Yellow
Write-Host "SQL: $deleteQuery" -ForegroundColor Gray
Write-Host ""

if (-not $Force) {
    $confirm = Read-Host "确认删除？(yes/no)"
    if ($confirm -ne "yes") {
        Write-Host ""
        Write-Host "操作已取消" -ForegroundColor Yellow
        exit 0
    }
}

Write-Host ""
Write-Host "正在执行删除..." -ForegroundColor Yellow

# 执行删除操作
$result = & $dockerPath exec -e PGPASSWORD=$dbPassword $postgresContainer psql -h localhost -p $dbPort -U $dbUser -d $dbName -c $deleteQuery 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "成功: 删除操作成功完成" -ForegroundColor Green
    Write-Host ""
    
    # 显示删除结果
    if ($result -match "DELETE (\d+)") {
        $deletedCount = $matches[1]
        Write-Host "已删除 $deletedCount 条记录" -ForegroundColor Green
    }
} else {
    Write-Host ""
    Write-Host "错误: 删除操作失败" -ForegroundColor Red
    Write-Host "错误信息: $result" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "步骤 4: 验证清理结果..." -ForegroundColor Yellow
Write-Host ""

# 再次查询数据统计
Write-Host "清理后的数据统计:" -ForegroundColor Cyan
& $dockerPath exec -e PGPASSWORD=$dbPassword $postgresContainer psql -h localhost -p $dbPort -U $dbUser -d $dbName -c $statsQuery

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  清理完成" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "成功: 带宽数据清理完成！" -ForegroundColor Green
Write-Host ""
Write-Host "下一步操作:" -ForegroundColor Yellow
Write-Host "  1. 重启后端服务以应用新的 bps 计算逻辑" -ForegroundColor White
Write-Host "  2. 等待 3-5 分钟让系统采集新数据" -ForegroundColor White
Write-Host "  3. 检查前端显示是否正确" -ForegroundColor White
Write-Host ""
Write-Host "重启后端命令:" -ForegroundColor Yellow
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts/development/start-backend-go.ps1" -ForegroundColor Gray
Write-Host ""
