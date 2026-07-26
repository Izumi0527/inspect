package monitoring

import (
	"context"
	"database/sql"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"

	"gorm.io/datatypes"
	"gorm.io/gorm"
)

const (
	defaultAvailabilityTarget = 99.9
)

type temperatureRow struct {
	Bucket   time.Time `gorm:"column:bucket"`
	DeviceID int       `gorm:"column:device_id"`
	Value    *float64  `gorm:"column:value"`
}

// isUndefinedRelationError 用于识别“表/视图不存在”的数据库错误（SQLSTATE 42P01）。
// 该错误在本项目中常见于：未创建 *metrics_hourly 聚合表/视图时，长时间范围查询会失败。
func isUndefinedRelationError(err error) bool {
	if err == nil {
		return false
	}
	// gorm/driver 对底层 pg 错误的包装层级不固定，这里使用 SQLSTATE 码做最小可靠判断。
	return strings.Contains(err.Error(), "SQLSTATE 42P01")
}

func (w *MetricsWriter) GetDevicesStatus(ctx context.Context) ([]DeviceStatusSummary, error) {
	if w.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	type deviceRow struct {
		ID           int        `gorm:"column:id"`
		Name         string     `gorm:"column:name"`
		IPAddress    string     `gorm:"column:ip_address"`
		Status       string     `gorm:"column:status"`
		CPUUsage     *float64   `gorm:"column:cpu_usage"`
		MemoryUsage  *float64   `gorm:"column:memory_usage"`
		Uptime       *int64     `gorm:"column:uptime"`
		LastSeen     *time.Time `gorm:"column:last_seen"`
		AlertCount   *int       `gorm:"column:alert_count"`
		ResponseTime *float64   `gorm:"column:response_time"`
	}

	rows := make([]deviceRow, 0)
	if err := w.db.WithContext(ctx).
		Table("devices").
		Select("id, name, ip_address, status, cpu_usage, memory_usage, uptime, last_seen, alert_count, response_time").
		Where("is_active = ?", true).
		Order("id ASC").
		Scan(&rows).Error; err != nil {
		return nil, err
	}

	result := make([]DeviceStatusSummary, 0, len(rows))
	for _, row := range rows {
		status := normalizeDeviceStatus(row.Status)
		rawStatus := strings.ToLower(strings.TrimSpace(row.Status))
		if rawStatus == "" {
			rawStatus = "unknown"
		}
		var uptime *string
		if row.Uptime != nil {
			value := strconv.FormatInt(*row.Uptime, 10)
			uptime = &value
		}
		result = append(result, DeviceStatusSummary{
			DeviceID:     row.ID,
			Name:         row.Name,
			DeviceName:   row.Name,
			IPAddress:    row.IPAddress,
			Status:       status,
			DeviceStatus: rawStatus,
			CPUUsage:     row.CPUUsage,
			MemoryUsage:  row.MemoryUsage,
			Uptime:       uptime,
			LastSeen:     row.LastSeen,
			LastCheck:    row.LastSeen,
			AlertCount:   row.AlertCount,
			ResponseTime: row.ResponseTime,
		})
	}

	return result, nil
}

func (w *MetricsWriter) GetDeviceStatus(ctx context.Context, deviceID int) (DeviceStatusSummary, error) {
	if w.db == nil {
		return DeviceStatusSummary{}, fmt.Errorf("database not initialized")
	}

	type deviceRow struct {
		ID           int        `gorm:"column:id"`
		Name         string     `gorm:"column:name"`
		IPAddress    string     `gorm:"column:ip_address"`
		Status       string     `gorm:"column:status"`
		CPUUsage     *float64   `gorm:"column:cpu_usage"`
		MemoryUsage  *float64   `gorm:"column:memory_usage"`
		Uptime       *int64     `gorm:"column:uptime"`
		LastSeen     *time.Time `gorm:"column:last_seen"`
		AlertCount   *int       `gorm:"column:alert_count"`
		ResponseTime *float64   `gorm:"column:response_time"`
	}

	var row deviceRow
	if err := w.db.WithContext(ctx).
		Table("devices").
		Select("id, name, ip_address, status, cpu_usage, memory_usage, uptime, last_seen, alert_count, response_time").
		Where("id = ?", deviceID).
		Take(&row).Error; err != nil {
		return DeviceStatusSummary{}, err
	}

	status := normalizeDeviceStatus(row.Status)
	rawStatus := strings.ToLower(strings.TrimSpace(row.Status))
	if rawStatus == "" {
		rawStatus = "unknown"
	}
	var uptime *string
	if row.Uptime != nil {
		value := strconv.FormatInt(*row.Uptime, 10)
		uptime = &value
	}

	return DeviceStatusSummary{
		DeviceID:     row.ID,
		Name:         row.Name,
		DeviceName:   row.Name,
		IPAddress:    row.IPAddress,
		Status:       status,
		DeviceStatus: rawStatus,
		CPUUsage:     row.CPUUsage,
		MemoryUsage:  row.MemoryUsage,
		Uptime:       uptime,
		LastSeen:     row.LastSeen,
		LastCheck:    row.LastSeen,
		AlertCount:   row.AlertCount,
		ResponseTime: row.ResponseTime,
	}, nil
}

func (w *MetricsWriter) ListMonitoringDevices(ctx context.Context) ([]MonitoringDevice, error) {
	if w.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	type deviceRow struct {
		ID              int        `gorm:"column:id"`
		Name            string     `gorm:"column:name"`
		IPAddress       string     `gorm:"column:ip_address"`
		Status          string     `gorm:"column:status"`
		IsMonitored     bool       `gorm:"column:is_monitored"`
		MonitorInterval int        `gorm:"column:monitor_interval"`
		LastSeen        *time.Time `gorm:"column:last_seen"`
	}

	rows := make([]deviceRow, 0)
	if err := w.db.WithContext(ctx).
		Table("devices").
		Select("id, name, ip_address, status, is_monitored, monitor_interval, last_seen").
		Where("is_active = ?", true).
		Order("id ASC").
		Scan(&rows).Error; err != nil {
		return nil, err
	}

	result := make([]MonitoringDevice, 0, len(rows))
	for _, row := range rows {
		result = append(result, MonitoringDevice{
			ID:              row.ID,
			Name:            row.Name,
			IPAddress:       row.IPAddress,
			Status:          row.Status,
			IsMonitored:     row.IsMonitored,
			MonitorInterval: row.MonitorInterval,
			LastSeen:        row.LastSeen,
		})
	}

	return result, nil
}

