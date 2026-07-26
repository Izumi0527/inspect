package dashboard

import (
	"context"
	"database/sql"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

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

func (s *Service) GetOverview(ctx context.Context, access OverviewAccess) (OverviewResponse, error) {
	if s == nil || s.db == nil {
		return OverviewResponse{}, fmt.Errorf("database not initialized")
	}

	sections := buildDashboardSections(access)
	deviceStats := DeviceStatusSummary{}
	deviceStatsAvailable := false
	if access.CanReadDevices {
		stats, err := s.getDeviceStatusSummary(ctx)
		if err != nil {
			if s.logger != nil {
				s.logger.Warn("加载总览设备统计失败", zap.Error(err))
			}
			sections["statsDevices"] = buildOverviewErrorSectionStatus("设备统计加载失败")
		} else {
			deviceStats = stats
			deviceStatsAvailable = true
		}
	}

	alertStats := AlertSummary{}
	alertStatsAvailable := false
	if access.CanReadAlerts {
		stats, err := s.getAlertSummary(ctx)
		if err != nil {
			if s.logger != nil {
				s.logger.Warn("加载总览告警统计失败", zap.Error(err))
			}
			sections["statsAlerts"] = buildOverviewErrorSectionStatus("告警统计加载失败")
		} else {
			alertStats = stats
			alertStatsAvailable = true
		}
	}

	// 查询24小时内上行/下行各自的峰值网络流量（bps），与监控中心共用统一查询口径
	peakInbound := 0.0
	peakOutbound := 0.0
	hasNetwork := false
	if access.CanReadMonitoring {
		snapshot, err := monitoring.PeakNetworkMetrics24h(ctx, s.db, nil)
		if err != nil {
			if s.logger != nil {
				s.logger.Warn("加载总览带宽统计失败", zap.Error(err))
			}
			sections["statsBandwidth"] = buildOverviewErrorSectionStatus("带宽统计加载失败")
		} else {
			peakInbound = snapshot.Inbound
			peakOutbound = snapshot.Outbound
			hasNetwork = snapshot.HasData
		}
	}

	// 巡检成功率：24小时窗口内已结束任务(完成/失败/超时)中完成的占比；取消与运行中不计入
	inspectionRate := 0.0
	hasInspections := false
	if access.CanReadInspections {
		rate, ok, err := s.queryInspectionSuccessRate24h(ctx)
		if err != nil {
			if s.logger != nil {
				s.logger.Warn("加载总览巡检统计失败", zap.Error(err))
			}
			sections["statsInspections"] = buildOverviewErrorSectionStatus("巡检统计加载失败")
		} else {
			inspectionRate = rate
			hasInspections = ok
		}
	}

	// 副文案使用真实口径描述；数据不可用（无权限/查询失败）时置空，前端自动隐藏该行。
	// 不做"较昨日"类对比：系统无历史快照数据源，伪造对比文案会误导用户。
	deviceChange := ""
	if access.CanReadDevices && deviceStatsAvailable {
		deviceChange = fmt.Sprintf("共 %d 台", deviceStats.Total)
	}
	alertChange := ""
	if access.CanReadAlerts && alertStatsAvailable {
		alertChange = "待处理"
	}

	bpsUnit := "bps"
	monitoringUnit := func() *string {
		if !access.CanReadMonitoring {
			return nil
		}
		return &bpsUnit
	}() // 标识此值单位为 bps，需要前端格式化
	stats := []StatCard{
		{
			Title:     "在线设备",
			Value:     resolveOverviewStatValue(access.CanReadDevices, deviceStatsAvailable, fmt.Sprintf("%d", deviceStats.Online)),
			Change:    deviceChange,
			IconName:  "Monitor",
			IconColor: "text-green-500",
			Color:     "green",
		},
		{
			Title:     "活跃告警",
			Value:     resolveOverviewStatValue(access.CanReadAlerts, alertStatsAvailable, fmt.Sprintf("%d", alertStats.Unacknowledged)),
			Change:    alertChange,
			IconName:  "AlertTriangle",
			IconColor: "text-red-500",
			Color:     "red",
		},
		{
			Title:     "上行流量",
			Value:     resolveOverviewStatValue(access.CanReadMonitoring, sections["statsBandwidth"].Ok, formatNetworkValueBps(peakOutbound, hasNetwork)),
			Change:    "24小时峰值",
			IconName:  "Upload",
			IconColor: "text-blue-500",
			Color:     "blue",
			Unit:      monitoringUnit,
		},
		{
			Title:     "下行流量",
			Value:     resolveOverviewStatValue(access.CanReadMonitoring, sections["statsBandwidth"].Ok, formatNetworkValueBps(peakInbound, hasNetwork)),
			Change:    "24小时峰值",
			IconName:  "Download",
			IconColor: "text-cyan-500",
			Color:     "cyan",
			Unit:      monitoringUnit,
		},
		{
			Title:     "巡检成功率",
			Value:     resolveOverviewStatValue(access.CanReadInspections, sections["statsInspections"].Ok, formatInspectionRate(inspectionRate, hasInspections)),
			Change:    "近24小时",
			IconName:  "ClipboardCheck",
			IconColor: "text-purple-500",
			Color:     "purple",
		},
	}

	recentAlerts := []RecentAlert{}
	if access.CanReadAlerts {
		items, err := s.getRecentAlerts(ctx, 5)
		if err != nil {
			if s.logger != nil {
				s.logger.Warn("加载总览最近告警失败", zap.Error(err))
			}
			sections["recentAlerts"] = buildOverviewErrorSectionStatus("最近告警加载失败")
		} else {
			recentAlerts = items
		}
	}

	networkOverview := []NetworkOverviewItem{}
	if access.CanReadDevices {
		items, err := s.getNetworkOverview(ctx)
		if err != nil {
			if s.logger != nil {
				s.logger.Warn("加载总览网络概览失败", zap.Error(err))
			}
			sections["networkOverview"] = buildOverviewErrorSectionStatus("网络概览加载失败")
		} else {
			networkOverview = items
		}
	}

	return OverviewResponse{
		Stats:           stats,
		RecentAlerts:    recentAlerts,
		NetworkOverview: networkOverview,
		Sections:        sections,
		Permissions:     buildOverviewPermissions(access),
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

func (s *Service) GetNotifications(ctx context.Context, limit int) (NotificationsResponse, error) {
	return s.GetNotificationsForUser(ctx, "", NotificationAccess{
		CanReadAlerts:      true,
		CanReadInspections: true,
		CanReadReports:     true,
		CanReadDevices:     true,
	}, limit)
}

func (s *Service) GetNotificationsForUser(ctx context.Context, userID string, access NotificationAccess, limit int) (NotificationsResponse, error) {
	if s == nil || s.db == nil {
		return NotificationsResponse{}, fmt.Errorf("database not initialized")
	}

	if limit <= 0 {
		limit = 20
	}
	if limit > 50 {
		limit = 50
	}

	candidates := s.collectNotificationCandidates(ctx, limit, access)

	stateByNotificationID := map[string]UserNotificationState{}
	normalizedUserID := strings.TrimSpace(userID)
	if normalizedUserID != "" && len(candidates) > 0 {
		ids := make([]string, 0, len(candidates))
		seen := make(map[string]struct{}, len(candidates))
		for _, item := range candidates {
			if _, ok := seen[item.notification.ID]; ok {
				continue
			}
			seen[item.notification.ID] = struct{}{}
			ids = append(ids, item.notification.ID)
		}

		states := make([]UserNotificationState, 0)
		if err := s.db.WithContext(ctx).
			Where("user_id = ? AND notification_id IN ?", normalizedUserID, ids).
			Find(&states).Error; err != nil {
			return NotificationsResponse{}, err
		}
		for _, state := range states {
			stateByNotificationID[state.NotificationID] = state
		}
	}

	notifications, unreadCount := applyUserNotificationStates(candidates, stateByNotificationID, limit)

	return NotificationsResponse{
		Notifications: notifications,
		UnreadCount:   unreadCount,
		LastUpdated:   time.Now().UTC(),
	}, nil
}

func (s *Service) MarkNotificationsRead(ctx context.Context, userID string, ids []string) (int, error) {
	if s == nil || s.db == nil {
		return 0, fmt.Errorf("database not initialized")
	}

	normalizedUserID := strings.TrimSpace(userID)
	if normalizedUserID == "" {
		return 0, fmt.Errorf("user_id required")
	}

	notificationIDs := normalizeNotificationIDs(ids, 0)
	if len(notificationIDs) == 0 {
		return 0, nil
	}

	now := time.Now().UTC()
	states := make([]UserNotificationState, 0, len(notificationIDs))
	for _, id := range notificationIDs {
		states = append(states, UserNotificationState{
			UserID:         normalizedUserID,
			NotificationID: id,
			ReadAt:         &now,
		})
	}

	err := s.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns: []clause.Column{
				{Name: "user_id"},
				{Name: "notification_id"},
			},
			DoUpdates: clause.Assignments(map[string]interface{}{
				"read_at":    now,
				"updated_at": now,
			}),
		}).
		Create(&states).Error
	if err != nil {
		return 0, err
	}

	return len(notificationIDs), nil
}

func (s *Service) MarkAllNotificationsRead(ctx context.Context, userID string, windowLimit int) (int, error) {
	if s == nil || s.db == nil {
		return 0, fmt.Errorf("database not initialized")
	}
	normalizedLimit := normalizeNotificationWindowLimit(windowLimit)
	candidates := s.collectNotificationCandidates(ctx, normalizedLimit, NotificationAccess{
		CanReadAlerts:      true,
		CanReadInspections: true,
		CanReadReports:     true,
		CanReadDevices:     true,
	})
	ids := collectUniqueNotificationIDs(candidates, normalizedLimit)
	return s.MarkNotificationsRead(ctx, userID, ids)
}

func (s *Service) MarkAllNotificationsReadWithAccess(ctx context.Context, userID string, access NotificationAccess, windowLimit int) (int, error) {
	if s == nil || s.db == nil {
		return 0, fmt.Errorf("database not initialized")
	}
	normalizedLimit := normalizeNotificationWindowLimit(windowLimit)
	candidates := s.collectNotificationCandidates(ctx, normalizedLimit, access)
	ids := collectUniqueNotificationIDs(candidates, normalizedLimit)
	return s.MarkNotificationsRead(ctx, userID, ids)
}

func (s *Service) MarkNotificationsReadWithAccess(ctx context.Context, userID string, access NotificationAccess, ids []string) (int, error) {
	if s == nil || s.db == nil {
		return 0, fmt.Errorf("database not initialized")
	}

	candidates := s.collectNotificationCandidates(ctx, actionNotificationScopeLimit(ids), access)
	allowedIDs := filterNotificationActionIDsByAccess(ids, candidates, access)
	return s.MarkNotificationsRead(ctx, userID, allowedIDs)
}

func (s *Service) DismissNotifications(ctx context.Context, userID string, ids []string) (int, error) {
	if s == nil || s.db == nil {
		return 0, fmt.Errorf("database not initialized")
	}

	normalizedUserID := strings.TrimSpace(userID)
	if normalizedUserID == "" {
		return 0, fmt.Errorf("user_id required")
	}

	notificationIDs := normalizeNotificationIDs(ids, 0)
	if len(notificationIDs) == 0 {
		return 0, nil
	}

	now := time.Now().UTC()
	states := make([]UserNotificationState, 0, len(notificationIDs))
	for _, id := range notificationIDs {
		states = append(states, UserNotificationState{
			UserID:         normalizedUserID,
			NotificationID: id,
			DismissedAt:    &now,
		})
	}

	err := s.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns: []clause.Column{
				{Name: "user_id"},
				{Name: "notification_id"},
			},
			DoUpdates: clause.Assignments(map[string]interface{}{
				"dismissed_at": now,
				"updated_at":   now,
			}),
		}).
		Create(&states).Error
	if err != nil {
		return 0, err
	}

	return len(notificationIDs), nil
}

