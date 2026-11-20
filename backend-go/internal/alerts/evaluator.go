package alerts

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"

	"go.uber.org/zap"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
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

// MaintenanceWindowInfo 表示设备命中的维护窗口摘要（避免 alerts 与 monitoring 循环依赖）。
type MaintenanceWindowInfo struct {
	MaintenanceID int64
	Name          string
	Mode          string
}

// MaintenanceChecker 查询当前生效维护窗口的抽象接口。
type MaintenanceChecker interface {
	GetActiveMaintenanceMapForDevices(ctx context.Context, now time.Time) (map[int]MaintenanceWindowInfo, error)
}

// Evaluator 告警规则评估引擎
// 负责将 device_metrics 中的指标与 alert_rules 中的规则进行比对，
// 当指标超过阈值时自动创建或更新告警记录。
type Evaluator struct {
	db           *gorm.DB
	wsManager    *ws.Manager
	logger       *zap.Logger
	settings     *settings.Service
	maintChecker MaintenanceChecker
	nowFn        func() time.Time
}

// NewEvaluator 创建告警评估引擎
func NewEvaluator(db *gorm.DB, wsManager *ws.Manager, settingsService *settings.Service, logger *zap.Logger) *Evaluator {
	return &Evaluator{
		db:        db,
		wsManager: wsManager,
		logger:    logger,
		settings:  settingsService,
		nowFn:     func() time.Time { return time.Now().UTC() },
	}
}

// SetMaintenanceChecker 注入维护窗口查询接口。
func (e *Evaluator) SetMaintenanceChecker(checker MaintenanceChecker) {
	if e != nil {
		e.maintChecker = checker
	}
}

// SetNowFunc 注入时钟函数（便于单测确定性验证持续窗口与滞后恢复）。
func (e *Evaluator) SetNowFunc(fn func() time.Time) {
	if e != nil && fn != nil {
		e.nowFn = fn
	}
}

func (e *Evaluator) currentTime() time.Time {
	if e != nil && e.nowFn != nil {
		return e.nowFn().UTC()
	}
	return time.Now().UTC()
}

// EnsureBuiltinAlertRules 幂等初始化 2 条内置隐形高危规则（设备异常重启 uptime_drop、端口频繁闪断 if_flap），
// 不破坏存量 alert_rules。
func EnsureBuiltinAlertRules(ctx context.Context, db *gorm.DB, logger *zap.Logger) error {
	if db == nil {
		return fmt.Errorf("database not initialized")
	}

	autoResolve := true
	isActive := true
	notify := true
	cooldown := 15

	builtins := []AlertRule{
		{
			Name:                "设备异常重启",
			Category:            "system",
			MetricName:          "uptime",
			Operator:            "<",
			ThresholdValue:      60,
			Duration:            0,
			Severity:            "critical",
			AutoResolve:         &autoResolve,
			NotificationEnabled: &notify,
			CooldownMinutes:     &cooldown,
			IsActive:            &isActive,
			ExpressionMode:      ExpressionModeUptimeDrop,
			DependencyMode:      DependencyModeNone,
		},
		{
			Name:                "端口频繁闪断",
			Category:            "interface",
			MetricName:          "flap_count_1h",
			Operator:            ">=",
			ThresholdValue:      4,
			Duration:            0,
			Severity:            "warning",
			AutoResolve:         &autoResolve,
			NotificationEnabled: &notify,
			CooldownMinutes:     &cooldown,
			IsActive:            &isActive,
			ExpressionMode:      ExpressionModeIfFlap,
			DependencyMode:      DependencyModeNone,
		},
	}

	for _, rule := range builtins {
		var count int64
		if err := db.WithContext(ctx).
			Table("alert_rules").
			Where("expression_mode = ?", rule.ExpressionMode).
			Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			continue
		}
		if err := db.WithContext(ctx).Table("alert_rules").Create(&rule).Error; err != nil {
			return err
		}
		if logger != nil {
			logger.Info("seeded builtin alert rule", zap.String("expression_mode", rule.ExpressionMode), zap.String("name", rule.Name))
		}
	}
	return nil
}

