package alerts

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"go.uber.org/zap"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"

	"github.com/your-org/inspect-system/backend-go/internal/settings"
	"github.com/your-org/inspect-system/backend-go/internal/ws"
)

// silentLogger 静默 GORM 日志，用于抑制 record not found 等预期查询的日志输出
type silentLogger struct{}

func (silentLogger) LogMode(gormlogger.LogLevel) gormlogger.Interface { return silentLogger{} }
func (silentLogger) Info(context.Context, string, ...interface{})     {}
func (silentLogger) Warn(context.Context, string, ...interface{})     {}
func (silentLogger) Error(context.Context, string, ...interface{})    {}
func (silentLogger) Trace(ctx context.Context, begin time.Time, fc func() (sql string, rowsAffected int64), err error) {
}

// Evaluator 告警规则评估引擎
// 负责将 device_metrics 中的指标与 alert_rules 中的规则进行比对，
// 当指标超过阈值时自动创建或更新告警记录。
type Evaluator struct {
	db        *gorm.DB
	wsManager *ws.Manager
	logger    *zap.Logger
	settings  *settings.Service
}

// NewEvaluator 创建告警评估引擎
func NewEvaluator(db *gorm.DB, wsManager *ws.Manager, settingsService *settings.Service, logger *zap.Logger) *Evaluator {
	return &Evaluator{
		db:        db,
		wsManager: wsManager,
		logger:    logger,
		settings:  settingsService,
	}
}

// deviceLatestMetrics 设备最新指标快照
type deviceLatestMetrics struct {
	DeviceID   int
	DeviceName string
	DeviceType string
	IPAddress  string
	Metrics    map[string]float64
}