func (s *Service) DismissAllNotifications(ctx context.Context, userID string, windowLimit int) (int, error) {
	if s == nil || s.db == nil {
		return 0, fmt.Errorf("database not initialized")
	}
	normalizedLimit := normalizeNotificationWindowLimit(windowLimit)
	candidates := s.collectNotificationCandidates(ctx, normalizedLimit, NotificationAccess{
		CanReadAlerts:      true,
		CanReadInspections: true,
		CanReadReports:     true,
		CanReadDevices:     true,
	})
	ids := collectUniqueNotificationIDs(candidates, normalizedLimit)
	return s.DismissNotifications(ctx, userID, ids)
}

func (s *Service) DismissAllNotificationsWithAccess(ctx context.Context, userID string, access NotificationAccess, windowLimit int) (int, error) {
	if s == nil || s.db == nil {
		return 0, fmt.Errorf("database not initialized")
	}
	normalizedLimit := normalizeNotificationWindowLimit(windowLimit)
	candidates := s.collectNotificationCandidates(ctx, normalizedLimit, access)
	ids := collectUniqueNotificationIDs(candidates, normalizedLimit)
	return s.DismissNotifications(ctx, userID, ids)
}

func (s *Service) DismissNotificationsWithAccess(ctx context.Context, userID string, access NotificationAccess, ids []string) (int, error) {
	if s == nil || s.db == nil {
		return 0, fmt.Errorf("database not initialized")
	}

	candidates := s.collectNotificationCandidates(ctx, actionNotificationScopeLimit(ids), access)
	allowedIDs := filterNotificationActionIDsByAccess(ids, candidates, access)
	return s.DismissNotifications(ctx, userID, allowedIDs)
}