func (w *MetricsWriter) SetDeviceMonitoring(ctx context.Context, deviceID int, enabled bool, interval int) error {
	if w.db == nil {
		return fmt.Errorf("database not initialized")
	}

	updates := map[string]interface{}{
		"is_monitored": enabled,
	}
	if interval > 0 {
		updates["monitor_interval"] = interval
	}

	result := w.db.WithContext(ctx).Table("devices").Where("id = ?", deviceID).Updates(updates)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// GetDeviceStatusDistribution 统计设备状态分布；deviceIDs 非空时仅统计所选设备。
func (w *MetricsWriter) GetDeviceStatusDistribution(ctx context.Context, deviceIDs []int) (DeviceStatusDistribution, error) {
	if w.db == nil {
		return DeviceStatusDistribution{}, fmt.Errorf("database not initialized")
	}

	type statusRow struct {
		Status string `gorm:"column:status"`
		Count  int    `gorm:"column:count"`
	}

	rows := make([]statusRow, 0)
	query := w.db.WithContext(ctx).
		Table("devices").
		Select("status, COUNT(*) as count").
		Where("is_active = ?", true)
	if len(deviceIDs) > 0 {
		query = query.Where("id IN ?", deviceIDs)
	}
	if err := query.
		Group("status").
		Scan(&rows).Error; err != nil {
		return DeviceStatusDistribution{}, err
	}

	dist := DeviceStatusDistribution{}
	for _, row := range rows {
		switch normalizeStatusBucket(row.Status) {
		case "healthy":
			dist.Healthy += row.Count
		case "critical":
			dist.Critical += row.Count
		case "offline":
			dist.Offline += row.Count
		default:
			dist.Warning += row.Count
		}
	}

	return dist, nil
}

// GetAvailability 计算整体可用性；deviceIDs 非空时仅统计所选设备。
func (w *MetricsWriter) GetAvailability(ctx context.Context, deviceIDs []int) (AvailabilitySnapshot, error) {
	if w.db == nil {
		return AvailabilitySnapshot{}, fmt.Errorf("database not initialized")
	}

	total, online, err := countActiveAndOnlineDevices(ctx, w.db, deviceIDs)
	if err != nil {
		return AvailabilitySnapshot{}, err
	}

	availability := 100.0
	if total > 0 {
		availability = float64(online) / float64(total) * 100
	}

	return AvailabilitySnapshot{
		Current:    roundFloat(availability, 2),
		Target:     defaultAvailabilityTarget,
		Trend:      "stable",
		LastUpdate: time.Now().UTC().Format(time.RFC3339Nano),
	}, nil
}

// GetMonitoringStats 返回监控中心统计卡数据；deviceIDs 非空时仅统计所选设备。
// CPU/内存口径为"最近一轮采集"：取每台设备新鲜窗口内最近一次采集值再求跨设备平均，
// 无新鲜样本时回退 devices 表快照平均（避免采集暂停时卡片清零）。
func (w *MetricsWriter) GetMonitoringStats(ctx context.Context, deviceIDs []int) (MonitoringStats, error) {
	if w.db == nil {
		return MonitoringStats{}, fmt.Errorf("database not initialized")
	}

	total, online, err := countActiveAndOnlineDevices(ctx, w.db, deviceIDs)
	if err != nil {
		return MonitoringStats{}, err
	}

	var activeAlerts int64
	alertsQuery := w.db.WithContext(ctx).
		Table("alerts AS a").
		Joins("JOIN devices d ON d.id = a.device_id").
		Where("a.status IN ?", []string{"open", "acknowledged"})
	if len(deviceIDs) > 0 {
		alertsQuery = alertsQuery.Where("a.device_id IN ?", deviceIDs)
	}
	if err := alertsQuery.Count(&activeAlerts).Error; err != nil {
		return MonitoringStats{}, err
	}

	avgCPU, err := latestSampleAverageWithFallback(ctx, w.db, "cpu_usage", deviceIDs)
	if err != nil {
		return MonitoringStats{}, err
	}

	avgMemory, err := latestSampleAverageWithFallback(ctx, w.db, "memory_usage", deviceIDs)
	if err != nil {
		return MonitoringStats{}, err
	}

	// 查询24小时内的峰值网络流量（bps）
	peakNetwork, _, err := peakNetworkMetric24h(ctx, w.db, deviceIDs)
	if err != nil {
		return MonitoringStats{}, err
	}

	availability := 100.0
	if total > 0 {
		availability = float64(online) / float64(total) * 100
	}

	// devices 表中的 cpu_usage 和 memory_usage 已经是百分比格式（0-100）
	// 不需要再乘以 100

	return MonitoringStats{
		TotalDevices: int(total),
		Availability: roundFloat(availability, 2),
		ActiveAlerts: int(activeAlerts),
		AvgCPU:       roundFloat(avgCPU, 1),
		AvgMemory:    roundFloat(avgMemory, 1),
		AvgNetwork:   roundFloat(peakNetwork, 1), // 24小时峰值流量（bps）
	}, nil
}

func (w *MetricsWriter) GetMonitoringOverview(ctx context.Context) (MonitoringOverview, error) {
	if w.db == nil {
		return MonitoringOverview{}, fmt.Errorf("database not initialized")
	}

	var total int64
	if err := w.db.WithContext(ctx).
		Table("devices").
		Where("is_active = ?", true).
		Count(&total).Error; err != nil {
		return MonitoringOverview{}, err
	}

	var online int64
	if err := w.db.WithContext(ctx).
		Table("devices").
		Where("is_active = ? AND status = ?", true, "online").
		Count(&online).Error; err != nil {
		return MonitoringOverview{}, err
	}

	var totalAlerts int64
	if err := w.db.WithContext(ctx).
		Table("alerts AS a").
		Joins("JOIN devices d ON d.id = a.device_id").
		Count(&totalAlerts).Error; err != nil {
		return MonitoringOverview{}, err
	}

	avgResponse, err := avgDeviceColumn(ctx, w.db, "response_time", nil)
	if err != nil {
		return MonitoringOverview{}, err
	}

	return MonitoringOverview{
		LastUpdated:     time.Now().UTC().Format(time.RFC3339Nano),
		TotalDevices:    int(total),
		OnlineDevices:   int(online),
		TotalAlerts:     int(totalAlerts),
		AvgResponseTime: roundFloat(avgResponse, 2),
	}, nil
}

func (w *MetricsWriter) GetSystemStatusSnapshot(ctx context.Context) (SystemStatusSnapshot, error) {
	if w.db == nil {
		return SystemStatusSnapshot{}, fmt.Errorf("database not initialized")
	}

	type metricRow struct {
		MetricName  string    `gorm:"column:metric_name"`
		MetricValue *float64  `gorm:"column:metric_value"`
		CollectedAt time.Time `gorm:"column:collected_at"`
	}

	rows := make([]metricRow, 0)
	query := `
        SELECT DISTINCT ON (metric_name)
            metric_name,
            metric_value,
            collected_at
        FROM system_metrics
        ORDER BY metric_name, collected_at DESC`

	if err := w.db.WithContext(ctx).Raw(query).Scan(&rows).Error; err != nil {
		return SystemStatusSnapshot{}, err
	}

	snapshot := SystemStatusSnapshot{
		Timestamp: time.Now().UTC(),
	}

	latest := snapshot.Timestamp
	for _, row := range rows {
		if row.CollectedAt.After(latest) {
			latest = row.CollectedAt
		}
		switch row.MetricName {
		case "cpu_usage":
			snapshot.CPUUsage = row.MetricValue
		case "memory_usage":
			snapshot.MemoryUsage = row.MetricValue
		case "disk_usage":
			snapshot.DiskUsage = row.MetricValue
		case "network_traffic", "network_bytes_in", "network_bytes_out":
			if row.MetricValue != nil {
				value := networkMetricToMbps(*row.MetricValue, row.MetricName)
				snapshot.NetworkTraffic = &value
			}
		}
	}

	snapshot.Timestamp = latest.UTC()
	return snapshot, nil
}

func (w *MetricsWriter) GetBulkMetricsHistory(
	ctx context.Context,
	deviceIDs []int,
	start time.Time,
	end time.Time,
	metricNames []string,
) ([]HistoryPoint, error) {
	if w.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	if len(deviceIDs) == 0 {
		return nil, fmt.Errorf("device_ids is required")
	}

	useHourly := shouldUseHourlyAggregate(start, end)
	points := make([]HistoryPoint, 0)

	if useHourly {
		type row struct {
			Bucket      time.Time `gorm:"column:bucket"`
			DeviceID    int       `gorm:"column:device_id"`
			MetricName  string    `gorm:"column:metric_name"`
			MetricValue *float64  `gorm:"column:metric_value"`
		}

		rows := make([]row, 0)
		query := w.db.WithContext(ctx).
			Table("device_metrics_hourly").
			Select("bucket, device_id, metric_name, avg_value AS metric_value").
			Where("bucket >= ? AND bucket <= ?", start, end).
			Where("device_id IN ?", deviceIDs)

		if len(metricNames) > 0 {
			query = query.Where("metric_name IN ?", metricNames)
		}

		if err := query.Order("bucket ASC").Scan(&rows).Error; err != nil {
			// 兼容：缺少 device_metrics_hourly 时回退到动态聚合（按小时 bucket）
			if !isUndefinedRelationError(err) {
				return nil, err
			}

			fallback := w.db.WithContext(ctx).
				Table("device_metrics").
				Select("time_bucket('1 hour', collected_at) AS bucket, device_id, metric_name, AVG(metric_value) AS metric_value").
				Where("collected_at >= ? AND collected_at <= ?", start, end).
				Where("device_id IN ?", deviceIDs)
			if len(metricNames) > 0 {
				fallback = fallback.Where("metric_name IN ?", metricNames)
			}
			if err := fallback.
				Group("bucket, device_id, metric_name").
				Order("bucket ASC").
				Scan(&rows).Error; err != nil {
				return nil, err
			}
		}

		for _, row := range rows {
			value := row.MetricValue
			var unit *string
			if value != nil && isNetworkMetric(row.MetricName) {
				converted := bpsToMbps(*value)
				value = &converted
				unitValue := "Mbps"
				unit = &unitValue
			}
			points = append(points, HistoryPoint{
				Timestamp:  row.Bucket.UTC().Format(time.RFC3339Nano),
				MetricType: row.MetricName,
				MetricName: row.MetricName,
				Value:      value,
				DeviceID:   row.DeviceID,
				MetricUnit: unit,
				Unit:       unit,
			})
		}

		return points, nil
	}

	type row struct {
		DeviceID      int               `gorm:"column:device_id"`
		MetricName    string            `gorm:"column:metric_name"`
		MetricValue   *float64          `gorm:"column:metric_value"`
		MetricUnit    *string           `gorm:"column:metric_unit"`
		InterfaceName *string           `gorm:"column:interface_name"`
		Tags          datatypes.JSONMap `gorm:"column:tags"`
		CollectedAt   time.Time         `gorm:"column:collected_at"`
	}

	rows := make([]row, 0)
	query := w.db.WithContext(ctx).
		Table("device_metrics").
		Select("device_id, metric_name, metric_value, metric_unit, interface_name, tags, collected_at").
		Where("device_id IN ?", deviceIDs).
		Where("collected_at >= ? AND collected_at <= ?", start, end)

	if len(metricNames) > 0 {
		query = query.Where("metric_name IN ?", metricNames)
	}

	if err := query.Order("collected_at ASC").Scan(&rows).Error; err != nil {
		return nil, err
	}

	for _, row := range rows {
		value := row.MetricValue
		unit := row.MetricUnit
		if value != nil && isNetworkMetric(row.MetricName) {
			converted := bpsToMbps(*value)
			value = &converted
			unitValue := "Mbps"
			unit = &unitValue
		}
		points = append(points, HistoryPoint{
			Timestamp:     row.CollectedAt.UTC().Format(time.RFC3339Nano),
			MetricType:    row.MetricName,
			MetricName:    row.MetricName,
			Value:         value,
			DeviceID:      row.DeviceID,
			MetricUnit:    unit,
			Unit:          unit,
			InterfaceName: row.InterfaceName,
			Tags:          row.Tags,
		})
	}

	return points, nil
}

// GetSystemPerformanceHistory 查询性能趋势时序；deviceIDs 非空时仅聚合所选设备
// （此时不再回退主机级 system_metrics，因其无设备维度）。
func (w *MetricsWriter) GetSystemPerformanceHistory(
	ctx context.Context,
	start time.Time,
	end time.Time,
	metrics []string,
	deviceIDs []int,
) ([]SystemPerformancePoint, error) {
	if w.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	metricSet := normalizeMetrics(metrics, []string{"cpu_usage", "memory_usage", "network_traffic"})
	if len(metricSet) == 0 {
		metricSet = []string{"cpu_usage", "memory_usage", "network_traffic"}
	}

	// 尝试从缓存获取
	if w.cache != nil {
		if cached, found := w.cache.GetSystemPerformance(ctx, start, end, metricSet, deviceIDs); found {
			return cached, nil
		}
	}

	bucket := bucketSizeForRange(start, end)
	series := make(map[time.Time]*SystemPerformancePoint)

	for _, metric := range metricSet {
		values, err := w.querySystemMetricSeries(ctx, start, end, metric, bucket, deviceIDs)
		if err != nil {
			return nil, err
		}
		if metric == "network_traffic" && len(values) == 0 {
			inbound, err := w.querySystemMetricSeries(ctx, start, end, "network_bytes_in", bucket, deviceIDs)
			if err != nil {
				return nil, err
			}
			outbound, err := w.querySystemMetricSeries(ctx, start, end, "network_bytes_out", bucket, deviceIDs)
			if err != nil {
				return nil, err
			}
			values = mergeSeries(inbound, outbound)
		}
		for ts, value := range values {
			point := series[ts]
			if point == nil {
				point = &SystemPerformancePoint{
					Timestamp: ts.UTC().Format(time.RFC3339Nano),
				}
				series[ts] = point
			}
			switch metric {
			case "cpu_usage":
				point.CPUUsage = value
			case "memory_usage":
				point.MemoryUsage = value
			case "network_traffic":
				point.NetworkTraffic = bpsToMbps(value)
			}
		}
	}

	result := flattenSystemSeries(series)

	// 写入缓存
	if w.cache != nil {
		w.cache.SetSystemPerformance(ctx, start, end, metricSet, deviceIDs, result)
	}

	return result, nil
}

// GetTemperatureHistory 查询设备温度时序；deviceIDs 非空时仅返回所选设备。
func (w *MetricsWriter) GetTemperatureHistory(ctx context.Context, start time.Time, end time.Time, deviceIDs []int) ([]TemperatureHistoryPoint, error) {
	if w.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	// 尝试从缓存获取
	if w.cache != nil {
		if cached, found := w.cache.GetTemperature(ctx, start, end, deviceIDs); found {
			return cached, nil
		}
	}

	bucket := bucketSizeForRange(start, end)
	useHourly := bucket >= time.Hour

	deviceFilter := ""
	if len(deviceIDs) > 0 {
		deviceFilter = " AND device_id IN (?)"
	}

	rows := make([]temperatureRow, 0)
	if useHourly {
		hourlyQuery := w.db.WithContext(ctx).
			Table("device_metrics_hourly").
			Select("bucket, device_id, avg_value AS value").
			Where("metric_name = ?", "temperature").
			Where("bucket >= ? AND bucket <= ?", start, end)
		if len(deviceIDs) > 0 {
			hourlyQuery = hourlyQuery.Where("device_id IN ?", deviceIDs)
		}
		if err := hourlyQuery.
			Order("bucket ASC").
			Scan(&rows).Error; err != nil {
			// 兼容：缺少 device_metrics_hourly 时回退到动态聚合（按小时 bucket）
			if !isUndefinedRelationError(err) {
				return nil, err
			}
			query := fmt.Sprintf(
				"SELECT time_bucket('%s', collected_at) AS bucket, device_id, AVG(metric_value) AS value FROM device_metrics WHERE metric_name = ? AND collected_at >= ? AND collected_at <= ?%s GROUP BY bucket, device_id ORDER BY bucket ASC",
				"1 hour",
				deviceFilter,
			)
			args := []interface{}{"temperature", start, end}
			if len(deviceIDs) > 0 {
				args = append(args, deviceIDs)
			}
			if err := w.db.WithContext(ctx).Raw(query, args...).Scan(&rows).Error; err != nil {
				return nil, err
			}
		}
	} else {
		interval := bucketIntervalString(bucket)
		query := fmt.Sprintf(
			"SELECT time_bucket('%s', collected_at) AS bucket, device_id, AVG(metric_value) AS value FROM device_metrics WHERE metric_name = ? AND collected_at >= ? AND collected_at <= ?%s GROUP BY bucket, device_id ORDER BY bucket ASC",
			interval,
			deviceFilter,
		)
		args := []interface{}{"temperature", start, end}
		if len(deviceIDs) > 0 {
			args = append(args, deviceIDs)
		}
		if err := w.db.WithContext(ctx).Raw(query, args...).Scan(&rows).Error; err != nil {
			return nil, err
		}
	}

	if len(rows) == 0 {
		return []TemperatureHistoryPoint{}, nil
	}

	deviceNames, err := w.lookupDeviceNames(ctx, rows)
	if err != nil {
		return nil, err
	}

	points := make(map[time.Time]map[string]float64)
	for _, row := range rows {
		if row.Value == nil {
			continue
		}
		name := deviceNames[row.DeviceID]
		if name == "" {
			name = fmt.Sprintf("device_%d", row.DeviceID)
		}
		bucket := row.Bucket.UTC()
		if points[bucket] == nil {
			points[bucket] = make(map[string]float64)
		}
		points[bucket][name] = *row.Value
	}

	result := flattenTemperatureSeries(points)

	// 写入缓存
	if w.cache != nil {
		w.cache.SetTemperature(ctx, start, end, deviceIDs, result)
	}

	return result, nil
}

// GetNetworkTrafficHistory 查询网络流量时序；deviceIDs 非空时仅聚合所选设备。
func (w *MetricsWriter) GetNetworkTrafficHistory(ctx context.Context, start time.Time, end time.Time, deviceIDs []int) ([]NetworkTrafficPoint, error) {
	if w.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	// 尝试从缓存获取
	if w.cache != nil {
		if cached, found := w.cache.GetNetworkTraffic(ctx, start, end, deviceIDs); found {
			return cached, nil
		}
	}

	bucket := bucketSizeForRange(start, end)
	useHourly := bucket >= time.Hour

	inboundNames := []string{"bandwidth_in", "network_bytes_in", "throughput_in"}
	outboundNames := []string{"bandwidth_out", "network_bytes_out", "throughput_out"}
	allNames := append(append([]string{}, inboundNames...), outboundNames...)

	deviceFilter := ""
	if len(deviceIDs) > 0 {
		deviceFilter = " AND device_id IN (?)"
	}

	type row struct {
		Bucket   time.Time `gorm:"column:bucket"`
		Inbound  *float64  `gorm:"column:inbound"`
		Outbound *float64  `gorm:"column:outbound"`
	}

	rows := make([]row, 0)
	if useHourly {
		query := fmt.Sprintf(
			`SELECT bucket,
                SUM(CASE WHEN metric_name IN (%s) THEN avg_value ELSE 0 END) AS inbound,
                SUM(CASE WHEN metric_name IN (%s) THEN avg_value ELSE 0 END) AS outbound
             FROM device_metrics_hourly
             WHERE bucket >= ? AND bucket <= ? AND metric_name IN (%s)%s
             GROUP BY bucket
             ORDER BY bucket ASC`,
			formatMetricList(inboundNames),
			formatMetricList(outboundNames),
			formatMetricList(allNames),
			deviceFilter,
		)
		hourlyArgs := []interface{}{start, end}
		if len(deviceIDs) > 0 {
			hourlyArgs = append(hourlyArgs, deviceIDs)
		}
		if err := w.db.WithContext(ctx).Raw(query, hourlyArgs...).Scan(&rows).Error; err != nil {
			// 兼容：缺少 device_metrics_hourly 时回退到动态聚合（按小时 bucket）
			if !isUndefinedRelationError(err) {
				return nil, err
			}

			interval := "1 hour"
			fallback := fmt.Sprintf(
				`WITH combined_metrics AS (
				SELECT collected_at, metric_name, metric_value FROM device_metrics
				WHERE collected_at >= ? AND collected_at <= ? AND metric_name IN (%s)%s
				UNION ALL
				SELECT collected_at, metric_name, metric_value FROM interface_metrics
				WHERE collected_at >= ? AND collected_at <= ? AND metric_name IN (%s)%s
			)
			SELECT time_bucket('%s', collected_at) AS bucket,
                SUM(CASE WHEN metric_name IN (%s) THEN metric_value ELSE 0 END) AS inbound,
                SUM(CASE WHEN metric_name IN (%s) THEN metric_value ELSE 0 END) AS outbound
             FROM combined_metrics
             GROUP BY bucket
             ORDER BY bucket ASC`,
				formatMetricList(allNames),
				deviceFilter,
				formatMetricList(allNames),
				deviceFilter,
				interval,
				formatMetricList(inboundNames),
				formatMetricList(outboundNames),
			)
			fallbackArgs := []interface{}{start, end}
			if len(deviceIDs) > 0 {
				fallbackArgs = append(fallbackArgs, deviceIDs)
			}
			fallbackArgs = append(fallbackArgs, start, end)
			if len(deviceIDs) > 0 {
				fallbackArgs = append(fallbackArgs, deviceIDs)
			}
			if err := w.db.WithContext(ctx).Raw(fallback, fallbackArgs...).Scan(&rows).Error; err != nil {
				return nil, err
			}
		}
	} else {
		interval := bucketIntervalString(bucket)
		// Query from both device_metrics and interface_metrics tables using UNION ALL
		query := fmt.Sprintf(
			`WITH combined_metrics AS (
				SELECT collected_at, metric_name, metric_value FROM device_metrics
				WHERE collected_at >= ? AND collected_at <= ? AND metric_name IN (%s)%s
				UNION ALL
				SELECT collected_at, metric_name, metric_value FROM interface_metrics
				WHERE collected_at >= ? AND collected_at <= ? AND metric_name IN (%s)%s
			)
			SELECT time_bucket('%s', collected_at) AS bucket,
                SUM(CASE WHEN metric_name IN (%s) THEN metric_value ELSE 0 END) AS inbound,
                SUM(CASE WHEN metric_name IN (%s) THEN metric_value ELSE 0 END) AS outbound
             FROM combined_metrics
             GROUP BY bucket
             ORDER BY bucket ASC`,
			formatMetricList(allNames),
			deviceFilter,
			formatMetricList(allNames),
			deviceFilter,
			interval,
			formatMetricList(inboundNames),
			formatMetricList(outboundNames),
		)
		rawArgs := []interface{}{start, end}
		if len(deviceIDs) > 0 {
			rawArgs = append(rawArgs, deviceIDs)
		}
		rawArgs = append(rawArgs, start, end)
		if len(deviceIDs) > 0 {
			rawArgs = append(rawArgs, deviceIDs)
		}
		if err := w.db.WithContext(ctx).Raw(query, rawArgs...).Scan(&rows).Error; err != nil {
			return nil, err
		}
	}

	points := make([]NetworkTrafficPoint, 0, len(rows))
	for _, row := range rows {
		inbound := 0.0
		if row.Inbound != nil {
			inbound = *row.Inbound
		}
		outbound := 0.0
		if row.Outbound != nil {
			outbound = *row.Outbound
		}
		points = append(points, NetworkTrafficPoint{
			Timestamp: row.Bucket.UTC().Format(time.RFC3339Nano),
			Inbound:   bpsToMbps(inbound),
			Outbound:  bpsToMbps(outbound),
		})
	}

	// 写入缓存
	if w.cache != nil {
		w.cache.SetNetworkTraffic(ctx, start, end, deviceIDs, points)
	}

	return points, nil
}

func (w *MetricsWriter) querySystemMetricSeries(
	ctx context.Context,
	start time.Time,
	end time.Time,
	metric string,
	bucket time.Duration,
	deviceIDs []int,
) (map[time.Time]float64, error) {
	useHourly := bucket >= time.Hour

	type row struct {
		Bucket time.Time `gorm:"column:bucket"`
		Value  *float64  `gorm:"column:value"`
	}

	rows := make([]row, 0)

	deviceFilter := ""
	if len(deviceIDs) > 0 {
		deviceFilter = " AND device_id IN (?)"
	}
	buildArgs := func() []interface{} {
		args := []interface{}{metric, start, end}
		if len(deviceIDs) > 0 {
			args = append(args, deviceIDs)
		}
		return args
	}

	// First try device_metrics table (aggregated from all devices)
	if useHourly {
		hourlyQuery := w.db.WithContext(ctx).
			Table("device_metrics_hourly").
			Select("bucket, AVG(avg_value) AS value").
			Where("metric_name = ?", metric).
			Where("bucket >= ? AND bucket <= ?", start, end)
		if len(deviceIDs) > 0 {
			hourlyQuery = hourlyQuery.Where("device_id IN ?", deviceIDs)
		}
		if err := hourlyQuery.
			Group("bucket").
			Order("bucket ASC").
			Scan(&rows).Error; err != nil {
			// 兼容：缺少 device_metrics_hourly 时回退到动态聚合（按小时 bucket）
			if !isUndefinedRelationError(err) {
				return nil, err
			}
			query := fmt.Sprintf(
				"SELECT time_bucket('%s', collected_at) AS bucket, AVG(metric_value) AS value FROM device_metrics WHERE metric_name = ? AND collected_at >= ? AND collected_at <= ?%s GROUP BY bucket ORDER BY bucket ASC",
				"1 hour",
				deviceFilter,
			)
			if err := w.db.WithContext(ctx).Raw(query, buildArgs()...).Scan(&rows).Error; err != nil {
				return nil, err
			}
		}
	} else {
		interval := bucketIntervalString(bucket)
		query := fmt.Sprintf(
			"SELECT time_bucket('%s', collected_at) AS bucket, AVG(metric_value) AS value FROM device_metrics WHERE metric_name = ? AND collected_at >= ? AND collected_at <= ?%s GROUP BY bucket ORDER BY bucket ASC",
			interval,
			deviceFilter,
		)
		if err := w.db.WithContext(ctx).Raw(query, buildArgs()...).Scan(&rows).Error; err != nil {
			return nil, err
		}
	}

	// If no data from device_metrics, fallback to system_metrics.
	// 设备筛选时跳过：system_metrics 是主机级指标，无设备维度，回退会造成"筛选无效"的假数据。
	if len(rows) == 0 && len(deviceIDs) == 0 {
		if useHourly {
			if err := w.db.WithContext(ctx).
				Table("system_metrics_hourly").
				Select("bucket, AVG(avg_value) AS value").
				Where("metric_name = ?", metric).
				Where("bucket >= ? AND bucket <= ?", start, end).
				Group("bucket").
				Order("bucket ASC").
				Scan(&rows).Error; err != nil {
				// 兼容：缺少 system_metrics_hourly 时回退到动态聚合（按小时 bucket）
				if !isUndefinedRelationError(err) {
					return nil, err
				}
				query := fmt.Sprintf(
					"SELECT time_bucket('%s', collected_at) AS bucket, AVG(metric_value) AS value FROM system_metrics WHERE metric_name = ? AND collected_at >= ? AND collected_at <= ? GROUP BY bucket ORDER BY bucket ASC",
					"1 hour",
				)
				if err := w.db.WithContext(ctx).Raw(query, metric, start, end).Scan(&rows).Error; err != nil {
					return nil, err
				}
			}
		} else {
			interval := bucketIntervalString(bucket)
			query := fmt.Sprintf(
				"SELECT time_bucket('%s', collected_at) AS bucket, AVG(metric_value) AS value FROM system_metrics WHERE metric_name = ? AND collected_at >= ? AND collected_at <= ? GROUP BY bucket ORDER BY bucket ASC",
				interval,
			)
			if err := w.db.WithContext(ctx).Raw(query, metric, start, end).Scan(&rows).Error; err != nil {
				return nil, err
			}
		}
	}

	result := make(map[time.Time]float64, len(rows))
	for _, row := range rows {
		if row.Value == nil {
			continue
		}
		result[row.Bucket.UTC()] = *row.Value
	}

	return result, nil
}

func normalizeDeviceStatus(status string) string {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "online", "healthy", "normal", "ok":
		return "healthy"
	case "offline", "error", "failed", "critical", "down":
		return "critical"
	case "maintenance":
		return "warning"
	default:
		return "warning"
	}
}