// EvaluateAll 评估所有活跃规则，对所有被监控设备的最新指标进行检查
func (e *Evaluator) EvaluateAll(ctx context.Context) (created int, resolved int, err error) {
	if e == nil || e.db == nil {
		return 0, 0, fmt.Errorf("evaluator not initialized")
	}

	// 1. 加载所有活跃的告警规则
	rules, err := e.loadActiveRules(ctx)
	if err != nil {
		return 0, 0, fmt.Errorf("load alert rules: %w", err)
	}

	// 2. 加载所有被监控设备的最新指标
	deviceMetrics, err := e.loadLatestDeviceMetrics(ctx)
	if err != nil {
		return 0, 0, fmt.Errorf("load device metrics: %w", err)
	}

	// 3. 设备离线告警检测（不依赖 alert_rules，是内置逻辑）
	offlineCreated, offlineResolved := e.evaluateDeviceConnectivity(ctx, deviceMetrics)
	created += offlineCreated
	resolved += offlineResolved

	if len(rules) == 0 || len(deviceMetrics) == 0 {
		if e.logger != nil {
			e.logger.Info("alert evaluation completed",
				zap.Int("rules", len(rules)),
				zap.Int("devices", len(deviceMetrics)),
				zap.Int("created", created),
				zap.Int("resolved", resolved))
		}
		return created, resolved, nil
	}

	// 3. 打印调试信息：设备指标快照
	if e.logger != nil {
		for _, dm := range deviceMetrics {
			metricNames := make([]string, 0, len(dm.Metrics))
			for k := range dm.Metrics {
				metricNames = append(metricNames, k)
			}
			e.logger.Debug("device metrics snapshot",
				zap.Int("device_id", dm.DeviceID),
				zap.String("device_name", dm.DeviceName),
				zap.Strings("available_metrics", metricNames),
				zap.Int("metric_count", len(dm.Metrics)))
		}
	}

	// 4. 逐规则逐设备评估
	for _, rule := range rules {
		ruleMetric := normalizeMetricName(rule.MetricName)

		for _, dm := range deviceMetrics {
			if !e.ruleAppliesToDevice(rule, dm) {
				continue
			}

			value, exists := findMetricValue(dm.Metrics, ruleMetric)
			if !exists {
				if e.logger != nil {
					e.logger.Debug("metric not found for rule",
						zap.Int("rule_id", rule.ID),
						zap.String("rule_metric", rule.MetricName),
						zap.String("normalized", ruleMetric),
						zap.Int("device_id", dm.DeviceID))
				}
				continue
			}

			violated := evaluateCondition(value, rule.Operator, rule.ThresholdValue)

			if e.logger != nil {
				e.logger.Info("rule evaluation result",
					zap.Int("rule_id", rule.ID),
					zap.String("rule_name", rule.Name),
					zap.String("metric", ruleMetric),
					zap.Float64("value", value),
					zap.String("operator", rule.Operator),
					zap.Float64("threshold", rule.ThresholdValue),
					zap.Bool("violated", violated),
					zap.Int("device_id", dm.DeviceID),
					zap.String("device", dm.DeviceName))
			}

			if violated {
				isNew, createErr := e.createOrUpdateAlert(ctx, rule, dm, value)
				if createErr != nil {
					if e.logger != nil {
						e.logger.Warn("create alert failed",
							zap.Int("rule_id", rule.ID),
							zap.Int("device_id", dm.DeviceID),
							zap.Error(createErr))
					}
					continue
				}
				if isNew {
					created++
				}
			} else {
				// 指标恢复正常，检查是否需要自动解决
				if rule.AutoResolve != nil && *rule.AutoResolve {
					didResolve, resolveErr := e.autoResolveAlert(ctx, rule, dm)
					if resolveErr != nil {
						if e.logger != nil {
							e.logger.Warn("auto resolve alert failed",
								zap.Int("rule_id", rule.ID),
								zap.Int("device_id", dm.DeviceID),
								zap.Error(resolveErr))
						}
						continue
					}
					if didResolve {
						resolved++
					}
				}
			}
		}
	}

	if e.logger != nil {
		e.logger.Info("alert evaluation completed",
			zap.Int("rules", len(rules)),
			zap.Int("devices", len(deviceMetrics)),
			zap.Int("created", created),
			zap.Int("resolved", resolved))

		// 当没有告警产生时，输出摘要帮助诊断
		if created == 0 && resolved == 0 {
			for _, dm := range deviceMetrics {
				summaryParts := make([]string, 0)
				for k, v := range dm.Metrics {
					summaryParts = append(summaryParts, fmt.Sprintf("%s=%.2f", k, v))
				}
				e.logger.Info("device metrics summary (no alerts triggered)",
					zap.Int("device_id", dm.DeviceID),
					zap.String("device", dm.DeviceName),
					zap.Strings("metrics", summaryParts))
			}
		}
	}

	return created, resolved, nil
}

// loadActiveRules 加载所有启用的告警规则
func (e *Evaluator) loadActiveRules(ctx context.Context) ([]AlertRule, error) {
	var rules []AlertRule
	if err := e.db.WithContext(ctx).
		Table("alert_rules").
		Where("is_active = ?", true).
		Find(&rules).Error; err != nil {
		return nil, err
	}
	return rules, nil
}