func (s *Service) collectNotificationCandidates(ctx context.Context, limit int, access NotificationAccess) []notificationCandidate {
	candidates := make([]notificationCandidate, 0, limit*2)

	if access.CanReadAlerts {
		alertCandidates, err := s.buildAlertNotifications(ctx, limit)
		if err != nil && s.logger != nil {
			s.logger.Warn("加载告警通知失败", zap.Error(err))
		}
		candidates = append(candidates, alertCandidates...)
	}

	if access.CanReadInspections {
		inspectionCandidates, err := s.buildInspectionNotifications(ctx, limit)
		if err != nil && s.logger != nil {
			s.logger.Warn("加载巡检通知失败", zap.Error(err))
		}
		candidates = append(candidates, inspectionCandidates...)
	}

	if access.CanReadReports {
		reportCandidates, err := s.buildReportNotifications(ctx, limit)
		if err != nil && s.logger != nil {
			s.logger.Warn("加载报表通知失败", zap.Error(err))
		}
		candidates = append(candidates, reportCandidates...)
	}

	if access.CanReadDevices {
		scanCandidates, err := s.buildScanNotifications(ctx, limit)
		if err != nil && s.logger != nil {
			s.logger.Warn("加载扫描通知失败", zap.Error(err))
		}
		candidates = append(candidates, scanCandidates...)
	}

	candidates = filterNotificationCandidatesByAccess(candidates, access)

	sort.Slice(candidates, func(i, j int) bool {
		return candidates[i].timestamp.After(candidates[j].timestamp)
	})

	return candidates
}

