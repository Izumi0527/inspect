package dashboard

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/alerts"
	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
	"github.com/your-org/inspect-system/backend-go/internal/scheduler"
)

type Service struct {
	db         *gorm.DB
	alerts     *alerts.Service
	monitoring *monitoring.MetricsWriter
	scheduler  *scheduler.Service
	redis      *redis.Client
	logger     *zap.Logger
	startedAt  time.Time
}

func NewService(
	db *gorm.DB,
	alertsService *alerts.Service,
	monitoringWriter *monitoring.MetricsWriter,
	schedulerService *scheduler.Service,
	redisClient *redis.Client,
	logger *zap.Logger,
) *Service {
	return &Service{
		db:         db,
		alerts:     alertsService,
		monitoring: monitoringWriter,
		scheduler:  schedulerService,
		redis:      redisClient,
		logger:     logger,
		startedAt:  time.Now().UTC(),
	}
}

func (s *Service) GetOverview(ctx context.Context) (OverviewResponse, error) {
	if s == nil || s.db == nil {
		return OverviewResponse{}, fmt.Errorf("database not initialized")
	}

	deviceStats, err := s.getDeviceStatusSummary(ctx)
	if err != nil {
		return OverviewResponse{}, err
	}

	alertStats, err := s.getAlertSummary(ctx)
	if err != nil {
		return OverviewResponse{}, err
	}

	// 查询24小时内的峰值网络流量（bps）
	peakNetwork, hasNetwork, err := s.queryPeakNetworkMetric24h(ctx)
	if err != nil {
		return OverviewResponse{}, err
	}

	systemHealth := 0.0
	if deviceStats.Total > 0 {
		systemHealth = float64(deviceStats.Online) / float64(deviceStats.Total) * 100
	}

	bpsUnit := "bps"
	stats := []StatCard{
		{
			Title:     "在线设备",
			Value:     fmt.Sprintf("%d", deviceStats.Online),
			Change:    "较昨日",
			IconName:  "Monitor",
			IconColor: "text-green-500",
			Color:     "green",
		},
		{
			Title:     "活跃告警",
			Value:     fmt.Sprintf("%d", alertStats.Unacknowledged),
			Change:    "较昨日",
			IconName:  "AlertTriangle",
			IconColor: "text-red-500",
			Color:     "red",
		},
		{
			Title:     "峰值流量",
			Value:     formatNetworkValueBps(peakNetwork, hasNetwork),
			Change:    "较昨日",
			IconName:  "Activity",
			IconColor: "text-blue-500",
			Color:     "blue",
			Unit:      &bpsUnit, // 标识此值单位为 bps，需要前端格式化
		},
		{
			Title:     "系统负载",
			Value:     formatPercent(systemHealth, 1),
			Change:    "较昨日",
			IconName:  "Server",
			IconColor: "text-purple-500",
			Color:     "purple",
		},
	}

	recentAlerts, err := s.getRecentAlerts(ctx, 5)
	if err != nil {
		return OverviewResponse{}, err
	}

	networkOverview, err := s.getNetworkOverview(ctx)
	if err != nil {
		return OverviewResponse{}, err
	}

	return OverviewResponse{
		Stats:           stats,
		RecentAlerts:    recentAlerts,
		NetworkOverview: networkOverview,
		LastUpdated:     time.Now().UTC(),
	}, nil
}

func (s *Service) GetDeviceStatusSummary(ctx context.Context) (DeviceStatusSummary, error) {
	return s.getDeviceStatusSummary(ctx)
}

func (s *Service) GetAlertSummary(ctx context.Context) (AlertSummary, error) {
	return s.getAlertSummary(ctx)
}

func (s *Service) GetRecentAlerts(ctx context.Context, limit int) ([]RecentAlert, error) {
	return s.getRecentAlerts(ctx, limit)
}

func (s *Service) GetNetworkOverview(ctx context.Context) ([]NetworkOverviewItem, error) {
	return s.getNetworkOverview(ctx)
}