// loadLatestDeviceMetrics 加载所有被监控设备的最新指标
func (e *Evaluator) loadLatestDeviceMetrics(ctx context.Context) ([]deviceLatestMetrics, error) {
	// 查询所有活跃且被监控的设备
	type deviceRow struct {
		ID         int    `gorm:"column:id"`
		Name       string `gorm:"column:name"`
		DeviceType string `gorm:"column:device_type"`
		IPAddress  string `gorm:"column:ip_address"`
	}

	var devices []deviceRow
	if err := e.db.WithContext(ctx).
		Table("devices").
		Select("id, name, device_type, ip_address").
		Where("is_active = ? AND is_monitored = ?", true, true).
		Find(&devices).Error; err != nil {
		return nil, err
	}

	if len(devices) == 0 {
		return nil, nil
	}

	deviceIDs := make([]int, 0, len(devices))
	deviceMap := make(map[int]deviceRow, len(devices))
	for _, d := range devices {
		deviceIDs = append(deviceIDs, d.ID)
		deviceMap[d.ID] = d
	}

	// 查询每个设备每个指标的最新值（最近30分钟内，放宽时间窗口）
	type metricRow struct {
		DeviceID    int     `gorm:"column:device_id"`
		MetricName  string  `gorm:"column:metric_name"`
		MetricValue float64 `gorm:"column:metric_value"`
	}

	var metrics []metricRow
	query := `
		SELECT DISTINCT ON (device_id, metric_name)
			device_id, metric_name, metric_value
		FROM device_metrics
		WHERE device_id IN ?
		AND collected_at >= NOW() - INTERVAL '30 minutes'
		AND metric_value IS NOT NULL
		ORDER BY device_id, metric_name, collected_at DESC`

	if err := e.db.WithContext(ctx).Raw(query, deviceIDs).Scan(&metrics).Error; err != nil {
		// 如果 DISTINCT ON 不支持，回退到子查询方式
		if e.logger != nil {
			e.logger.Warn("DISTINCT ON query failed, trying fallback", zap.Error(err))
		}
		fallbackQuery := `
			SELECT dm.device_id, dm.metric_name, dm.metric_value
			FROM device_metrics dm
			INNER JOIN (
				SELECT device_id, metric_name, MAX(collected_at) AS max_collected
				FROM device_metrics
				WHERE device_id IN ?
				AND collected_at >= NOW() - INTERVAL '30 minutes'
				AND metric_value IS NOT NULL
				GROUP BY device_id, metric_name
			) latest ON dm.device_id = latest.device_id
				AND dm.metric_name = latest.metric_name
				AND dm.collected_at = latest.max_collected`
		if err2 := e.db.WithContext(ctx).Raw(fallbackQuery, deviceIDs).Scan(&metrics).Error; err2 != nil {
			return nil, fmt.Errorf("load metrics failed: %w", err2)
		}
	}

	if e.logger != nil {
		e.logger.Debug("loaded device metrics from database",
			zap.Int("device_count", len(deviceIDs)),
			zap.Int("metric_rows", len(metrics)))
	}

	// 按设备聚合指标
	metricsMap := make(map[int]map[string]float64)
	for _, m := range metrics {
		if metricsMap[m.DeviceID] == nil {
			metricsMap[m.DeviceID] = make(map[string]float64)
		}
		metricsMap[m.DeviceID][m.MetricName] = m.MetricValue
	}

	// 同时从 devices 表获取快照指标（作为补充）
	type snapshotRow struct {
		ID          int      `gorm:"column:id"`
		CPUUsage    *float64 `gorm:"column:cpu_usage"`
		MemoryUsage *float64 `gorm:"column:memory_usage"`
		Temperature *float64 `gorm:"column:temperature"`
	}

	var snapshots []snapshotRow
	if err := e.db.WithContext(ctx).
		Table("devices").
		Select("id, cpu_usage, memory_usage, temperature").
		Where("id IN ?", deviceIDs).
		Find(&snapshots).Error; err == nil {
		for _, s := range snapshots {
			if metricsMap[s.ID] == nil {
				metricsMap[s.ID] = make(map[string]float64)
			}
			m := metricsMap[s.ID]
			if _, exists := m["cpu_usage"]; !exists && s.CPUUsage != nil {
				m["cpu_usage"] = *s.CPUUsage
			}
			if _, exists := m["memory_usage"]; !exists && s.MemoryUsage != nil {
				m["memory_usage"] = *s.MemoryUsage
			}
			if _, exists := m["temperature"]; !exists && s.Temperature != nil {
				m["temperature"] = *s.Temperature
			}
		}
	}

	// 构建结果
	result := make([]deviceLatestMetrics, 0, len(devices))
	for _, d := range devices {
		dm := deviceLatestMetrics{
			DeviceID:   d.ID,
			DeviceName: d.Name,
			DeviceType: d.DeviceType,
			IPAddress:  d.IPAddress,
			Metrics:    metricsMap[d.ID],
		}
		if dm.Metrics == nil {
			dm.Metrics = make(map[string]float64)
		}
		// 只有有指标数据的设备才参与评估
		if len(dm.Metrics) > 0 {
			result = append(result, dm)
		}
	}

	return result, nil
}