func normalizeNotificationWindowLimit(limit int) int {
	if limit <= 0 {
		return 200
	}
	if limit > 500 {
		return 500
	}
	return limit
}

func normalizeNotificationIDs(ids []string, max int) []string {
	seen := make(map[string]struct{}, len(ids))
	result := make([]string, 0, len(ids))
	for _, item := range ids {
		value := strings.TrimSpace(item)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
		if max > 0 && len(result) >= max {
			break
		}
	}
	return result
}

func collectUniqueNotificationIDs(candidates []notificationCandidate, limit int) []string {
	if limit <= 0 {
		limit = 200
	}

	ids := make([]string, 0, minInt(limit, len(candidates)))
	seen := make(map[string]struct{}, len(candidates))
	for _, item := range candidates {
		if len(ids) >= limit {
			break
		}
		id := strings.TrimSpace(item.notification.ID)
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		ids = append(ids, id)
	}
	return ids
}

func applyUserNotificationStates(
	candidates []notificationCandidate,
	stateByNotificationID map[string]UserNotificationState,
	limit int,
) ([]Notification, int) {
	if limit <= 0 {
		limit = 20
	}

	notifications := make([]Notification, 0, minInt(limit, len(candidates)))
	unreadCount := 0
	seen := make(map[string]struct{}, len(candidates))
	for _, item := range candidates {
		if len(notifications) >= limit {
			break
		}
		if _, ok := seen[item.notification.ID]; ok {
			continue
		}
		seen[item.notification.ID] = struct{}{}

		notification := item.notification
		if state, ok := stateByNotificationID[notification.ID]; ok {
			if state.DismissedAt != nil {
				continue
			}
			notification.Read = state.ReadAt != nil
		}

		if !notification.Read {
			unreadCount++
		}

		notifications = append(notifications, notification)
	}

	return notifications, unreadCount
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
		MonitoringService:     monitoringRunning,
		AlertEngine:           s.alerts != nil,
		SchedulerService:      schedulerRunning,
		MetricsStoreConnected: metricsStoreConnected,
		RedisConnected:        redisConnected,
		DatabaseConnected:     dbConnected,
		UptimeSeconds:         uptime,
		LastCheck:             time.Now().UTC(),
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
		Joins("JOIN devices d ON d.id = a.device_id").
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
	if s == nil || s.db == nil {
		return DeviceStatusSummary{}, fmt.Errorf("database not initialized")
	}

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
	if s == nil {
		return AlertSummary{}, fmt.Errorf("dashboard service not initialized")
	}

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

	if s.db == nil {
		return AlertSummary{}, fmt.Errorf("database not initialized")
	}

	rows := make([]row, 0)
	if err := s.db.WithContext(ctx).
		Table("alerts AS a").
		Select("a.severity AS severity, COUNT(*) AS count").
		Joins("JOIN devices d ON d.id = a.device_id").
		Group("a.severity").
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
		Table("alerts AS a").
		Joins("JOIN devices d ON d.id = a.device_id").
		Where("a.status IN ?", []string{"open", "acknowledged"}).
		Count(&active).Error; err == nil {
		summary.Unacknowledged = int(active)
	}

	return summary, nil
}