// deviceLatestMetrics 设备最新指标快照
type deviceLatestMetrics struct {
	DeviceID     int
	DeviceName   string
	DeviceType   string
	IPAddress    string
	TopologyRole string
	Status       string
	Metrics      map[string]float64
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

	// 2. 加载所有被监控设备基础信息与最新指标
	allDevices, deviceMetrics, err := e.loadDevicesAndLatestMetrics(ctx)
	if err != nil {
		return 0, 0, fmt.Errorf("load device metrics: %w", err)
	}

	// 3. 设备离线告警检测（不依赖 alert_rules，是内置逻辑）
	offlineCreated, offlineResolved := e.evaluateDeviceConnectivity(ctx, deviceMetrics)
	created += offlineCreated
	resolved += offlineResolved

	if len(rules) == 0 || len(allDevices) == 0 {
		if e.logger != nil {
			e.logger.Info("alert evaluation completed",
				zap.Int("rules", len(rules)),
				zap.Int("devices", len(deviceMetrics)),
				zap.Int("created", created),
				zap.Int("resolved", resolved))
		}
		return created, resolved, nil
	}

	now := e.currentTime()
	offlineDeviceIDs := make(map[int]bool, len(allDevices))
	for _, d := range allDevices {
		if strings.EqualFold(strings.TrimSpace(d.Status), "offline") {
			offlineDeviceIDs[d.DeviceID] = true
		}
	}

	maintMap := make(map[int]MaintenanceWindowInfo)
	if e.maintChecker != nil {
		if m, mErr := e.maintChecker.GetActiveMaintenanceMapForDevices(ctx, now); mErr == nil && m != nil {
			maintMap = m
		}
	}

	// 4. 逐规则逐设备评估
	for _, rule := range rules {
		mode := strings.ToLower(strings.TrimSpace(rule.ExpressionMode))
		switch mode {
		case ExpressionModeNoData:
			if rule.NoDataSeconds <= 0 {
				continue
			}
			c, r := e.evaluateNoDataRule(ctx, rule, allDevices, maintMap, offlineDeviceIDs, now)
			created += c
			resolved += r

		case ExpressionModeUptimeDrop:
			c, r := e.evaluateUptimeDropRule(ctx, rule, allDevices, maintMap, offlineDeviceIDs, now)
			created += c
			resolved += r

		case ExpressionModeIfFlap:
			c, r := e.evaluateIfFlapRule(ctx, rule, allDevices, maintMap, offlineDeviceIDs, now)
			created += c
			resolved += r

		default:
			ruleMetric := normalizeMetricName(rule.MetricName)
			for _, dm := range deviceMetrics {
				if !e.ruleAppliesToDevice(rule, dm) {
					continue
				}
				value, exists := findMetricValue(dm.Metrics, ruleMetric)
				if !exists {
					continue
				}
				violated := evaluateCondition(value, rule.Operator, rule.ThresholdValue)
				isNew, didResolve, evalErr := e.processRuleDeviceEvaluation(ctx, rule, dm, "", value, violated, maintMap, offlineDeviceIDs, now)
				if evalErr != nil {
					if e.logger != nil {
						e.logger.Warn("evaluate rule failed", zap.Int("rule_id", rule.ID), zap.Int("device_id", dm.DeviceID), zap.Error(evalErr))
					}
					continue
				}
				if isNew {
					created++
				}
				if didResolve {
					resolved++
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

// loadDevicesAndLatestMetrics 加载所有被监控设备基础信息及最新指标。
func (e *Evaluator) loadDevicesAndLatestMetrics(ctx context.Context) ([]deviceLatestMetrics, []deviceLatestMetrics, error) {
	type deviceRow struct {
		ID           int    `gorm:"column:id"`
		Name         string `gorm:"column:name"`
		DeviceType   string `gorm:"column:device_type"`
		IPAddress    string `gorm:"column:ip_address"`
		TopologyRole string `gorm:"column:topology_role"`
		Status       string `gorm:"column:status"`
	}

	var devices []deviceRow
	if err := e.db.WithContext(ctx).
		Table("devices").
		Select("id, name, device_type, ip_address, COALESCE(topology_role, 'access') AS topology_role, status").
		Where("is_active = ? AND is_monitored = ?", true, true).
		Find(&devices).Error; err != nil {
		return nil, nil, err
	}

	if len(devices) == 0 {
		return nil, nil, nil
	}

	deviceIDs := make([]int, 0, len(devices))
	for _, d := range devices {
		deviceIDs = append(deviceIDs, d.ID)
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
			// 允许在仅使用 device_latest_metrics / devices 快照时继续评估
			metrics = nil
		}
	}

	metricsMap := make(map[int]map[string]float64)
	for _, m := range metrics {
		if metricsMap[m.DeviceID] == nil {
			metricsMap[m.DeviceID] = make(map[string]float64)
		}
		metricsMap[m.DeviceID][m.MetricName] = m.MetricValue
	}

	// 补充从 device_latest_metrics 读取最新值（如 device_metrics 未写入或测试库直接写入快照表）
	type latestSnapshotRow struct {
		DeviceID    int     `gorm:"column:device_id"`
		MetricName  string  `gorm:"column:metric_name"`
		MetricValue float64 `gorm:"column:metric_value"`
	}
	var latestRows []latestSnapshotRow
	if err := e.db.WithContext(ctx).
		Table("device_latest_metrics").
		Select("device_id, metric_name, metric_value").
		Where("device_id IN ? AND interface_name = ''", deviceIDs).
		Scan(&latestRows).Error; err == nil {
		for _, r := range latestRows {
			if metricsMap[r.DeviceID] == nil {
				metricsMap[r.DeviceID] = make(map[string]float64)
			}
			if _, exists := metricsMap[r.DeviceID][r.MetricName]; !exists {
				metricsMap[r.DeviceID][r.MetricName] = r.MetricValue
			}
		}
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

	allDevices := make([]deviceLatestMetrics, 0, len(devices))
	withMetrics := make([]deviceLatestMetrics, 0, len(devices))
	for _, d := range devices {
		dm := deviceLatestMetrics{
			DeviceID:     d.ID,
			DeviceName:   d.Name,
			DeviceType:   d.DeviceType,
			IPAddress:    d.IPAddress,
			TopologyRole: d.TopologyRole,
			Status:       d.Status,
			Metrics:      metricsMap[d.ID],
		}
		if dm.Metrics == nil {
			dm.Metrics = make(map[string]float64)
		}
		allDevices = append(allDevices, dm)
		if len(dm.Metrics) > 0 {
			withMetrics = append(withMetrics, dm)
		}
	}

	return allDevices, withMetrics, nil
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

// processRuleDeviceEvaluation 处理持续时间窗口持久化、滞后恢复、维护静默与依赖抑制。
func (e *Evaluator) processRuleDeviceEvaluation(
	ctx context.Context,
	rule AlertRule,
	dm deviceLatestMetrics,
	entityKey string,
	value float64,
	violated bool,
	maintMap map[int]MaintenanceWindowInfo,
	offlineDeviceIDs map[int]bool,
	now time.Time,
) (isNew bool, didResolve bool, err error) {
	var state TriggerEvalState
	stateErr := e.db.WithContext(ctx).Session(&gorm.Session{Logger: silentLogger{}}).
		Table("trigger_eval_states").
		Where("rule_id = ? AND device_id = ? AND entity_key = ?", rule.ID, dm.DeviceID, entityKey).
		Take(&state).Error
	if stateErr != nil {
		if stateErr != gorm.ErrRecordNotFound {
			return false, false, stateErr
		}
		state = TriggerEvalState{
			RuleID:    rule.ID,
			DeviceID:  dm.DeviceID,
			EntityKey: entityKey,
		}
	}

	if violated {
		if state.BreachSince == nil {
			bs := now
			state.BreachSince = &bs
			state.ConsecutiveHits = 1
		} else {
			state.ConsecutiveHits++
		}
		state.LastValue = value
		state.LastEvalAt = now

		shouldFire := rule.Duration <= 0 || now.Sub(*state.BreachSince) >= time.Duration(rule.Duration)*time.Second
		if !shouldFire {
			state.IsFiring = false
			if upsertErr := e.upsertTriggerEvalState(ctx, state); upsertErr != nil {
				return false, false, upsertErr
			}
			return false, false, nil
		}

		state.IsFiring = true
		if upsertErr := e.upsertTriggerEvalState(ctx, state); upsertErr != nil {
			return false, false, upsertErr
		}

		suppressedBy := ""
		var suppressedRefID *int64
		if maint, inMaint := maintMap[dm.DeviceID]; inMaint {
			suppressedBy = SuppressedByMaintenance
			id := maint.MaintenanceID
			suppressedRefID = &id
		} else if sup, refID := IsSuppressedByUpstream(ctx, e.db, rule, dm.DeviceID, dm.TopologyRole, offlineDeviceIDs); sup {
			suppressedBy = SuppressedByDependency
			id := int64(refID)
			suppressedRefID = &id
		}

		created, createErr := e.createOrUpdateAlertWithSuppression(ctx, rule, dm, entityKey, value, suppressedBy, suppressedRefID, now)
		return created, false, createErr
	}

	// 未触发：检查滞后恢复（Hysteresis）缓冲带
	if strings.EqualFold(strings.TrimSpace(rule.ExpressionMode), ExpressionModeHysteresis) &&
		state.IsFiring &&
		rule.RecoveryThreshold != nil &&
		strings.TrimSpace(rule.RecoveryOperator) != "" {
		if !evaluateCondition(value, rule.RecoveryOperator, *rule.RecoveryThreshold) {
			state.LastValue = value
			state.LastEvalAt = now
			_ = e.upsertTriggerEvalState(ctx, state)
			return false, false, nil
		}
	}

	state.BreachSince = nil
	state.ConsecutiveHits = 0
	state.IsFiring = false
	state.LastValue = value
	state.LastEvalAt = now
	if upsertErr := e.upsertTriggerEvalState(ctx, state); upsertErr != nil {
		return false, false, upsertErr
	}

	if rule.AutoResolve != nil && *rule.AutoResolve {
		resolved, resolveErr := e.autoResolveAlertByEntity(ctx, rule, dm, entityKey, now)
		return false, resolved, resolveErr
	}
	return false, false, nil
}

func (e *Evaluator) upsertTriggerEvalState(ctx context.Context, state TriggerEvalState) error {
	return e.db.WithContext(ctx).
		Table("trigger_eval_states").
		Clauses(clause.OnConflict{
			Columns: []clause.Column{{Name: "rule_id"}, {Name: "device_id"}, {Name: "entity_key"}},
			DoUpdates: clause.AssignmentColumns([]string{
				"breach_since", "consecutive_hits", "is_firing", "last_value", "last_eval_at",
			}),
		}).
		Create(&state).Error
}

func (e *Evaluator) evaluateNoDataRule(
	ctx context.Context,
	rule AlertRule,
	allDevices []deviceLatestMetrics,
	maintMap map[int]MaintenanceWindowInfo,
	offlineDeviceIDs map[int]bool,
	now time.Time,
) (created int, resolved int) {
	ruleMetric := normalizeMetricName(rule.MetricName)
	for _, dm := range allDevices {
		if !e.ruleAppliesToDevice(rule, dm) {
			continue
		}
		var latest struct {
			CollectedAt time.Time `gorm:"column:collected_at"`
		}
		q := e.db.WithContext(ctx).Session(&gorm.Session{Logger: silentLogger{}}).
			Table("device_latest_metrics").
			Select("MAX(collected_at) AS collected_at").
			Where("device_id = ?", dm.DeviceID)
		if ruleMetric != "" {
			q = q.Where("LOWER(metric_name) = ?", ruleMetric)
		}
		err := q.Take(&latest).Error
		staleSec := float64(rule.NoDataSeconds)
		violated := true
		if err == nil && !latest.CollectedAt.IsZero() {
			gap := now.Sub(latest.CollectedAt.UTC()).Seconds()
			staleSec = gap
			violated = gap > float64(rule.NoDataSeconds)
		}
		isNew, didResolve, evalErr := e.processRuleDeviceEvaluation(ctx, rule, dm, "", staleSec, violated, maintMap, offlineDeviceIDs, now)
		if evalErr == nil {
			if isNew {
				created++
			}
			if didResolve {
				resolved++
			}
		}
	}
	return created, resolved
}

func (e *Evaluator) evaluateUptimeDropRule(
	ctx context.Context,
	rule AlertRule,
	allDevices []deviceLatestMetrics,
	maintMap map[int]MaintenanceWindowInfo,
	offlineDeviceIDs map[int]bool,
	now time.Time,
) (created int, resolved int) {
	drop := rule.ThresholdValue
	if drop <= 0 {
		drop = 60
	}
	for _, dm := range allDevices {
		if !e.ruleAppliesToDevice(rule, dm) {
			continue
		}
		var row struct {
			MetricValue float64  `gorm:"column:metric_value"`
			PrevValue   *float64 `gorm:"column:prev_value"`
		}
		err := e.db.WithContext(ctx).Session(&gorm.Session{Logger: silentLogger{}}).
			Table("device_latest_metrics").
			Select("metric_value, prev_value").
			Where("device_id = ? AND LOWER(metric_name) = 'uptime' AND interface_name = ''", dm.DeviceID).
			Take(&row).Error
		if err != nil {
			continue
		}
		violated := row.PrevValue != nil && *row.PrevValue > 0 && row.MetricValue < *row.PrevValue-drop
		isNew, didResolve, evalErr := e.processRuleDeviceEvaluation(ctx, rule, dm, "", row.MetricValue, violated, maintMap, offlineDeviceIDs, now)
		if evalErr == nil {
			if isNew {
				created++
			}
			if didResolve {
				resolved++
			}
		}
	}
	return created, resolved
}

func (e *Evaluator) evaluateIfFlapRule(
	ctx context.Context,
	rule AlertRule,
	allDevices []deviceLatestMetrics,
	maintMap map[int]MaintenanceWindowInfo,
	offlineDeviceIDs map[int]bool,
	now time.Time,
) (created int, resolved int) {
	var filterRE *regexp.Regexp
	if strings.TrimSpace(rule.EntityFilterRegex) != "" {
		compiled, err := regexp.Compile(strings.TrimSpace(rule.EntityFilterRegex))
		if err != nil {
			return 0, 0
		}
		filterRE = compiled
	}
	op := strings.TrimSpace(rule.Operator)
	if op == "" {
		op = ">="
	}
	thresh := rule.ThresholdValue
	if thresh <= 0 {
		thresh = 4
	}

	for _, dm := range allDevices {
		if !e.ruleAppliesToDevice(rule, dm) {
			continue
		}
		var ifaces []struct {
			Name        string `gorm:"column:name"`
			FlapCount1h int    `gorm:"column:flap_count_1h"`
		}
		if err := e.db.WithContext(ctx).
			Table("device_interfaces").
			Select("name, COALESCE(flap_count_1h, 0) AS flap_count_1h").
			Where("device_id = ? AND COALESCE(lld_monitored, true) = true", dm.DeviceID).
			Scan(&ifaces).Error; err != nil {
			continue
		}
		for _, iface := range ifaces {
			if filterRE != nil && !filterRE.MatchString(iface.Name) {
				continue
			}
			violated := evaluateCondition(float64(iface.FlapCount1h), op, thresh)
			entityKey := iface.Name
			if runes := []rune(entityKey); len(runes) > 128 {
				entityKey = string(runes[:128])
			}
			isNew, didResolve, evalErr := e.processRuleDeviceEvaluation(ctx, rule, dm, entityKey, float64(iface.FlapCount1h), violated, maintMap, offlineDeviceIDs, now)
			if evalErr == nil {
				if isNew {
					created++
				}
				if didResolve {
					resolved++
				}
			}
		}
	}
	return created, resolved
}

// createOrUpdateAlert 创建新告警或更新已有告警的发生次数
// 返回 (isNew, error)
func (e *Evaluator) createOrUpdateAlert(ctx context.Context, rule AlertRule, dm deviceLatestMetrics, currentValue float64) (bool, error) {
	return e.createOrUpdateAlertWithSuppression(ctx, rule, dm, "", currentValue, "", nil, e.currentTime())
}

func (e *Evaluator) createOrUpdateAlertWithSuppression(
	ctx context.Context,
	rule AlertRule,
	dm deviceLatestMetrics,
	entityKey string,
	currentValue float64,
	suppressedBy string,
	suppressedRefID *int64,
	now time.Time,
) (bool, error) {
	// 检查冷却时间：同一规则+设备是否在冷却期内
	cooldownMinutes := 30
	if rule.CooldownMinutes != nil && *rule.CooldownMinutes > 0 {
		cooldownMinutes = *rule.CooldownMinutes
	}

	// 查找该规则+设备+实体的现有活跃告警
	var existing Alert
	err := e.db.WithContext(ctx).Session(&gorm.Session{Logger: silentLogger{}}).
		Table("alerts").
		Where("rule_id = ? AND device_id = ? AND COALESCE(entity_key, '') = ? AND status IN ?",
			rule.ID, dm.DeviceID, entityKey, []string{alertStatusOpen, alertStatusAcknowledged}).
		Order("last_occurred DESC").
		Take(&existing).Error

	if err == nil {
		// 已有活跃告警，更新发生次数和最后发生时间
		updates := map[string]interface{}{
			"last_occurred":     now,
			"current_value":     currentValue,
			"occurrence_count":  gorm.Expr("COALESCE(occurrence_count, 0) + 1"),
			"suppressed_by":     suppressedBy,
			"suppressed_ref_id": suppressedRefID,
			"updated_at":        now,
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
	cooldownCutoff := now.Add(-time.Duration(cooldownMinutes) * time.Minute)
	recentErr := e.db.WithContext(ctx).Session(&gorm.Session{Logger: silentLogger{}}).
		Table("alerts").
		Where("rule_id = ? AND device_id = ? AND COALESCE(entity_key, '') = ? AND status IN ? AND resolved_at >= ?",
			rule.ID, dm.DeviceID, entityKey, []string{alertStatusResolved, alertStatusClosed}, cooldownCutoff).
		Take(&recentResolved).Error
	if recentErr == nil {
		// 在冷却期内，不创建新告警
		return false, nil
	}

	// 创建新告警
	ruleID := rule.ID
	occurrenceCount := 1
	title := buildAlertTitle(rule, dm)
	if entityKey != "" {
		title = fmt.Sprintf("%s (%s)", title, entityKey)
	}
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
		SuppressedBy:    suppressedBy,
		SuppressedRefID: suppressedRefID,
		EntityKey:       entityKey,
		CreatedAt:       &now,
		UpdatedAt:       &now,
	}

	if err := e.db.WithContext(ctx).Table("alerts").Create(&alert).Error; err != nil {
		return false, err
	}

	// 命中维护期静默、依赖抑制或单条 Snooze 时，跳过实时推送与外部通知
	isSnoozed := alert.SnoozedUntil != nil && alert.SnoozedUntil.After(now)
	if suppressedBy == "" && !isSnoozed {
		e.broadcastAlert(alert, dm)
		e.dispatchExternalNotifications(rule, alert, dm)
	}

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
	return e.autoResolveAlertByEntity(ctx, rule, dm, "", e.currentTime())
}

func (e *Evaluator) autoResolveAlertByEntity(ctx context.Context, rule AlertRule, dm deviceLatestMetrics, entityKey string, now time.Time) (bool, error) {
	var existing Alert
	err := e.db.WithContext(ctx).Session(&gorm.Session{Logger: silentLogger{}}).
		Table("alerts").
		Where("rule_id = ? AND device_id = ? AND COALESCE(entity_key, '') = ? AND status = ?",
			rule.ID, dm.DeviceID, entityKey, alertStatusOpen).
		Take(&existing).Error

	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return false, nil
		}
		return false, err
	}

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

	e.broadcastAlertResolved(existing.ID)
	return true, nil
}

// broadcastAlertResolved 自动恢复后向 alerts 房间推送 resolved 状态，
// 与手动处理告警的广播契约一致（前端按 status 映射为 alert_resolved 事件）。
func (e *Evaluator) broadcastAlertResolved(alertID int) {
	if e.wsManager == nil {
		return
	}

	e.wsManager.SendToRoom("alerts", ws.Message{
		Type: ws.MessageAlert,
		Data: map[string]interface{}{
			"id":        alertID,
			"status":    alertStatusResolved,
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		},
	})
}

// broadcastAlert 通过 WebSocket 推送新告警到 alerts 房间
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

	e.wsManager.SendToRoom("alerts", ws.Message{
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
		e.wsManager.SendToRoom("alerts", ws.Message{
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
	if err := e.db.WithContext(ctx).
		Table("alerts").
		Where("id = ?", existing.ID).
		Updates(map[string]interface{}{
			"status":          alertStatusResolved,
			"resolved_at":     now,
			"resolved_by":     "system",
			"resolution_note": "设备恢复在线，系统自动解决",
			"updated_at":      now,
		}).Error; err != nil {
		return true, err
	}

	e.broadcastAlertResolved(existing.ID)
	return true, nil
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