func normalizeStatusBucket(status string) string {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "online":
		return "healthy"
	case "offline":
		return "offline"
	case "error", "failed", "critical":
		return "critical"
	case "maintenance":
		return "warning"
	default:
		return "warning"
	}
}

func bucketSizeForRange(start time.Time, end time.Time) time.Duration {
	if end.Before(start) {
		return 15 * time.Minute
	}

	duration := end.Sub(start)
	switch {
	case duration <= 24*time.Hour:
		return 5 * time.Minute // 24小时内使用5分钟间隔
	case duration <= 48*time.Hour:
		return 15 * time.Minute
	case duration <= 7*24*time.Hour:
		return time.Hour
	case duration <= 30*24*time.Hour:
		return 6 * time.Hour
	default:
		return 24 * time.Hour
	}
}

func bucketIntervalString(bucket time.Duration) string {
	minutes := int(bucket.Minutes())
	if minutes <= 0 {
		return "5 minutes"
	}
	if minutes%60 == 0 {
		hours := minutes / 60
		if hours == 1 {
			return "1 hour"
		}
		return fmt.Sprintf("%d hours", hours)
	}
	return fmt.Sprintf("%d minutes", minutes)
}

func normalizeMetrics(metrics []string, allowed []string) []string {
	if len(metrics) == 0 {
		return nil
	}
	allowedSet := make(map[string]struct{}, len(allowed))
	for _, name := range allowed {
		allowedSet[name] = struct{}{}
	}
	result := make([]string, 0, len(metrics))
	for _, metric := range metrics {
		normalized := NormalizeMetricName(metric)
		if normalized == "" {
			continue
		}
		if _, ok := allowedSet[normalized]; ok {
			result = append(result, normalized)
		}
	}
	return result
}