func (s *Service) getRecentAlerts(ctx context.Context, limit int) ([]RecentAlert, error) {
	if s == nil {
		return nil, fmt.Errorf("dashboard service not initialized")
	}

	if s.alerts != nil {
		rows, err := s.alerts.GetRecentAlerts(ctx, limit)
		if err == nil {
			return buildRecentAlerts(rows), nil
		}
	}

	type row struct {
		ID         int       `gorm:"column:id"`
		Message    string    `gorm:"column:message"`
		Severity   string    `gorm:"column:severity"`
		CreatedAt  time.Time `gorm:"column:created_at"`
		DeviceName *string   `gorm:"column:device_name"`
		Category   *string   `gorm:"column:category"`
	}

	rows := make([]row, 0)
	if s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	err := s.db.WithContext(ctx).
		Table("alerts AS a").
		Select("a.id, a.message, a.severity, a.created_at, a.category, d.name AS device_name").
		Joins("JOIN devices d ON d.id = a.device_id").
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
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

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

func (s *Service) avgMetricList(ctx context.Context, metrics []string) (float64, int64, error) {
	if s == nil || s.db == nil {
		return 0, 0, fmt.Errorf("database not initialized")
	}

	type avgRow struct {
		AvgValue    sql.NullFloat64 `gorm:"column:avg_value"`
		SampleCount int64           `gorm:"column:sample_count"`
	}
	var avg avgRow
	// 过滤掉超过 10 Gbps 的异常数据（阈值与 monitoring 包共用同一常量）
	if err := s.db.WithContext(ctx).
		Table("device_metrics").
		Select("AVG(metric_value) AS avg_value, COUNT(*) AS sample_count").
		Where("metric_name IN ?", metrics).
		Where("collected_at >= NOW() - INTERVAL '1 hour'").
		Where("metric_value < ?", monitoring.MaxReasonableBandwidthBps).
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

// queryInspectionSuccessRate24h 24小时窗口内已结束巡检(完成/失败/超时)的任务级成功率
// 返回 (成功率百分比, 是否存在已结束巡检, 错误)；cancelled 与运行中任务不计入分母
func (s *Service) queryInspectionSuccessRate24h(ctx context.Context) (float64, bool, error) {
	if s == nil || s.db == nil {
		return 0, false, fmt.Errorf("database not initialized")
	}

	type rateRow struct {
		Finished  int64 `gorm:"column:finished"`
		Succeeded int64 `gorm:"column:succeeded"`
	}
	var row rateRow
	// 时间锚点沿用巡检通知的口径：completed_at 优先，回退 updated_at
	query := `
		SELECT
			COUNT(*) AS finished,
			SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS succeeded
		FROM inspections
		WHERE status IN ('completed','failed','timeout')
		AND COALESCE(completed_at, updated_at) >= NOW() - INTERVAL '24 hours'
	`
	if err := s.db.WithContext(ctx).Raw(query).Scan(&row).Error; err != nil {
		return 0, false, err
	}
	if row.Finished == 0 {
		return 0, false, nil
	}
	return float64(row.Succeeded) / float64(row.Finished) * 100, true, nil
}

// formatInspectionRate 无已结束巡检时显示 N/A，避免 0%/100% 误导
func formatInspectionRate(rate float64, ok bool) string {
	if !ok {
		return "N/A"
	}
	return formatPercent(rate, 1)
}

type notificationCandidate struct {
	notification Notification
	timestamp    time.Time
	source       notificationSource
}

func (s *Service) buildAlertNotifications(ctx context.Context, limit int) ([]notificationCandidate, error) {
	alertsList, err := s.getRecentAlerts(ctx, limit)
	if err != nil {
		return nil, err
	}

	result := make([]notificationCandidate, 0, len(alertsList))
	for _, alert := range alertsList {
		parsedTime, err := time.Parse(time.RFC3339, alert.Time)
		if err != nil {
			parsedTime = time.Now().UTC()
		}

		severity := strings.ToLower(strings.TrimSpace(alert.Severity))
		link := fmt.Sprintf("/alerts?id=%d", alert.ID)
		device := strings.TrimSpace(alert.Device)
		if device == "" {
			device = "未知设备"
		}

		title := fmt.Sprintf("告警：%s", device)
		notification := Notification{
			ID:        fmt.Sprintf("alert-%d", alert.ID),
			Type:      "alert",
			Title:     title,
			Content:   alert.Message,
			Timestamp: parsedTime.UTC(),
			Read:      false,
			Severity:  &severity,
			Link:      &link,
			Device:    &device,
		}

		result = append(result, notificationCandidate{
			notification: notification,
			timestamp:    notification.Timestamp,
			source:       notificationSourceAlert,
		})
	}

	return result, nil
}

func (s *Service) buildInspectionNotifications(ctx context.Context, limit int) ([]notificationCandidate, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	type row struct {
		ID           int        `gorm:"column:id"`
		Name         *string    `gorm:"column:name"`
		Status       string     `gorm:"column:status"`
		CompletedAt  *time.Time `gorm:"column:completed_at"`
		UpdatedAt    *time.Time `gorm:"column:updated_at"`
		ErrorMessage *string    `gorm:"column:error_message"`
	}

	rows := make([]row, 0)
	err := s.db.WithContext(ctx).
		Table("inspections").
		Select("id, name, status, completed_at, updated_at, error_message").
		Where("status IN ?", []string{"completed", "failed", "timeout", "cancelled"}).
		Order("COALESCE(completed_at, updated_at) desc").
		Limit(limit).
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}

	link := "/inspection"
	result := make([]notificationCandidate, 0, len(rows))
	for _, item := range rows {
		name := defaultStringPointer(item.Name, fmt.Sprintf("巡检 #%d", item.ID))

		status := strings.ToLower(strings.TrimSpace(item.Status))
		severity, title, content := inspectionNotificationSummary(status, name, item.ErrorMessage)

		timestamp := time.Now().UTC()
		if item.CompletedAt != nil && !item.CompletedAt.IsZero() {
			timestamp = item.CompletedAt.UTC()
		} else if item.UpdatedAt != nil && !item.UpdatedAt.IsZero() {
			timestamp = item.UpdatedAt.UTC()
		}

		notification := Notification{
			ID:        fmt.Sprintf("inspection-%d", item.ID),
			Type:      "system",
			Title:     title,
			Content:   content,
			Timestamp: timestamp,
			Read:      false,
			Severity:  &severity,
			Link:      &link,
		}

		result = append(result, notificationCandidate{
			notification: notification,
			timestamp:    timestamp,
			source:       notificationSourceInspection,
		})
	}

	return result, nil
}

func (s *Service) buildReportNotifications(ctx context.Context, limit int) ([]notificationCandidate, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	type row struct {
		ID           int        `gorm:"column:id"`
		Title        string     `gorm:"column:title"`
		Status       string     `gorm:"column:status"`
		GeneratedAt  *time.Time `gorm:"column:generated_at"`
		UpdatedAt    *time.Time `gorm:"column:updated_at"`
		ErrorMessage *string    `gorm:"column:error_message"`
	}

	rows := make([]row, 0)
	err := s.db.WithContext(ctx).
		Table("reports").
		Select("id, title, status, generated_at, updated_at, error_message").
		Where("status IN ?", []string{"completed", "failed"}).
		Order("COALESCE(generated_at, updated_at) desc").
		Limit(limit).
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}

	link := "/reports"
	result := make([]notificationCandidate, 0, len(rows))
	for _, item := range rows {
		reportTitle := strings.TrimSpace(item.Title)
		if reportTitle == "" {
			reportTitle = fmt.Sprintf("报表 #%d", item.ID)
		}

		status := strings.ToLower(strings.TrimSpace(item.Status))
		severity, title, content := reportNotificationSummary(status, reportTitle, item.ErrorMessage)

		timestamp := time.Now().UTC()
		if item.GeneratedAt != nil && !item.GeneratedAt.IsZero() {
			timestamp = item.GeneratedAt.UTC()
		} else if item.UpdatedAt != nil && !item.UpdatedAt.IsZero() {
			timestamp = item.UpdatedAt.UTC()
		}

		notification := Notification{
			ID:        fmt.Sprintf("report-%d", item.ID),
			Type:      "system",
			Title:     title,
			Content:   content,
			Timestamp: timestamp,
			Read:      false,
			Severity:  &severity,
			Link:      &link,
		}

		result = append(result, notificationCandidate{
			notification: notification,
			timestamp:    timestamp,
			source:       notificationSourceReport,
		})
	}

	return result, nil
}