// ruleAppliesToDevice 检查规则是否适用于指定设备
func (e *Evaluator) ruleAppliesToDevice(rule AlertRule, dm deviceLatestMetrics) bool {
	// 检查设备类型过滤
	if len(rule.DeviceTypes) > 0 && string(rule.DeviceTypes) != "null" && string(rule.DeviceTypes) != "[]" {
		var types []string
		if err := json.Unmarshal(rule.DeviceTypes, &types); err == nil && len(types) > 0 {
			matched := false
			for _, t := range types {
				if strings.EqualFold(strings.TrimSpace(t), strings.TrimSpace(dm.DeviceType)) {
					matched = true
					break
				}
			}
			if !matched {
				return false
			}
		}
	}

	// 检查特定设备过滤
	if len(rule.SpecificDevices) > 0 && string(rule.SpecificDevices) != "null" && string(rule.SpecificDevices) != "[]" {
		var deviceIDs []interface{}
		if err := json.Unmarshal(rule.SpecificDevices, &deviceIDs); err == nil && len(deviceIDs) > 0 {
			matched := false
			for _, id := range deviceIDs {
				switch v := id.(type) {
				case float64:
					if int(v) == dm.DeviceID {
						matched = true
					}
				case string:
					if fmt.Sprintf("%d", dm.DeviceID) == strings.TrimSpace(v) {
						matched = true
					}
				}
				if matched {
					break
				}
			}
			if !matched {
				return false
			}
		}
	}

	return true
}

// evaluateCondition 评估指标值是否违反阈值条件
func evaluateCondition(value float64, operator string, threshold float64) bool {
	switch strings.TrimSpace(operator) {
	case ">":
		return value > threshold
	case ">=":
		return value >= threshold
	case "<":
		return value < threshold
	case "<=":
		return value <= threshold
	case "==", "=":
		return value == threshold
	case "!=":
		return value != threshold
	default:
		return value > threshold
	}
}

// createOrUpdateAlert 创建新告警或更新已有告警的发生次数
// 返回 (isNew, error)
func (e *Evaluator) createOrUpdateAlert(ctx context.Context, rule AlertRule, dm deviceLatestMetrics, currentValue float64) (bool, error) {
	// 检查冷却时间：同一规则+设备是否在冷却期内
	cooldownMinutes := 30
	if rule.CooldownMinutes != nil && *rule.CooldownMinutes > 0 {
		cooldownMinutes = *rule.CooldownMinutes
	}

	// 查找该规则+设备的现有活跃告警
	var existing Alert
	err := e.db.WithContext(ctx).Session(&gorm.Session{Logger: silentLogger{}}).
		Table("alerts").
		Where("rule_id = ? AND device_id = ? AND status IN ?",
			rule.ID, dm.DeviceID, []string{alertStatusOpen, alertStatusAcknowledged}).
		Order("last_occurred DESC").
		Take(&existing).Error

	if err == nil {
		// 已有活跃告警，更新发生次数和最后发生时间
		now := time.Now().UTC()
		updates := map[string]interface{}{
			"last_occurred":    now,
			"current_value":    currentValue,
			"occurrence_count": gorm.Expr("COALESCE(occurrence_count, 0) + 1"),
			"updated_at":       now,
		}
		return false, e.db.WithContext(ctx).
			Table("alerts").
			Where("id = ?", existing.ID).
			Updates(updates).Error
	}

	if err != gorm.ErrRecordNotFound {
		return false, err
	}

	// 检查冷却期：最近是否刚解决过同一告警
	var recentResolved Alert
	cooldownCutoff := time.Now().UTC().Add(-time.Duration(cooldownMinutes) * time.Minute)
	recentErr := e.db.WithContext(ctx).Session(&gorm.Session{Logger: silentLogger{}}).
		Table("alerts").
		Where("rule_id = ? AND device_id = ? AND status IN ? AND resolved_at >= ?",
			rule.ID, dm.DeviceID, []string{alertStatusResolved, alertStatusClosed}, cooldownCutoff).
		Take(&recentResolved).Error
	if recentErr == nil {
		// 在冷却期内，不创建新告警
		return false, nil
	}

	// 创建新告警
	now := time.Now().UTC()
	ruleID := rule.ID
	occurrenceCount := 1
	title := buildAlertTitle(rule, dm)
	message := buildAlertMessage(rule, dm, currentValue)

	alert := Alert{
		DeviceID:        dm.DeviceID,
		RuleID:          &ruleID,
		Title:           title,
		Message:         message,
		Category:        rule.Category,
		Severity:        normalizeSeverityForCreate(rule.Severity),
		Status:          alertStatusOpen,
		MetricName:      &rule.MetricName,
		CurrentValue:    &currentValue,
		ThresholdValue:  &rule.ThresholdValue,
		FirstOccurred:   &now,
		LastOccurred:    &now,
		OccurrenceCount: &occurrenceCount,
		CreatedAt:       &now,
		UpdatedAt:       &now,
	}

	if err := e.db.WithContext(ctx).Table("alerts").Create(&alert).Error; err != nil {
		return false, err
	}

	// 通过 WebSocket 推送实时告警通知
	e.broadcastAlert(alert, dm)

	// 触发外部通知（邮件/Webhook）。仅对新建告警触发一次，避免重复发生时刷屏。
	e.dispatchExternalNotifications(rule, alert, dm)

	return true, nil
}