func (s *Service) GetBandwidthStats(ctx context.Context) (BandwidthStats, error) {
	if s == nil || s.db == nil {
		return BandwidthStats{}, fmt.Errorf("database not initialized")
	}

	// 查询平均入站带宽（单位：bps）
	inboundRate, _, err := s.avgMetricList(ctx, []string{"bandwidth_in", "network_bytes_in", "throughput_in"})
	if err != nil {
		return BandwidthStats{}, err
	}

	// 查询平均出站带宽（单位：bps）
	outboundRate, _, err := s.avgMetricList(ctx, []string{"bandwidth_out", "network_bytes_out", "throughput_out"})
	if err != nil {
		return BandwidthStats{}, err
	}

	return BandwidthStats{
		InboundRate:  inboundRate,
		OutboundRate: outboundRate,
		Unit:         "bps",
	}, nil
}

func (s *Service) GetRecentActivities(ctx context.Context, limit int) ([]RecentActivity, error) {
	// 当前无活动日志采集，保持与 Python 版本一致返回空列表。
	_ = ctx
	_ = limit
	return []RecentActivity{}, nil
}

func (s *Service) GetSystemStatus(ctx context.Context) (SystemStatus, error) {
	if s == nil || s.db == nil {
		return SystemStatus{}, fmt.Errorf("database not initialized")
	}

	monitoringRunning := false
	metricsStoreConnected := false
	if s.monitoring != nil {
		stats, err := s.monitoring.GetMonitoringServiceStats(ctx)
		if err == nil {
			monitoringRunning = stats.IsRunning
			metricsStoreConnected = stats.MetricsStoreConnected
		}
	}

	schedulerRunning := false
	if s.scheduler != nil {
		stats, err := s.scheduler.GetStats(ctx)
		if err == nil {
			schedulerRunning = stats.IsRunning
		}
	}

	redisConnected := false
	if s.redis != nil {
		if err := s.redis.Ping(ctx).Err(); err == nil {
			redisConnected = true
		}
	}

	dbConnected := s.db.WithContext(ctx).Raw("SELECT 1").Error == nil

	uptime := int64(time.Since(s.startedAt).Seconds())
	if uptime < 0 {
		uptime = 0
	}

	return SystemStatus{
		MonitoringService: monitoringRunning,
		AlertEngine:       s.alerts != nil,
		SchedulerService:  schedulerRunning,
		MetricsStoreConnected: metricsStoreConnected,
		RedisConnected:    redisConnected,
		DatabaseConnected: dbConnected,
		UptimeSeconds:     uptime,
		LastCheck:         time.Now().UTC(),
	}, nil
}

func (s *Service) GetTopDevicesByAlerts(ctx context.Context, limit int) ([]TopDevicesByAlerts, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	if limit <= 0 {
		limit = 5
	}

	type row struct {
		DeviceID      int     `gorm:"column:device_id"`
		DeviceName    *string `gorm:"column:device_name"`
		IPAddress     *string `gorm:"column:ip_address"`
		AlertCount    int     `gorm:"column:alert_count"`
		CriticalCount int     `gorm:"column:critical_count"`
	}

	rows := make([]row, 0)
	err := s.db.WithContext(ctx).
		Table("alerts AS a").
		Select(`a.device_id,
            d.name AS device_name,
            d.ip_address AS ip_address,
            COUNT(*) AS alert_count,
            SUM(CASE WHEN a.severity = 'critical' THEN 1 ELSE 0 END) AS critical_count`).
		Joins("LEFT JOIN devices d ON d.id = a.device_id").
		Group("a.device_id, d.name, d.ip_address").
		Order("alert_count DESC").
		Limit(limit).
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}

	response := make([]TopDevicesByAlerts, 0, len(rows))
	for _, item := range rows {
		name := "未知设备"
		if item.DeviceName != nil && strings.TrimSpace(*item.DeviceName) != "" {
			name = strings.TrimSpace(*item.DeviceName)
		}
		ip := ""
		if item.IPAddress != nil {
			ip = strings.TrimSpace(*item.IPAddress)
		}
		response = append(response, TopDevicesByAlerts{
			DeviceID:      item.DeviceID,
			DeviceName:    name,
			IPAddress:     ip,
			AlertCount:    item.AlertCount,
			CriticalCount: item.CriticalCount,
		})
	}

	return response, nil
}