func (s *Service) buildScanNotifications(ctx context.Context, limit int) ([]notificationCandidate, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	type row struct {
		ID            string     `gorm:"column:id"`
		TargetNetwork string     `gorm:"column:target_network"`
		Status        string     `gorm:"column:status"`
		DevicesFound  int        `gorm:"column:devices_found"`
		CompletedAt   *time.Time `gorm:"column:completed_at"`
		UpdatedAt     *time.Time `gorm:"column:updated_at"`
		ErrorMessage  *string    `gorm:"column:error_message"`
	}

	rows := make([]row, 0)
	err := s.db.WithContext(ctx).
		Table("network_scans").
		Select("id, target_network, status, devices_found, completed_at, updated_at, error_message").
		Where("status IN ?", []string{"completed", "failed", "cancelled"}).
		Order("COALESCE(completed_at, updated_at) desc").
		Limit(limit).
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}

	link := "/devices"
	result := make([]notificationCandidate, 0, len(rows))
	for _, item := range rows {
		status := strings.ToLower(strings.TrimSpace(item.Status))
		target := strings.TrimSpace(item.TargetNetwork)
		if target == "" {
			target = "未知网段"
		}

		severity, title, content := scanNotificationSummary(status, target, item.DevicesFound, item.ErrorMessage)

		timestamp := time.Now().UTC()
		if item.CompletedAt != nil && !item.CompletedAt.IsZero() {
			timestamp = item.CompletedAt.UTC()
		} else if item.UpdatedAt != nil && !item.UpdatedAt.IsZero() {
			timestamp = item.UpdatedAt.UTC()
		}

		notification := Notification{
			ID:        fmt.Sprintf("scan-%s", strings.TrimSpace(item.ID)),
			Type:      "system",
			Title:     title,
			Content:   content,
			Timestamp: timestamp,
			Read:      false,
			Severity:  &severity,
			Link:      &link,
		}

		result = append(result, notificationCandidate{
			notification: notification,
			timestamp:    timestamp,
			source:       notificationSourceScan,
		})
	}

	return result, nil
}