func shouldUseHourlyAggregate(start time.Time, end time.Time) bool {
	if end.Before(start) {
		return false
	}
	return end.Sub(start) >= 48*time.Hour
}

// latestSampleWindow 统计卡"最近一轮采集"的新鲜窗口（约 3 个默认采集周期）。
const latestSampleWindow = 15 * time.Minute

// countActiveAndOnlineDevices 统计活跃设备总数与在线数；deviceIDs 非空时限定范围。
func countActiveAndOnlineDevices(ctx context.Context, db *gorm.DB, deviceIDs []int) (int64, int64, error) {
	var total int64
	totalQuery := db.WithContext(ctx).
		Table("devices").
		Where("is_active = ?", true)
	if len(deviceIDs) > 0 {
		totalQuery = totalQuery.Where("id IN ?", deviceIDs)
	}
	if err := totalQuery.Count(&total).Error; err != nil {
		return 0, 0, err
	}

	var online int64
	onlineQuery := db.WithContext(ctx).
		Table("devices").
		Where("is_active = ? AND status = ?", true, "online")
	if len(deviceIDs) > 0 {
		onlineQuery = onlineQuery.Where("id IN ?", deviceIDs)
	}
	if err := onlineQuery.Count(&online).Error; err != nil {
		return 0, 0, err
	}

	return total, online, nil
}