func (s *Service) getDeviceStatusSummary(ctx context.Context) (DeviceStatusSummary, error) {
	type row struct {
		Status string `gorm:"column:status"`
		Count  int    `gorm:"column:count"`
	}

	rows := make([]row, 0)
	if err := s.db.WithContext(ctx).
		Table("devices").
		Select("status, COUNT(*) AS count").
		Group("status").
		Scan(&rows).Error; err != nil {
		return DeviceStatusSummary{}, err
	}

	summary := DeviceStatusSummary{}
	for _, item := range rows {
		switch strings.ToLower(strings.TrimSpace(item.Status)) {
		case "online":
			summary.Online += item.Count
		case "offline":
			summary.Offline += item.Count
		default:
			summary.Unknown += item.Count
		}
		summary.Total += item.Count
	}

	return summary, nil
}

func (s *Service) getAlertSummary(ctx context.Context) (AlertSummary, error) {
	if s.alerts != nil {
		stats, err := s.alerts.GetAlertStatistics(ctx)
		if err == nil {
			return AlertSummary{
				Critical:       stats.Critical,
				Warning:        stats.Warning,
				Info:           stats.Info,
				Total:          stats.Total,
				Unacknowledged: stats.Active,
			}, nil
		}
	}

	type row struct {
		Severity string `gorm:"column:severity"`
		Count    int    `gorm:"column:count"`
	}

	rows := make([]row, 0)
	if err := s.db.WithContext(ctx).
		Table("alerts").
		Select("severity, COUNT(*) AS count").
		Group("severity").
		Scan(&rows).Error; err != nil {
		return AlertSummary{}, err
	}

	summary := AlertSummary{}
	for _, item := range rows {
		switch strings.ToLower(strings.TrimSpace(item.Severity)) {
		case "critical":
			summary.Critical += item.Count
		case "warning":
			summary.Warning += item.Count
		case "info":
			summary.Info += item.Count
		}
		summary.Total += item.Count
	}

	var active int64
	if err := s.db.WithContext(ctx).
		Table("alerts").
		Where("status IN ?", []string{"open", "acknowledged"}).
		Count(&active).Error; err == nil {
		summary.Unacknowledged = int(active)
	}

	return summary, nil
}

func (s *Service) getRecentAlerts(ctx context.Context, limit int) ([]RecentAlert, error) {
	if s.alerts != nil {
		rows, err := s.alerts.GetRecentAlerts(ctx, limit)
		if err == nil {
			return buildRecentAlerts(rows), nil
		}
	}

	type row struct {
		ID        int     `gorm:"column:id"`
		Message   string  `gorm:"column:message"`
		Severity  string  `gorm:"column:severity"`
		CreatedAt time.Time `gorm:"column:created_at"`
		DeviceName *string `gorm:"column:device_name"`
		Category  *string `gorm:"column:category"`
	}

	rows := make([]row, 0)
	err := s.db.WithContext(ctx).
		Table("alerts AS a").
		Select("a.id, a.message, a.severity, a.created_at, a.category, d.name AS device_name").
		Joins("LEFT JOIN devices d ON d.id = a.device_id").
		Order("a.created_at desc").
		Limit(limit).
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}

	response := make([]RecentAlert, 0, len(rows))
	for _, item := range rows {
		deviceName := "未知设备"
		if item.DeviceName != nil && strings.TrimSpace(*item.DeviceName) != "" {
			deviceName = strings.TrimSpace(*item.DeviceName)
		}
		response = append(response, RecentAlert{
			ID:       item.ID,
			Device:   deviceName,
			Message:  item.Message,
			Severity: strings.ToLower(strings.TrimSpace(item.Severity)),
			Time:     item.CreatedAt.Format(time.RFC3339),
			Category: item.Category,
		})
	}

	return response, nil
}

