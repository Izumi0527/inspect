# 验证带宽数据的真实性
# 检查 SNMP 采集的带宽数据是否合理

Write-Host "========================================"
Write-Host "带宽数据验证工具"
Write-Host "========================================"
Write-Host ""

# 1. 查看设备信息
Write-Host "1. 设备信息:"
docker exec inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev -c "SELECT id, name, ip_address, device_type, status FROM devices WHERE id = 28;"

# 2. 查看最近的带宽数据
Write-Host ""
Write-Host "2. 最近 10 条带宽数据 (Mbps):"
docker exec inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev -c "SELECT device_id, metric_name, ROUND(metric_value::numeric, 2) as value_mbps, collected_at FROM device_metrics WHERE device_id = 28 AND metric_name IN ('bandwidth_in', 'bandwidth_out') ORDER BY collected_at DESC LIMIT 10;"

# 3. 统计分析
Write-Host ""
Write-Host "3. 带宽数据统计分析:"
docker exec inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev -c "SELECT metric_name, ROUND(MIN(metric_value)::numeric, 2) as min_mbps, ROUND(MAX(metric_value)::numeric, 2) as max_mbps, ROUND(AVG(metric_value)::numeric, 2) as avg_mbps, ROUND(STDDEV(metric_value)::numeric, 2) as stddev_mbps, COUNT(*) as sample_count FROM device_metrics WHERE device_id = 28 AND metric_name IN ('bandwidth_in', 'bandwidth_out') AND collected_at >= NOW() - INTERVAL '24 hours' GROUP BY metric_name;"

# 4. 查看总览页面显示的流量值
Write-Host ""
Write-Host "4. 总览页面显示的流量计算 (最近1小时平均):"
docker exec inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev -c "SELECT ROUND(AVG(CASE WHEN metric_name = 'bandwidth_in' THEN metric_value END)::numeric, 2) as avg_in_mbps, ROUND(AVG(CASE WHEN metric_name = 'bandwidth_out' THEN metric_value END)::numeric, 2) as avg_out_mbps, ROUND((AVG(CASE WHEN metric_name = 'bandwidth_in' THEN metric_value END) + AVG(CASE WHEN metric_name = 'bandwidth_out' THEN metric_value END))::numeric, 2) as total_mbps FROM device_metrics WHERE device_id = 28 AND metric_name IN ('bandwidth_in', 'bandwidth_out') AND collected_at >= NOW() - INTERVAL '1 hour';"

# 5. 检查数据采集频率
Write-Host ""
Write-Host "5. 数据采集频率分析:"
docker exec inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev -c "WITH time_diffs AS (SELECT collected_at, LAG(collected_at) OVER (ORDER BY collected_at) as prev_time, EXTRACT(EPOCH FROM (collected_at - LAG(collected_at) OVER (ORDER BY collected_at))) as seconds_diff FROM device_metrics WHERE device_id = 28 AND metric_name = 'bandwidth_in' AND collected_at >= NOW() - INTERVAL '1 hour') SELECT ROUND(AVG(seconds_diff)::numeric, 2) as avg_interval_seconds, ROUND(MIN(seconds_diff)::numeric, 2) as min_interval_seconds, ROUND(MAX(seconds_diff)::numeric, 2) as max_interval_seconds, COUNT(*) as sample_count FROM time_diffs WHERE seconds_diff IS NOT NULL;"

Write-Host ""
Write-Host "========================================"
Write-Host "分析建议:"
Write-Host "1. 正常办公网络流量: 平均 1-10 Mbps, 峰值 10-50 Mbps"
Write-Host "2. 如果显示 > 100 Mbps 但实际流量很小，可能是计算错误"
Write-Host "3. 需要检查 SNMP 采集器的带宽计算逻辑"
Write-Host "========================================"
Write-Host ""
