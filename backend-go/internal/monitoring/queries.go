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

	"github.com/your-org/inspect-system/backend-go/internal/devices"
)

type temperatureRow struct {
	Bucket   time.Time `gorm:"column:bucket"`
	DeviceID int       `gorm:"column:device_id"`
	Value    *float64  `gorm:"column:value"`
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
		ID          int        `gorm:"column:id"`
		Name        string     `gorm:"column:name"`
		IPAddress   string     `gorm:"column:ip_address"`
		Status      string     `gorm:"column:status"`
		IsMonitored bool       `gorm:"column:is_monitored"`
		LastSeen    *time.Time `gorm:"column:last_seen"`
	}

	rows := make([]deviceRow, 0)
	if err := w.db.WithContext(ctx).
		Table("devices").
		Select("id, name, ip_address, status, is_monitored, last_seen").
		Where("is_active = ?", true).
		Order("id ASC").
		Scan(&rows).Error; err != nil {
		return nil, err
	}

	result := make([]MonitoringDevice, 0, len(rows))
	for _, row := range rows {
		result = append(result, MonitoringDevice{
			ID:          row.ID,
			Name:        row.Name,
			IPAddress:   row.IPAddress,
			Status:      row.Status,
			IsMonitored: row.IsMonitored,
			LastSeen:    row.LastSeen,
		})
	}

	return result, nil
}