func buildRecentAlerts(rows []alerts.AlertWithDevice) []RecentAlert {
	response := make([]RecentAlert, 0, len(rows))
	for _, item := range rows {
		deviceName := resolveDeviceName(item.DeviceName, item.DeviceIP)
		timestamp := resolveAlertTime(item)
		category := item.Category
		response = append(response, RecentAlert{
			ID:       item.ID,
			Device:   deviceName,
			Message:  item.Message,
			Severity: strings.ToLower(strings.TrimSpace(item.Severity)),
			Time:     timestamp,
			Category: &category,
		})
	}
	return response
}

func (s *Service) getNetworkOverview(ctx context.Context) ([]NetworkOverviewItem, error) {
	type row struct {
		DeviceType string `gorm:"column:device_type"`
		Status     string `gorm:"column:status"`
		Count      int    `gorm:"column:count"`
	}

	rows := make([]row, 0)
	if err := s.db.WithContext(ctx).
		Table("devices").
		Select("device_type, status, COUNT(*) AS count").
		Group("device_type, status").
		Scan(&rows).Error; err != nil {
		return nil, err
	}

	type group struct {
		Name    string
		Devices int
		Status  string
	}
	groups := make(map[string]*group)

	for _, item := range rows {
		name := strings.TrimSpace(item.DeviceType)
		if name == "" {
			name = "未分类"
		}
		if groups[name] == nil {
			groups[name] = &group{Name: name, Status: "normal"}
		}
		g := groups[name]
		g.Devices += item.Count
		g.Status = mergeGroupStatus(g.Status, item.Status)
	}

	result := make([]NetworkOverviewItem, 0, len(groups))
	for _, g := range groups {
		result = append(result, NetworkOverviewItem{
			Name:    g.Name,
			Devices: g.Devices,
			Status:  g.Status,
		})
	}

	return result, nil
}

func mergeGroupStatus(current string, deviceStatus string) string {
	normalized := strings.ToLower(strings.TrimSpace(deviceStatus))
	switch normalized {
	case "offline", "error":
		return "critical"
	case "maintenance", "unknown":
		if current != "critical" {
			return "warning"
		}
	}
	return current
}

func resolveDeviceName(name *string, ip *string) string {
	if name != nil && strings.TrimSpace(*name) != "" {
		return strings.TrimSpace(*name)
	}
	if ip != nil && strings.TrimSpace(*ip) != "" {
		return strings.TrimSpace(*ip)
	}
	return "未知设备"
}

func resolveAlertTime(alert alerts.AlertWithDevice) string {
	if alert.LastOccurred != nil && !alert.LastOccurred.IsZero() {
		return alert.LastOccurred.UTC().Format(time.RFC3339)
	}
	if alert.CreatedAt != nil && !alert.CreatedAt.IsZero() {
		return alert.CreatedAt.UTC().Format(time.RFC3339)
	}
	return time.Now().UTC().Format(time.RFC3339)
}

// MaxReasonableBandwidthBps 最大合理带宽阈值：10 Gbps = 10,000,000,000 bps
// 超过此值的数据被视为异常数据（可能是历史错误数据）
const MaxReasonableBandwidthBps = 10_000_000_000