func (e *Evaluator) dispatchExternalNotifications(rule AlertRule, alert Alert, dm deviceLatestMetrics) {
	if e == nil || e.settings == nil {
		return
	}
	if rule.NotificationEnabled != nil && !*rule.NotificationEnabled {
		return
	}

	// 告警评估在调度器里周期运行，通知发送放到异步，避免阻塞主循环。
	go func() {
		ctx := context.Background()

		// Email
		if rule.EmailEnabled != nil && *rule.EmailEnabled {
			if e.settings.EmailNotificationsEnabled(ctx) {
				recipients := decodeRecipients([]byte(rule.EmailRecipients))
				if len(recipients) > 0 {
					subject := fmt.Sprintf("[告警][%s] %s", strings.ToUpper(alert.Severity), alert.Title)
					content := buildExternalAlertContent(alert, dm, rule)
					for _, recipient := range recipients {
						if err := e.settings.SendEmail(ctx, recipient, subject, content); err != nil && e.logger != nil {
							e.logger.Warn("send alert email failed", zap.Error(err), zap.String("recipient", recipient))
						}
					}
				}
			}
		}

		// Webhook
		if rule.WebhookEnabled != nil && *rule.WebhookEnabled {
			if e.settings.WebhookNotificationsEnabled(ctx) {
				url := ""
				if rule.WebhookURL != nil {
					url = strings.TrimSpace(*rule.WebhookURL)
				}

				payload := map[string]interface{}{
					"event":     "alert.created",
					"timestamp": time.Now().UTC().Format(time.RFC3339),
					"alert": map[string]interface{}{
						"id":        alert.ID,
						"device_id": alert.DeviceID,
						"title":     alert.Title,
						"message":   alert.Message,
						"severity":  alert.Severity,
						"category":  alert.Category,
						"status":    alert.Status,
					},
					"rule": map[string]interface{}{
						"id":   rule.ID,
						"name": rule.Name,
					},
					"device": map[string]interface{}{
						"id":   dm.DeviceID,
						"name": dm.DeviceName,
						"ip":   dm.IPAddress,
						"type": dm.DeviceType,
					},
				}

				if _, err := e.settings.SendWebhook(ctx, settings.WebhookSendInput{
					URL:     url,
					Method:  "",
					Headers: nil,
					Payload: payload,
				}); err != nil && e.logger != nil {
					e.logger.Warn("send alert webhook failed", zap.Error(err))
				}
			}
		}
	}()
}

func decodeRecipients(raw []byte) []string {
	if len(raw) == 0 {
		return []string{}
	}

	recipients := make([]string, 0)
	_ = json.Unmarshal(raw, &recipients)

	result := make([]string, 0, len(recipients))
	for _, item := range recipients {
		trimmed := strings.TrimSpace(item)
		if trimmed == "" {
			continue
		}
		result = append(result, trimmed)
	}
	return result
}