// latestSampleAverageWithFallback 取"每台设备最近一次采集值的平均"；
// 新鲜窗口内无任何样本时回退到 devices 表快照平均。
func latestSampleAverageWithFallback(ctx context.Context, db *gorm.DB, metric string, deviceIDs []int) (float64, error) {
	value, samples, err := latestMetricAverage(ctx, db, metric, deviceIDs, latestSampleWindow)
	if err != nil {
		return 0, err
	}
	if samples == 0 {
		column := metric
		value, err = avgDeviceColumn(ctx, db, column, deviceIDs)
		if err != nil {
			return 0, err
		}
	}
	// 修正：如果值超过 100%，说明存储的是被放大 100 倍的错误历史数据
	if value > 100 {
		value = value / 100
	}
	return value, nil
}

// latestMetricAverage 对每台设备取窗口内最近一次采集值（DISTINCT ON），再求跨设备平均。
func latestMetricAverage(ctx context.Context, db *gorm.DB, metric string, deviceIDs []int, window time.Duration) (float64, int64, error) {
	sub := db.WithContext(ctx).
		Table("device_metrics").
		Select("DISTINCT ON (device_id) device_id, metric_value").
		Where("metric_name = ?", metric).
		Where("collected_at >= ?", time.Now().UTC().Add(-window)).
		Order("device_id, collected_at DESC")
	if len(deviceIDs) > 0 {
		sub = sub.Where("device_id IN ?", deviceIDs)
	}

	type avgRow struct {
		AvgValue    sql.NullFloat64 `gorm:"column:avg_value"`
		SampleCount int64           `gorm:"column:sample_count"`
	}
	var avg avgRow
	if err := db.WithContext(ctx).
		Table("(?) AS latest_samples", sub).
		Select("AVG(metric_value) AS avg_value, COUNT(*) AS sample_count").
		Scan(&avg).Error; err != nil {
		return 0, 0, err
	}
	if avg.AvgValue.Valid {
		return avg.AvgValue.Float64, avg.SampleCount, nil
	}
	return 0, avg.SampleCount, nil
}