type notificationSource string

const (
	notificationSourceAlert      notificationSource = "alert"
	notificationSourceInspection notificationSource = "inspection"
	notificationSourceReport     notificationSource = "report"
	notificationSourceScan       notificationSource = "scan"
)

func buildOverviewPermissions(access OverviewAccess) OverviewPermissions {
	return OverviewPermissions{
		Devices:     access.CanReadDevices,
		Alerts:      access.CanReadAlerts,
		Monitoring:  access.CanReadMonitoring,
		Inspections: access.CanReadInspections,
	}
}

func buildDashboardSections(access OverviewAccess) map[string]dashboardSectionStatus {
	return map[string]dashboardSectionStatus{
		"stats":          {Ok: true},
		"statsDevices":   buildOverviewSectionStatus(access.CanReadDevices, "devices:read", "当前账号缺少 devices:read，设备统计已隐藏"),
		"statsAlerts":    buildOverviewSectionStatus(access.CanReadAlerts, "alerts:read", "当前账号缺少 alerts:read，告警统计已隐藏"),
		"statsBandwidth": buildOverviewSectionStatus(access.CanReadMonitoring, "monitoring:read", "当前账号缺少 monitoring:read，带宽统计已隐藏"),
		"statsInspections": buildOverviewSectionStatus(
			access.CanReadInspections,
			"inspections:read",
			"当前账号缺少 inspections:read，巡检统计已隐藏",
		),
		"recentAlerts":   buildOverviewSectionStatus(access.CanReadAlerts, "alerts:read", "当前账号缺少 alerts:read，最近告警已隐藏"),
		"networkOverview": buildOverviewSectionStatus(
			access.CanReadDevices,
			"devices:read",
			"当前账号缺少 devices:read，网络概览已隐藏",
		),
	}
}

func buildOverviewSectionStatus(allowed bool, requiredPermission string, message string) dashboardSectionStatus {
	if allowed {
		return dashboardSectionStatus{Ok: true}
	}

	msg := message
	return dashboardSectionStatus{
		Ok:                  true,
		Message:             &msg,
		LimitedByPermission: true,
		RequiredPermission:  requiredPermission,
	}
}