func buildExternalAlertContent(alert Alert, dm deviceLatestMetrics, rule AlertRule) string {
	lines := []string{
		"告警通知",
		"",
		fmt.Sprintf("告警标题：%s", alert.Title),
		fmt.Sprintf("告警级别：%s", strings.ToUpper(alert.Severity)),
		fmt.Sprintf("告警分类：%s", alert.Category),
		fmt.Sprintf("告警状态：%s", alert.Status),
		"",
		fmt.Sprintf("设备名称：%s", dm.DeviceName),
		fmt.Sprintf("设备IP：%s", dm.IPAddress),
		fmt.Sprintf("设备类型：%s", dm.DeviceType),
		"",
		fmt.Sprintf("规则名称：%s", rule.Name),
		"",
		fmt.Sprintf("告警内容：%s", alert.Message),
	}
	return strings.Join(lines, "\n")
}

// autoResolveAlert 当指标恢复正常时自动解决告警
func (e *Evaluator) autoResolveAlert(ctx context.Context, rule AlertRule, dm deviceLatestMetrics) (bool, error) {
	var existing Alert
	err := e.db.WithContext(ctx).Session(&gorm.Session{Logger: silentLogger{}}).
		Table("alerts").
		Where("rule_id = ? AND device_id = ? AND status = ?",
			rule.ID, dm.DeviceID, alertStatusOpen).
		Take(&existing).Error

	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return false, nil
		}
		return false, err
	}

	now := time.Now().UTC()
	resolvedBy := "system"
	resolutionNote := "指标恢复正常，系统自动解决"
	updates := map[string]interface{}{
		"status":          alertStatusResolved,
		"resolved_at":     now,
		"resolved_by":     resolvedBy,
		"resolution_note": resolutionNote,
		"updated_at":      now,
	}

	if err := e.db.WithContext(ctx).
		Table("alerts").
		Where("id = ?", existing.ID).
		Updates(updates).Error; err != nil {
		return false, err
	}

	return true, nil
}

// broadcastAlert 通过 WebSocket 广播新告警
func (e *Evaluator) broadcastAlert(alert Alert, dm deviceLatestMetrics) {
	if e.wsManager == nil {
		return
	}

	payload := map[string]interface{}{
		"id":        alert.ID,
		"device_id": alert.DeviceID,
		"device":    dm.DeviceName,
		"title":     alert.Title,
		"message":   alert.Message,
		"severity":  alert.Severity,
		"category":  alert.Category,
		"status":    "active",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	}

	e.wsManager.Broadcast(ws.Message{
		Type: ws.MessageAlert,
		Data: payload,
	})
}

// buildAlertTitle 构建告警标题
func buildAlertTitle(rule AlertRule, dm deviceLatestMetrics) string {
	metricLabel := metricDisplayName(rule.MetricName)
	return fmt.Sprintf("[%s] %s - %s", strings.ToUpper(rule.Severity), dm.DeviceName, metricLabel)
}

// buildAlertMessage 构建告警详细消息
func buildAlertMessage(rule AlertRule, dm deviceLatestMetrics, currentValue float64) string {
	metricLabel := metricDisplayName(rule.MetricName)
	unit := metricUnit(rule.MetricName)
	return fmt.Sprintf("设备 %s (%s) 的 %s 当前值为 %.2f%s，%s阈值 %.2f%s",
		dm.DeviceName, dm.IPAddress,
		metricLabel, currentValue, unit,
		operatorLabel(rule.Operator), rule.ThresholdValue, unit)
}

// metricDisplayName 返回指标的中文显示名称
func metricDisplayName(name string) string {
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "cpu_usage":
		return "CPU使用率"
	case "memory_usage":
		return "内存使用率"
	case "disk_usage":
		return "磁盘使用率"
	case "temperature":
		return "温度"
	case "bandwidth_in":
		return "入站带宽"
	case "bandwidth_out":
		return "出站带宽"
	case "packet_loss":
		return "丢包率"
	case "response_time":
		return "响应时间"
	case "uptime":
		return "运行时间"
	default:
		return name
	}
}