func avgDeviceColumn(ctx context.Context, db *gorm.DB, column string, deviceIDs []int) (float64, error) {
	var avg sql.NullFloat64
	query := db.WithContext(ctx).
		Table("devices").
		Select(fmt.Sprintf("AVG(%s) AS avg_value", column)).
		Where("is_active = ?", true)
	if len(deviceIDs) > 0 {
		query = query.Where("id IN ?", deviceIDs)
	}
	if err := query.Scan(&avg).Error; err != nil {
		return 0, err
	}
	if avg.Valid {
		return avg.Float64, nil
	}
	return 0, nil
}

func avgNetworkMetric(ctx context.Context, db *gorm.DB) (float64, bool, error) {
	inbound := []string{"bandwidth_in", "network_bytes_in", "throughput_in"}
	outbound := []string{"bandwidth_out", "network_bytes_out", "throughput_out"}

	inboundValue, inboundCount, err := avgMetricList(ctx, db, inbound)
	if err != nil {
		return 0, false, err
	}
	outboundValue, outboundCount, err := avgMetricList(ctx, db, outbound)
	if err != nil {
		return 0, false, err
	}

	if inboundCount+outboundCount == 0 {
		fallbackValue, fallbackCount, err := avgMetricList(ctx, db, []string{"bandwidth_utilization"})
		if err != nil {
			return 0, false, err
		}
		if fallbackCount > 0 {
			// 采集端直出带宽利用率作为兜底值，后续可结合接口速率折算为真实带宽
			return fallbackValue, true, nil
		}
	}

	sum := inboundValue + outboundValue

	// 返回 bytes (bps / 8)，不再转换为 Mbps
	return bpsToBytes(sum), false, nil
}