func buildOverviewErrorSectionStatus(message string) dashboardSectionStatus {
	msg := strings.TrimSpace(message)
	if msg == "" {
		msg = "分区加载失败"
	}
	return dashboardSectionStatus{
		Ok:      false,
		Message: &msg,
	}
}

func resolveOverviewStatValue(allowed bool, available bool, value string) string {
	if !allowed {
		return "-"
	}
	if !available {
		return "N/A"
	}
	return value
}

func filterNotificationCandidatesByAccess(candidates []notificationCandidate, access NotificationAccess) []notificationCandidate {
	if len(candidates) == 0 {
		return []notificationCandidate{}
	}

	filtered := make([]notificationCandidate, 0, len(candidates))
	for _, candidate := range candidates {
		switch candidate.source {
		case notificationSourceAlert:
			if access.CanReadAlerts {
				filtered = append(filtered, candidate)
			}
		case notificationSourceInspection:
			if access.CanReadInspections {
				filtered = append(filtered, candidate)
			}
		case notificationSourceReport:
			if access.CanReadReports {
				filtered = append(filtered, candidate)
			}
		case notificationSourceScan:
			if access.CanReadDevices {
				filtered = append(filtered, candidate)
			}
		default:
			filtered = append(filtered, candidate)
		}
	}

	return filtered
}

func filterNotificationActionIDsByAccess(ids []string, candidates []notificationCandidate, access NotificationAccess) []string {
	filteredCandidates := filterNotificationCandidatesByAccess(candidates, access)
	allowed := make(map[string]struct{}, len(filteredCandidates))
	for _, candidate := range filteredCandidates {
		id := strings.TrimSpace(candidate.notification.ID)
		if id == "" {
			continue
		}
		allowed[id] = struct{}{}
	}

	normalized := normalizeNotificationIDs(ids, 0)
	result := make([]string, 0, len(normalized))
	for _, id := range normalized {
		if _, ok := allowed[id]; ok {
			result = append(result, id)
		}
	}

	return result
}

func actionNotificationScopeLimit(ids []string) int {
	scoped := len(normalizeNotificationIDs(ids, 0)) * 20
	if scoped < 200 {
		scoped = 200
	}
	return normalizeNotificationWindowLimit(scoped)
}

func inspectionNotificationSummary(status string, name string, errorMessage *string) (severity string, title string, content string) {
	switch status {
	case "completed":
		return "success", "巡检任务完成", fmt.Sprintf("巡检任务“%s”已完成", name)
	case "failed":
		msg := defaultStringPointer(errorMessage, "巡检执行失败")
		return "warning", "巡检任务失败", fmt.Sprintf("巡检任务“%s”失败：%s", name, msg)
	case "timeout":
		msg := defaultStringPointer(errorMessage, "巡检执行超时")
		return "warning", "巡检任务超时", fmt.Sprintf("巡检任务“%s”超时：%s", name, msg)
	case "cancelled":
		return "info", "巡检任务已取消", fmt.Sprintf("巡检任务“%s”已取消", name)
	default:
		return "info", "巡检任务更新", fmt.Sprintf("巡检任务“%s”状态更新：%s", name, status)
	}
}

func reportNotificationSummary(status string, reportTitle string, errorMessage *string) (severity string, title string, content string) {
	switch status {
	case "completed":
		return "success", "报表生成完成", fmt.Sprintf("报表“%s”已生成，可在报表中心查看", reportTitle)
	case "failed":
		msg := defaultStringPointer(errorMessage, "报表生成失败")
		return "warning", "报表生成失败", fmt.Sprintf("报表“%s”生成失败：%s", reportTitle, msg)
	default:
		return "info", "报表状态更新", fmt.Sprintf("报表“%s”状态更新：%s", reportTitle, status)
	}
}

func scanNotificationSummary(status string, target string, found int, errorMessage *string) (severity string, title string, content string) {
	switch status {
	case "completed":
		return "success", "设备扫描完成", fmt.Sprintf("扫描 %s 完成，发现 %d 台设备", target, found)
	case "failed":
		msg := defaultStringPointer(errorMessage, "扫描失败")
		return "warning", "设备扫描失败", fmt.Sprintf("扫描 %s 失败：%s", target, msg)
	case "cancelled":
		return "info", "设备扫描已取消", fmt.Sprintf("扫描 %s 已取消", target)
	default:
		return "info", "设备扫描状态更新", fmt.Sprintf("扫描 %s 状态更新：%s", target, status)
	}
}

func defaultStringPointer(value *string, fallback string) string {
	if value == nil {
		return fallback
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return fallback
	}
	return trimmed
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