// metricUnit 返回指标的单位
func metricUnit(name string) string {
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "cpu_usage", "memory_usage", "disk_usage", "packet_loss":
		return "%"
	case "temperature":
		return "°C"
	case "bandwidth_in", "bandwidth_out":
		return " bps"
	case "response_time":
		return " ms"
	case "uptime":
		return " s"
	default:
		return ""
	}
}

// operatorLabel 返回运算符的中文描述
func operatorLabel(op string) string {
	switch strings.TrimSpace(op) {
	case ">":
		return "超过"
	case ">=":
		return "大于等于"
	case "<":
		return "低于"
	case "<=":
		return "小于等于"
	case "==", "=":
		return "等于"
	case "!=":
		return "不等于"
	default:
		return "超过"
	}
}

// normalizeSeverityForCreate 规范化告警严重级别
func normalizeSeverityForCreate(severity string) string {
	normalized := strings.ToLower(strings.TrimSpace(severity))
	switch normalized {
	case "critical", "warning", "info":
		return normalized
	case "fatal", "emergency":
		return "critical"
	default:
		return "warning"
	}
}

// normalizeMetricName 规范化指标名称，处理常见的命名差异
func normalizeMetricName(name string) string {
	return strings.ToLower(strings.TrimSpace(name))
}

// evaluateDeviceConnectivity 检测设备离线状态并生成告警
// 这是内置逻辑，不依赖 alert_rules 表
func (e *Evaluator) evaluateDeviceConnectivity(ctx context.Context, deviceMetrics []deviceLatestMetrics) (created int, resolved int) {
	// 查询所有被监控设备的状态
	type statusRow struct {
		ID        int    `gorm:"column:id"`
		Name      string `gorm:"column:name"`
		IPAddress string `gorm:"column:ip_address"`
		Status    string `gorm:"column:status"`
	}

	var devices []statusRow
	if err := e.db.WithContext(ctx).
		Table("devices").
		Select("id, name, ip_address, status").
		Where("is_active = ? AND is_monitored = ?", true, true).
		Find(&devices).Error; err != nil {
		return 0, 0
	}

	for _, device := range devices {
		isOffline := strings.EqualFold(strings.TrimSpace(device.Status), "offline")

		if isOffline {
			// 设备离线，创建或更新告警
			isNew, err := e.createConnectivityAlert(ctx, device.ID, device.Name, device.IPAddress)
			if err == nil && isNew {
				created++
			}
		} else {
			// 设备在线，自动解决离线告警
			didResolve, err := e.resolveConnectivityAlert(ctx, device.ID)
			if err == nil && didResolve {
				resolved++
			}
		}
	}

	return created, resolved
}

// createConnectivityAlert 创建设备离线告警
func (e *Evaluator) createConnectivityAlert(ctx context.Context, deviceID int, deviceName string, ipAddress string) (bool, error) {
	// 检查是否已有活跃的离线告警
	var existing Alert
	err := e.db.WithContext(ctx).Session(&gorm.Session{Logger: silentLogger{}}).
		Table("alerts").
		Where("device_id = ? AND category = ? AND status IN ?",
			deviceID, "connectivity", []string{alertStatusOpen, alertStatusAcknowledged}).
		Take(&existing).Error

	if err == nil {
		// 已有活跃告警，更新
		now := time.Now().UTC()
		return false, e.db.WithContext(ctx).
			Table("alerts").
			Where("id = ?", existing.ID).
			Updates(map[string]interface{}{
				"last_occurred":    now,
				"occurrence_count": gorm.Expr("COALESCE(occurrence_count, 0) + 1"),
				"updated_at":       now,
			}).Error
	}

	if err != gorm.ErrRecordNotFound {
		return false, err
	}

	// 创建新告警
	now := time.Now().UTC()
	occurrenceCount := 1
	alert := Alert{
		DeviceID:        deviceID,
		Title:           fmt.Sprintf("[CRITICAL] %s - 设备离线", deviceName),
		Message:         fmt.Sprintf("设备 %s (%s) 无法连通，ICMP 探测失败", deviceName, ipAddress),
		Category:        "connectivity",
		Severity:        "critical",
		Status:          alertStatusOpen,
		FirstOccurred:   &now,
		LastOccurred:    &now,
		OccurrenceCount: &occurrenceCount,
		CreatedAt:       &now,
		UpdatedAt:       &now,
	}

	if err := e.db.WithContext(ctx).Table("alerts").Create(&alert).Error; err != nil {
		return false, err
	}

	// WebSocket 推送
	if e.wsManager != nil {
		e.wsManager.Broadcast(ws.Message{
			Type: ws.MessageAlert,
			Data: map[string]interface{}{
				"id":        alert.ID,
				"device_id": deviceID,
				"device":    deviceName,
				"title":     alert.Title,
				"message":   alert.Message,
				"severity":  "critical",
				"category":  "connectivity",
				"status":    "active",
				"timestamp": now.Format(time.RFC3339),
			},
		})
	}

	if e.logger != nil {
		e.logger.Info("connectivity alert created",
			zap.Int("device_id", deviceID),
			zap.String("device", deviceName))
	}

	return true, nil
}