// MaxReasonableBandwidthBps 最大合理带宽阈值：10 Gbps = 10,000,000,000 bps
// 超过此值的数据被视为异常数据（可能是历史错误数据）
const MaxReasonableBandwidthBps = 10_000_000_000

// peakNetworkMetric24h 查询24小时内的峰值网络流量（入站+出站的最大值）
// 返回值单位为 bps (bits per second，比特每秒)
// 会过滤掉超过 10 Gbps 的异常数据；deviceIDs 非空时仅统计所选设备
func peakNetworkMetric24h(ctx context.Context, db *gorm.DB, deviceIDs []int) (float64, bool, error) {
	inbound := []string{"bandwidth_in", "network_bytes_in", "throughput_in"}
	outbound := []string{"bandwidth_out", "network_bytes_out", "throughput_out"}
	allMetrics := append(append([]string{}, inbound...), outbound...)

	// 查询24小时内每个时间点的入站+出站总和的最大值
	type peakRow struct {
		PeakValue   sql.NullFloat64 `gorm:"column:peak_value"`
		SampleCount int64           `gorm:"column:sample_count"`
	}

	var peak peakRow

	deviceFilter := ""
	args := []interface{}{
		inbound, MaxReasonableBandwidthBps,
		outbound, MaxReasonableBandwidthBps,
		allMetrics,
		MaxReasonableBandwidthBps,
	}
	if len(deviceIDs) > 0 {
		deviceFilter = " AND device_id IN (?)"
		args = append(args, deviceIDs)
	}

	// 使用子查询：先按时间点聚合入站和出站流量，然后取最大值
	// 过滤掉超过 10 Gbps 的异常数据（可能是历史错误数据）
	query := fmt.Sprintf(`
		WITH time_buckets AS (
			SELECT
				time_bucket('5 minutes', collected_at) AS bucket,
				SUM(CASE WHEN metric_name IN (?) AND metric_value < ? THEN metric_value ELSE 0 END) AS inbound,
				SUM(CASE WHEN metric_name IN (?) AND metric_value < ? THEN metric_value ELSE 0 END) AS outbound
			FROM device_metrics
			WHERE metric_name IN (?)
			AND collected_at >= NOW() - INTERVAL '24 hours'
			AND metric_value < ?%s
			GROUP BY bucket
		)
		SELECT
			MAX(inbound + outbound) AS peak_value,
			COUNT(*) AS sample_count
		FROM time_buckets
		WHERE inbound + outbound > 0
	`, deviceFilter)

	if err := db.WithContext(ctx).Raw(query, args...).Scan(&peak).Error; err != nil {
		return 0, false, err
	}

	if peak.SampleCount == 0 || !peak.PeakValue.Valid {
		// 没有数据，尝试使用 bandwidth_utilization 作为兜底
		fallbackPeak, fallbackCount, err := maxMetricList24h(ctx, db, []string{"bandwidth_utilization"}, deviceIDs)
		if err != nil {
			return 0, false, err
		}
		if fallbackCount > 0 {
			return fallbackPeak, true, nil
		}
		return 0, false, nil
	}

	// 数据库中存储的带宽值是 bps，直接返回
	peakValue := peak.PeakValue.Float64

	return peakValue, true, nil
}