// queryPeakNetworkMetric24h 查询24小时内的峰值网络流量（入站+出站的最大值）
// 返回值单位为 bps (bits per second)
// 会过滤掉超过 10 Gbps 的异常数据
func (s *Service) queryPeakNetworkMetric24h(ctx context.Context) (float64, bool, error) {
	inbound := []string{"bandwidth_in", "network_bytes_in", "throughput_in"}
	outbound := []string{"bandwidth_out", "network_bytes_out", "throughput_out"}
	allMetrics := append(append([]string{}, inbound...), outbound...)

	type peakRow struct {
		PeakValue   sql.NullFloat64 `gorm:"column:peak_value"`
		SampleCount int64           `gorm:"column:sample_count"`
	}

	var peak peakRow

	// 使用子查询：先按时间点聚合入站和出站流量，然后取最大值
	// 过滤掉超过 10 Gbps 的异常数据
	query := `
		WITH time_buckets AS (
			SELECT 
				time_bucket('5 minutes', collected_at) AS bucket,
				SUM(CASE WHEN metric_name IN (?) AND metric_value < ? THEN metric_value ELSE 0 END) AS inbound,
				SUM(CASE WHEN metric_name IN (?) AND metric_value < ? THEN metric_value ELSE 0 END) AS outbound
			FROM device_metrics
			WHERE metric_name IN (?)
			AND collected_at >= NOW() - INTERVAL '24 hours'
			AND metric_value < ?
			GROUP BY bucket
		)
		SELECT 
			MAX(inbound + outbound) AS peak_value,
			COUNT(*) AS sample_count
		FROM time_buckets
		WHERE inbound + outbound > 0
	`

	if err := s.db.WithContext(ctx).Raw(query,
		inbound, MaxReasonableBandwidthBps,
		outbound, MaxReasonableBandwidthBps,
		allMetrics,
		MaxReasonableBandwidthBps,
	).Scan(&peak).Error; err != nil {
		return 0, false, err
	}

	if peak.SampleCount == 0 || !peak.PeakValue.Valid {
		return 0, false, nil
	}

	return peak.PeakValue.Float64, true, nil
}

func (s *Service) queryAvgNetworkMetric(ctx context.Context) (float64, bool, error) {
	avgInbound, inboundCount, err := s.avgMetricList(ctx, []string{"bandwidth_in", "network_bytes_in", "throughput_in"})
	if err != nil {
		return 0, false, err
	}
	avgOutbound, outboundCount, err := s.avgMetricList(ctx, []string{"bandwidth_out", "network_bytes_out", "throughput_out"})
	if err != nil {
		return 0, false, err
	}

	if inboundCount+outboundCount == 0 {
		fallbackValue, fallbackCount, err := s.avgMetricList(ctx, []string{"bandwidth_utilization"})
		if err != nil {
			return 0, false, err
		}
		if fallbackCount > 0 {
			return fallbackValue, true, nil
		}
		return 0, false, nil
	}

	return avgInbound + avgOutbound, true, nil
}

func (s *Service) avgMetricList(ctx context.Context, metrics []string) (float64, int64, error) {
	type avgRow struct {
		AvgValue    sql.NullFloat64 `gorm:"column:avg_value"`
		SampleCount int64           `gorm:"column:sample_count"`
	}
	var avg avgRow
	// 过滤掉超过 10 Gbps 的异常数据
	if err := s.db.WithContext(ctx).
		Table("device_metrics").
		Select("AVG(metric_value) AS avg_value, COUNT(*) AS sample_count").
		Where("metric_name IN ?", metrics).
		Where("collected_at >= NOW() - INTERVAL '1 hour'").
		Where("metric_value < ?", MaxReasonableBandwidthBps).
		Scan(&avg).Error; err != nil {
		return 0, 0, err
	}
	if avg.AvgValue.Valid {
		return avg.AvgValue.Float64, avg.SampleCount, nil
	}
	return 0, avg.SampleCount, nil
}

func formatPercent(value float64, precision int) string {
	return fmt.Sprintf("%.*f%%", precision, value)
}

// formatNetworkValueBps 返回原始 bps 值的字符串表示
// 如果没有数据，返回 "0"，前端会将其格式化为 "0 bps"
// 前端将使用 formatBandwidth 函数格式化此值
func formatNetworkValueBps(value float64, ok bool) string {
	if !ok {
		// 没有数据时返回 "0"，与监控中心保持一致
		return "0"
	}
	// 返回原始 bps 值的字符串，供前端格式化
	return fmt.Sprintf("%.0f", value)
}

// formatNetworkValue 将网络值格式化为 Mbps（已弃用，保留以向后兼容）
func formatNetworkValue(value float64, ok bool) string {
	if !ok {
		return "N/A"
	}
	return fmt.Sprintf("%.1f Mbps", value)
}