// resolveConnectivityAlert 自动解决设备离线告警
func (e *Evaluator) resolveConnectivityAlert(ctx context.Context, deviceID int) (bool, error) {
	var existing Alert
	err := e.db.WithContext(ctx).Session(&gorm.Session{Logger: silentLogger{}}).
		Table("alerts").
		Where("device_id = ? AND category = ? AND status = ?",
			deviceID, "connectivity", alertStatusOpen).
		Take(&existing).Error

	if err != nil {
		return false, nil
	}

	now := time.Now().UTC()
	return true, e.db.WithContext(ctx).
		Table("alerts").
		Where("id = ?", existing.ID).
		Updates(map[string]interface{}{
			"status":          alertStatusResolved,
			"resolved_at":     now,
			"resolved_by":     "system",
			"resolution_note": "设备恢复在线，系统自动解决",
			"updated_at":      now,
		}).Error
}

// metricNameAliases 指标名称别名映射
// 规则中可能使用的名称 → 实际存储在 device_metrics 中的名称
var metricNameAliases = map[string][]string{
	"cpu_usage":     {"cpu_usage", "cpu", "cpu_utilization", "cpu_load"},
	"memory_usage":  {"memory_usage", "memory", "mem_usage", "mem_utilization"},
	"disk_usage":    {"disk_usage", "disk", "disk_utilization", "storage_usage"},
	"temperature":   {"temperature", "temp", "cpu_temperature", "device_temperature"},
	"bandwidth_in":  {"bandwidth_in", "network_bytes_in", "throughput_in", "inbound_bandwidth"},
	"bandwidth_out": {"bandwidth_out", "network_bytes_out", "throughput_out", "outbound_bandwidth"},
	"packet_loss":   {"packet_loss", "loss_rate"},
	"response_time": {"response_time", "latency", "rtt"},
	"uptime":        {"uptime", "system_uptime"},
}

// findMetricValue 在设备指标中查找匹配的指标值
// 支持精确匹配和别名匹配
func findMetricValue(metrics map[string]float64, ruleMetric string) (float64, bool) {
	// 1. 精确匹配
	if v, ok := metrics[ruleMetric]; ok {
		return v, true
	}

	// 2. 大小写不敏感匹配
	for k, v := range metrics {
		if strings.EqualFold(k, ruleMetric) {
			return v, true
		}
	}

	// 3. 别名匹配：规则指标名 → 查找所有可能的别名
	if aliases, ok := metricNameAliases[ruleMetric]; ok {
		for _, alias := range aliases {
			if v, found := metrics[alias]; found {
				return v, true
			}
		}
	}

	// 4. 反向别名匹配：遍历所有别名组，看规则指标名是否是某个别名
	for canonical, aliases := range metricNameAliases {
		for _, alias := range aliases {
			if alias == ruleMetric {
				// 规则使用了别名，尝试用规范名查找
				if v, found := metrics[canonical]; found {
					return v, true
				}
				// 也尝试该组的其他别名
				for _, otherAlias := range aliases {
					if v, found := metrics[otherAlias]; found {
						return v, true
					}
				}
				break
			}
		}
	}

	return 0, false
}