// maxMetricList24h 查询24小时内指定指标的最大值；deviceIDs 非空时仅统计所选设备
func maxMetricList24h(ctx context.Context, db *gorm.DB, metrics []string, deviceIDs []int) (float64, int64, error) {
	type maxRow struct {
		MaxValue    sql.NullFloat64 `gorm:"column:max_value"`
		SampleCount int64           `gorm:"column:sample_count"`
	}
	var max maxRow
	query := db.WithContext(ctx).
		Table("device_metrics").
		Select("MAX(metric_value) AS max_value, COUNT(*) AS sample_count").
		Where("metric_name IN ?", metrics).
		Where("collected_at >= NOW() - INTERVAL '24 hours'")
	if len(deviceIDs) > 0 {
		query = query.Where("device_id IN ?", deviceIDs)
	}
	if err := query.Scan(&max).Error; err != nil {
		return 0, 0, err
	}
	if max.MaxValue.Valid {
		return max.MaxValue.Float64, max.SampleCount, nil
	}
	return 0, max.SampleCount, nil
}

func avgMetricList(ctx context.Context, db *gorm.DB, metrics []string) (float64, int64, error) {
	type avgRow struct {
		AvgValue    sql.NullFloat64 `gorm:"column:avg_value"`
		SampleCount int64           `gorm:"column:sample_count"`
	}
	var avg avgRow
	if err := db.WithContext(ctx).
		Table("device_metrics").
		Select("AVG(metric_value) AS avg_value, COUNT(*) AS sample_count").
		Where("metric_name IN ?", metrics).
		Where("collected_at >= NOW() - INTERVAL '1 hour'").
		Scan(&avg).Error; err != nil {
		return 0, 0, err
	}
	if avg.AvgValue.Valid {
		return avg.AvgValue.Float64, avg.SampleCount, nil
	}
	return 0, avg.SampleCount, nil
}

func flattenSystemSeries(series map[time.Time]*SystemPerformancePoint) []SystemPerformancePoint {
	if len(series) == 0 {
		return []SystemPerformancePoint{}
	}

	keys := make([]time.Time, 0, len(series))
	for ts := range series {
		keys = append(keys, ts)
	}
	sort.Slice(keys, func(i, j int) bool {
		return keys[i].Before(keys[j])
	})

	result := make([]SystemPerformancePoint, 0, len(keys))
	for _, ts := range keys {
		point := series[ts]
		if point == nil {
			continue
		}
		result = append(result, *point)
	}
	return result
}

func (w *MetricsWriter) lookupDeviceNames(ctx context.Context, rows []temperatureRow) (map[int]string, error) {
	deviceIDs := make([]int, 0)
	seen := make(map[int]struct{})
	for _, row := range rows {
		if _, ok := seen[row.DeviceID]; ok {
			continue
		}
		seen[row.DeviceID] = struct{}{}
		deviceIDs = append(deviceIDs, row.DeviceID)
	}

	if len(deviceIDs) == 0 {
		return map[int]string{}, nil
	}

	type deviceNameRow struct {
		ID   int    `gorm:"column:id"`
		Name string `gorm:"column:name"`
	}

	nameRows := make([]deviceNameRow, 0)
	if err := w.db.WithContext(ctx).
		Table("devices").
		Select("id, name").
		Where("id IN ?", deviceIDs).
		Scan(&nameRows).Error; err != nil {
		return nil, err
	}

	names := make(map[int]string, len(nameRows))
	for _, row := range nameRows {
		names[row.ID] = row.Name
	}
	return names, nil
}

func flattenTemperatureSeries(points map[time.Time]map[string]float64) []TemperatureHistoryPoint {
	if len(points) == 0 {
		return []TemperatureHistoryPoint{}
	}

	keys := make([]time.Time, 0, len(points))
	for ts := range points {
		keys = append(keys, ts)
	}
	sort.Slice(keys, func(i, j int) bool {
		return keys[i].Before(keys[j])
	})

	result := make([]TemperatureHistoryPoint, 0, len(keys))
	for _, ts := range keys {
		devices := points[ts]
		if devices == nil {
			continue
		}
		result = append(result, TemperatureHistoryPoint{
			Timestamp: ts.UTC().Format(time.RFC3339Nano),
			Devices:   devices,
		})
	}

	return result
}

func formatMetricList(metrics []string) string {
	if len(metrics) == 0 {
		return "''"
	}
	escaped := make([]string, 0, len(metrics))
	for _, metric := range metrics {
		escaped = append(escaped, fmt.Sprintf("'%s'", strings.ReplaceAll(metric, "'", "''")))
	}
	return strings.Join(escaped, ",")
}

func roundFloat(value float64, precision int) float64 {
	pow := math.Pow(10, float64(precision))
	return math.Round(value*pow) / pow
}

func mergeSeries(a map[time.Time]float64, b map[time.Time]float64) map[time.Time]float64 {
	if len(a) == 0 && len(b) == 0 {
		return map[time.Time]float64{}
	}

	result := make(map[time.Time]float64)
	for ts, value := range a {
		result[ts] = value
	}
	for ts, value := range b {
		result[ts] = result[ts] + value
	}
	return result
}
