# 清理异常的带宽数据

Write-Host "========================================"
Write-Host "清理异常带宽数据"
Write-Host "========================================"
Write-Host ""

# 1. 查看当前异常数据统计
Write-Host "1. 查看异常数据统计 (> 1000 Mbps):"
docker exec inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev -c "SELECT metric_name, COUNT(*) as abnormal_count, ROUND(AVG(metric_value)::numeric, 2) as avg_value FROM device_metrics WHERE metric_name IN ('bandwidth_in', 'bandwidth_out') AND metric_value > 1000 GROUP BY metric_name;"

Write-Host ""
Write-Host "2. 查看总数据量:"
docker exec inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev -c "SELECT metric_name, COUNT(*) as total_count FROM device_metrics WHERE metric_name IN ('bandwidth_in', 'bandwidth_out') GROUP BY metric_name;"

Write-Host ""
Write-Host "3. 删除异常数据 (> 1000 Mbps)..."
docker exec inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev -c "DELETE FROM device_metrics WHERE metric_name IN ('bandwidth_in', 'bandwidth_out') AND metric_value > 1000;"

Write-Host ""
Write-Host "4. 验证删除后的数据:"
docker exec inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev -c "SELECT metric_name, COUNT(*) as count, ROUND(MIN(metric_value)::numeric, 2) as min_mbps, ROUND(MAX(metric_value)::numeric, 2) as max_mbps, ROUND(AVG(metric_value)::numeric, 2) as avg_mbps FROM device_metrics WHERE metric_name IN ('bandwidth_in', 'bandwidth_out') GROUP BY metric_name;"

Write-Host ""
Write-Host "异常数据已清理完成！" -ForegroundColor Green
Write-Host ""
Write-Host "========================================"
Write-Host "下一步: 重启后端服务"
Write-Host "运行: scripts\development\start-backend-go.ps1"
Write-Host "========================================"