// SetDeviceMonitoring 切换设备的告警开关（is_monitored）：false 时告警评估器跳过该设备，采集不受影响。
func (w *MetricsWriter) SetDeviceMonitoring(ctx context.Context, deviceID int, enabled bool) error {
	if w.db == nil {
		return fmt.Errorf("database not initialized")
	}

	result := w.db.WithContext(ctx).Table("devices").Where("id = ?", deviceID).Update("is_monitored", enabled)
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

// GetMonitoringStats 返回监控中心统计卡数据；deviceIDs 非空时仅统计所选设备。
// CPU/内存口径为"最近一轮采集"：取每台设备新鲜窗口内最近一次采集值再求跨设备平均，
// 无新鲜样本时回退 devices 表快照平均（避免采集暂停时卡片清零）。
// 上/下行为 24 小时分向峰值（bps），与总览页共用 PeakNetworkMetrics24h 口径。
func (w *MetricsWriter) GetMonitoringStats(ctx context.Context, deviceIDs []int) (MonitoringStats, error) {
	if w.db == nil {
		return MonitoringStats{}, fmt.Errorf("database not initialized")
	}

	var total int64
	totalQuery := w.db.WithContext(ctx).
		Table("devices").
		Where("is_active = ?", true)
	if len(deviceIDs) > 0 {
		totalQuery = totalQuery.Where("id IN ?", deviceIDs)
	}
	if err := totalQuery.Count(&total).Error; err != nil {
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

	// 查询24小时内的分向峰值网络流量（bps），统一走共享峰值查询
	peakSnapshot, err := PeakNetworkMetrics24h(ctx, w.db, deviceIDs)
	if err != nil {
		return MonitoringStats{}, err
	}

	// devices 表中的 cpu_usage 和 memory_usage 已经是百分比格式（0-100）
	// 不需要再乘以 100

	return MonitoringStats{
		TotalDevices: int(total),
		ActiveAlerts: int(activeAlerts),
		AvgCPU:       roundFloat(avgCPU, 1),
		AvgMemory:    roundFloat(avgMemory, 1),
		PeakOutbound: roundFloat(peakSnapshot.Outbound, 1),
		PeakInbound:  roundFloat(peakSnapshot.Inbound, 1),
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
			Table("device_metrics").
			Select("time_bucket('1 hour', collected_at) AS bucket, device_id, metric_name, AVG(metric_value) AS metric_value").
			Where("collected_at >= ? AND collected_at <= ?", start, end).
			Where("device_id IN ?", deviceIDs)
		if len(metricNames) > 0 {
			query = query.Where("metric_name IN ?", metricNames)
		}
		if err := query.
			Group("bucket, device_id, metric_name").
			Order("bucket ASC").
			Scan(&rows).Error; err != nil {
			return nil, err
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

// GetTemperatureHistory 查询按设备区分的温度时序；deviceIDs 非空时仅返回所选设备。
// interval <= 0（AutoBucket）时按时间范围分档；监控中心页传 DashboardSampleInterval 固定 5 分钟。
func (w *MetricsWriter) GetTemperatureHistory(ctx context.Context, start time.Time, end time.Time, deviceIDs []int, interval time.Duration) ([]TemperatureHistoryPoint, error) {
	if w.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	bucket := resolveBucket(start, end, interval)

	// 尝试从缓存获取（桶宽进键，避免同一 (start,end,devices) 上不同粒度互相串数据）
	if w.cache != nil {
		if cached, found := w.cache.GetTemperature(ctx, start, end, deviceIDs, bucket); found {
			return cached, nil
		}
	}

	deviceFilter := ""
	if len(deviceIDs) > 0 {
		deviceFilter = " AND device_id IN (?)"
	}

	rows := make([]temperatureRow, 0)
	query := fmt.Sprintf(
		"SELECT time_bucket('%s', collected_at) AS bucket, device_id, AVG(metric_value) AS value FROM device_metrics WHERE metric_name = ? AND collected_at >= ? AND collected_at <= ?%s GROUP BY bucket, device_id ORDER BY bucket ASC",
		bucketIntervalString(bucket),
		deviceFilter,
	)
	args := []interface{}{"temperature", start, end}
	if len(deviceIDs) > 0 {
		args = append(args, deviceIDs)
	}
	if err := w.db.WithContext(ctx).Raw(query, args...).Scan(&rows).Error; err != nil {
		return nil, err
	}

	if len(rows) == 0 {
		return []TemperatureHistoryPoint{}, nil
	}

	rowDeviceIDs := make([]int, 0, len(rows))
	for _, row := range rows {
		rowDeviceIDs = append(rowDeviceIDs, row.DeviceID)
	}
	deviceNames, err := w.lookupDeviceNames(ctx, uniqueDeviceIDs(rowDeviceIDs))
	if err != nil {
		return nil, err
	}

	points := make(map[time.Time]map[string]float64)
	for _, row := range rows {
		if row.Value == nil {
			continue
		}
		name, ok := deviceNames[row.DeviceID]
		if !ok {
			// 设备已删除（删设备到采集器刷新设备列表之间写入的残留样本），不画幽灵曲线
			continue
		}
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
		w.cache.SetTemperature(ctx, start, end, deviceIDs, bucket, result)
	}

	return result, nil
}

// devicePerformanceMetrics 是按设备性能趋势固定采集的两项指标（网络不再纳入该图）。
var devicePerformanceMetrics = []string{"cpu_usage", "memory_usage"}

type devicePerformanceRow struct {
	Bucket     time.Time `gorm:"column:bucket"`
	DeviceID   int       `gorm:"column:device_id"`
	MetricName string    `gorm:"column:metric_name"`
	Value      *float64  `gorm:"column:value"`
}

// GetDevicePerformanceHistory 查询按设备区分的 CPU/内存趋势；deviceIDs 非空时仅返回所选设备。
// 故意不回退主机级 system_metrics：按设备视图无处挂载。
// interval <= 0（AutoBucket）时按时间范围分档；监控中心页传 DashboardSampleInterval 固定 5 分钟。
func (w *MetricsWriter) GetDevicePerformanceHistory(ctx context.Context, start time.Time, end time.Time, deviceIDs []int, interval time.Duration) ([]DevicePerformancePoint, error) {
	if w.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	bucket := resolveBucket(start, end, interval)

	// 桶宽进键，避免同一 (start,end,devices) 上不同粒度互相串数据
	if w.cache != nil {
		if cached, found := w.cache.GetDevicePerformance(ctx, start, end, deviceIDs, bucket); found {
			return cached, nil
		}
	}

	deviceFilter := ""
	if len(deviceIDs) > 0 {
		deviceFilter = " AND device_id IN (?)"
	}
	query := fmt.Sprintf(
		"SELECT time_bucket('%s', collected_at) AS bucket, device_id, metric_name, AVG(metric_value) AS value FROM device_metrics WHERE metric_name IN (?) AND collected_at >= ? AND collected_at <= ?%s GROUP BY bucket, device_id, metric_name ORDER BY bucket ASC",
		bucketIntervalString(bucket),
		deviceFilter,
	)
	args := []interface{}{devicePerformanceMetrics, start, end}
	if len(deviceIDs) > 0 {
		args = append(args, deviceIDs)
	}

	rows := make([]devicePerformanceRow, 0)
	if err := w.db.WithContext(ctx).Raw(query, args...).Scan(&rows).Error; err != nil {
		return nil, err
	}

	if len(rows) == 0 {
		return []DevicePerformancePoint{}, nil
	}

	rowDeviceIDs := make([]int, 0, len(rows))
	for _, row := range rows {
		rowDeviceIDs = append(rowDeviceIDs, row.DeviceID)
	}
	deviceNames, err := w.lookupDeviceNames(ctx, uniqueDeviceIDs(rowDeviceIDs))
	if err != nil {
		return nil, err
	}

	points := make(map[time.Time]map[string]DevicePerformanceValue)
	for _, row := range rows {
		if row.Value == nil {
			continue
		}
		name, ok := deviceNames[row.DeviceID]
		if !ok {
			// 设备已删除（删设备到采集器刷新设备列表之间写入的残留样本），不画幽灵曲线
			continue
		}
		if name == "" {
			name = fmt.Sprintf("device_%d", row.DeviceID)
		}
		bucket := row.Bucket.UTC()
		if points[bucket] == nil {
			points[bucket] = make(map[string]DevicePerformanceValue)
		}
		value := points[bucket][name]
		switch row.MetricName {
		case "cpu_usage":
			value.CPU = *row.Value
		case "memory_usage":
			value.Memory = *row.Value
		}
		points[bucket][name] = value
	}

	result := flattenDevicePerformanceSeries(points)

	if w.cache != nil {
		w.cache.SetDevicePerformance(ctx, start, end, deviceIDs, bucket, result)
	}

	return result, nil
}

// aggregateTrafficQuery 生成多设备聚合流量 SQL（参数顺序：start, end[, deviceIDs]）。
// 只读 device_metrics：设备级 bandwidth_* 已是采集器按接口累加的结果，再并上
// interface_metrics 会 ×2。同一（桶, 设备）内多个样本取 AVG——速率是瞬时量，采集周期
// 与桶宽不对齐时 SUM 会把双样本桶放大一倍形成锯齿；跨设备再 SUM 得总吞吐。
func aggregateTrafficQuery(interval string, deviceFilter string) string {
	return fmt.Sprintf(
		`SELECT bucket, SUM(inbound) AS inbound, SUM(outbound) AS outbound FROM (`+
			`SELECT time_bucket('%s', collected_at) AS bucket, device_id, `+
			`AVG(CASE WHEN metric_name IN (%s) THEN metric_value END) AS inbound, `+
			`AVG(CASE WHEN metric_name IN (%s) THEN metric_value END) AS outbound `+
			`FROM device_metrics WHERE collected_at >= ? AND collected_at <= ? AND metric_name IN (%s)%s `+
			`GROUP BY bucket, device_id) AS per_device GROUP BY bucket ORDER BY bucket ASC`,
		interval,
		formatMetricList(networkInboundMetricNames),
		formatMetricList(networkOutboundMetricNames),
		formatMetricList(networkAllMetricNames()),
		deviceFilter,
	)
}

// GetNetworkTrafficHistory 查询网络流量时序；deviceIDs 非空时仅聚合所选设备。
// interval <= 0（AutoBucket）时按时间范围分档；监控中心页传 DashboardSampleInterval 固定 5 分钟。
func (w *MetricsWriter) GetNetworkTrafficHistory(ctx context.Context, start time.Time, end time.Time, deviceIDs []int, interval time.Duration) ([]NetworkTrafficPoint, error) {
	if w.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	bucket := resolveBucket(start, end, interval)

	// 尝试从缓存获取（桶宽进键，避免同一 (start,end,devices) 上不同粒度互相串数据）
	if w.cache != nil {
		if cached, found := w.cache.GetNetworkTraffic(ctx, start, end, deviceIDs, bucket); found {
			return cached, nil
		}
	}

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
	query := aggregateTrafficQuery(bucketIntervalString(bucket), deviceFilter)
	args := []interface{}{start, end}
	if len(deviceIDs) > 0 {
		args = append(args, deviceIDs)
	}
	if err := w.db.WithContext(ctx).Raw(query, args...).Scan(&rows).Error; err != nil {
		return nil, err
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
		w.cache.SetNetworkTraffic(ctx, start, end, deviceIDs, bucket, points)
	}

	return points, nil
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

// DashboardSampleInterval 是监控中心页统一的采样间隔（5 分钟）。
// 页面所有时间档位（1h/3h/6h/12h/24h/3d/7d/14d）都按它分桶，使各档位点位密度一致、
// 曲线可直接横向比对；它与采集任务的节奏（scheduler.MetricsCollectionInterval，cron */5）
// 相等，每个桶恰好覆盖一次采集，桶内不会出现 1~2 个样本的忽多忽少。
// 长时段的其他消费者（报告导出、流量分析）用 AutoBucket 按点数预算分档，
// 避免数据量与 PDF/CSV 渲染成本随范围线性膨胀。
const DashboardSampleInterval = 5 * time.Minute

// AutoBucket 表示「按时间范围自动分档」，桶宽交给 bucketSizeForRange（0 值语义）。
const AutoBucket time.Duration = 0

// autoBucketMaxPoints 是 AutoBucket 单条序列的点数预算：14 天 PDF 原本就画 336 点且渲染正常，
// 以此为上限保证任何档位的报告都不比现状更密。
const autoBucketMaxPoints = 360

// autoBucketLadder 是 AutoBucket 可选的桶宽阶梯，全部是 DashboardSampleInterval 的整数倍，
// 使每个桶恰好包含整数个采集样本（7、8 分钟这类非整倍数桶会让桶内样本数在 1~2 之间交替）。
var autoBucketLadder = []time.Duration{
	5 * time.Minute,
	10 * time.Minute,
	15 * time.Minute,
	30 * time.Minute,
	time.Hour,
	3 * time.Hour,
	6 * time.Hour,
	12 * time.Hour,
	24 * time.Hour,
}

// resolveBucket 解析调用方指定的采样间隔：<= 0（AutoBucket）时回退为按范围分档。
func resolveBucket(start, end time.Time, interval time.Duration) time.Duration {
	if interval > 0 {
		return interval
	}
	return bucketSizeForRange(start, end)
}

// bucketSizeForRange 从阶梯中取「点数不超过预算」的最小桶宽；返回值原样进入 time_bucket，
// 不再有另一层封顶，声明与实际由构造保证一致。超出最大桶宽仍放不下时返回最大桶宽。
func bucketSizeForRange(start time.Time, end time.Time) time.Duration {
	span := end.Sub(start)
	for _, bucket := range autoBucketLadder {
		if span <= bucket*autoBucketMaxPoints {
			return bucket
		}
	}
	return autoBucketLadder[len(autoBucketLadder)-1]
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

func shouldUseHourlyAggregate(start time.Time, end time.Time) bool {
	if end.Before(start) {
		return false
	}
	return end.Sub(start) >= 48*time.Hour
}

// latestSampleWindow 统计卡"最近一轮采集"的新鲜窗口：15 分钟 ≈ 3 个采集周期（5 分钟一轮），
// 允许连续缺采约 2 轮仍能取到"最近一次采集值"。
const latestSampleWindow = 15 * time.Minute

// LatestMetricAverageWithFallback 导出"最近一轮采集均值"口径查询，供总览等模块复用：
// 每台设备新鲜窗口内最近一次采集值求跨设备平均，窗口内无样本时回退 devices 表快照平均。
func LatestMetricAverageWithFallback(ctx context.Context, db *gorm.DB, metric string, deviceIDs []int) (float64, error) {
	return latestSampleAverageWithFallback(ctx, db, metric, deviceIDs)
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

// MaxReasonableBandwidthBps 最大合理带宽阈值：10 Gbps。
// 权威定义在 devices 包（采集端拒绝异常速率），此处转发导出供查询端
// 过滤历史脏数据及 dashboard 等消费方引用，避免多包各自钉死数值。
const MaxReasonableBandwidthBps = devices.MaxReasonableBandwidthBps

// PeakNetworkSnapshot 24小时峰值流量快照（单位 bps）
type PeakNetworkSnapshot struct {
	Inbound  float64 // 下行(入站)5分钟桶峰值
	Outbound float64 // 上行(出站)5分钟桶峰值
	Combined float64 // 入站+出站合并桶峰值（监控中心统计卡口径）
	HasData  bool    // 24小时窗口内是否存在有效带宽采样
}

// PeakNetworkMetrics24h 查询24小时内的峰值网络流量，一次产出分向与合并口径，
// 总览（上/下行卡）与监控中心（峰值流量卡）共用，调整桶宽/异常阈值只改此处。
// 返回值单位为 bps；会过滤掉超过 10 Gbps 的异常数据；deviceIDs 非空时仅统计所选设备。
func PeakNetworkMetrics24h(ctx context.Context, db *gorm.DB, deviceIDs []int) (PeakNetworkSnapshot, error) {
	if db == nil {
		return PeakNetworkSnapshot{}, fmt.Errorf("database not initialized")
	}

	inbound := []string{"bandwidth_in", "network_bytes_in", "throughput_in"}
	outbound := []string{"bandwidth_out", "network_bytes_out", "throughput_out"}
	allMetrics := append(append([]string{}, inbound...), outbound...)

	type peakRow struct {
		PeakInbound  sql.NullFloat64 `gorm:"column:peak_inbound"`
		PeakOutbound sql.NullFloat64 `gorm:"column:peak_outbound"`
		PeakCombined sql.NullFloat64 `gorm:"column:peak_combined"`
		SampleCount  int64           `gorm:"column:sample_count"`
	}

	var peak peakRow

	deviceFilter := ""
	args := []interface{}{
		inbound,
		outbound,
		allMetrics,
		MaxReasonableBandwidthBps,
	}
	if len(deviceIDs) > 0 {
		deviceFilter = " AND device_id IN (?)"
		args = append(args, deviceIDs)
	}

	// 先按（5 分钟桶, 设备）取速率均值（桶内多样本 SUM 会成倍放大），再跨设备 SUM，
	// 最后取各口径的桶峰值。过滤掉超过 10 Gbps 的异常数据（可能是历史错误数据）。
	query := fmt.Sprintf(`
		WITH per_device AS (
			SELECT
				time_bucket('5 minutes', collected_at) AS bucket,
				device_id,
				AVG(CASE WHEN metric_name IN (?) THEN metric_value END) AS inbound,
				AVG(CASE WHEN metric_name IN (?) THEN metric_value END) AS outbound
			FROM device_metrics
			WHERE metric_name IN (?)
			AND collected_at >= NOW() - INTERVAL '24 hours'
			AND metric_value < ?%s
			GROUP BY bucket, device_id
		),
		time_buckets AS (
			SELECT bucket, SUM(inbound) AS inbound, SUM(outbound) AS outbound FROM per_device GROUP BY bucket
		)
		SELECT
			MAX(inbound) AS peak_inbound,
			MAX(outbound) AS peak_outbound,
			MAX(COALESCE(inbound, 0) + COALESCE(outbound, 0)) AS peak_combined,
			COUNT(*) AS sample_count
		FROM time_buckets
		WHERE COALESCE(inbound, 0) + COALESCE(outbound, 0) > 0
	`, deviceFilter)

	if err := db.WithContext(ctx).Raw(query, args...).Scan(&peak).Error; err != nil {
		return PeakNetworkSnapshot{}, err
	}

	if peak.SampleCount == 0 {
		return PeakNetworkSnapshot{}, nil
	}

	snapshot := PeakNetworkSnapshot{HasData: true}
	if peak.PeakInbound.Valid {
		snapshot.Inbound = peak.PeakInbound.Float64
	}
	if peak.PeakOutbound.Valid {
		snapshot.Outbound = peak.PeakOutbound.Float64
	}
	if peak.PeakCombined.Valid {
		snapshot.Combined = peak.PeakCombined.Float64
	}
	return snapshot, nil
}

// lookupDeviceNames 返回设备 ID → 展示名。devices.name 无唯一约束，重名设备若以名字作字典键
// 会互相覆盖，因此对全表同名的设备追加唯一的 IP 作区分（"核心交换机 (10.0.0.2)"）。
// 按全表而非本次结果集判重，保证同一设备的标签不随时间范围/筛选跳变。
func (w *MetricsWriter) lookupDeviceNames(ctx context.Context, deviceIDs []int) (map[int]string, error) {
	if len(deviceIDs) == 0 {
		return map[int]string{}, nil
	}

	type deviceLabelRow struct {
		ID        int    `gorm:"column:id"`
		Name      string `gorm:"column:name"`
		IPAddress string `gorm:"column:ip_address"`
		NameCount int    `gorm:"column:name_count"`
	}

	rows := make([]deviceLabelRow, 0, len(deviceIDs))
	query := `SELECT d.id, d.name, d.ip_address, COALESCE(c.name_count, 1) AS name_count
FROM devices d
LEFT JOIN (SELECT name, COUNT(*) AS name_count FROM devices GROUP BY name) c ON c.name = d.name
WHERE d.id IN (?)`
	if err := w.db.WithContext(ctx).Raw(query, deviceIDs).Scan(&rows).Error; err != nil {
		return nil, err
	}

	names := make(map[int]string, len(rows))
	for _, row := range rows {
		if row.Name != "" && row.NameCount > 1 && row.IPAddress != "" {
			names[row.ID] = fmt.Sprintf("%s (%s)", row.Name, row.IPAddress)
			continue
		}
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

func flattenDevicePerformanceSeries(points map[time.Time]map[string]DevicePerformanceValue) []DevicePerformancePoint {
	if len(points) == 0 {
		return []DevicePerformancePoint{}
	}

	keys := make([]time.Time, 0, len(points))
	for ts := range points {
		keys = append(keys, ts)
	}
	sort.Slice(keys, func(i, j int) bool {
		return keys[i].Before(keys[j])
	})

	result := make([]DevicePerformancePoint, 0, len(keys))
	for _, ts := range keys {
		devices := points[ts]
		if devices == nil {
			continue
		}
		result = append(result, DevicePerformancePoint{
			Timestamp: ts.UTC().Format(time.RFC3339Nano),
			Devices:   devices,
		})
	}

	return result
}

// uniqueDeviceIDs 按首次出现顺序去重，供设备名查询使用。
func uniqueDeviceIDs(ids []int) []int {
	seen := make(map[int]struct{}, len(ids))
	out := make([]int, 0, len(ids))
	for _, id := range ids {
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	return out
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
