package alerts

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"go.uber.org/zap"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

const (
	alertDefaultPageSize = 20
	alertMaxPageSize     = 200
)

const (
	alertStatusOpen         = "open"
	alertStatusAcknowledged = "acknowledged"
	alertStatusResolved     = "resolved"
	alertStatusClosed       = "closed"
)

var (
	ErrInvalidAlertStatus = errors.New("invalid alert status")
)

type Service struct {
	db     *gorm.DB
	logger *zap.Logger
}

type Operator struct {
	ID   string
	Name string
}

type AlertWithDevice struct {
	Alert
	DeviceName *string `gorm:"column:device_name"`
	DeviceIP   *string `gorm:"column:device_ip"`
	RuleName   *string `gorm:"column:rule_name"`
}

type ListAlertsFilter struct {
	Page       int
	PageSize   int
	Statuses   []string
	Severities []string
	DeviceIDs  []int
	Categories []string
	StartDate  *time.Time
	EndDate    *time.Time
	Search     string
	SortBy     string
	SortOrder  string
}

type ListRulesFilter struct {
	Severity *string
	Category *string
	IsActive *bool
}

type AlertStatistics struct {
	Total        int
	Critical     int
	Warning      int
	Info         int
	Active       int
	Acknowledged int
	Resolved     int
	ByCategory   map[string]int
	ByDevice     map[string]int
}

func NewService(db *gorm.DB, logger *zap.Logger) *Service {
	return &Service{
		db:     db,
		logger: logger,
	}
}

func (s *Service) DB() *gorm.DB {
	if s == nil {
		return nil
	}
	return s.db
}

func (s *Service) ListAlerts(ctx context.Context, filter ListAlertsFilter) ([]AlertWithDevice, int64, error) {
	if s == nil || s.db == nil {
		return nil, 0, fmt.Errorf("database not initialized")
	}

	page := filter.Page
	if page <= 0 {
		page = 1
	}
	pageSize := filter.PageSize
	if pageSize <= 0 {
		pageSize = alertDefaultPageSize
	}
	if pageSize > alertMaxPageSize {
		pageSize = alertMaxPageSize
	}

	query := s.db.WithContext(ctx).
		Table("alerts AS a").
		Select("a.*, d.name AS device_name, d.ip_address AS device_ip, r.name AS rule_name").
		Joins("JOIN devices d ON d.id = a.device_id").
		Joins("LEFT JOIN alert_rules r ON r.id = a.rule_id")

	if len(filter.DeviceIDs) > 0 {
		query = query.Where("a.device_id IN ?", filter.DeviceIDs)
	}
	categories := mapCategoryFilters(filter.Categories)
	if len(categories) > 0 {
		query = query.Where("LOWER(a.category) IN ?", categories)
	}
	if filter.StartDate != nil {
		query = query.Where("COALESCE(a.first_occurred, a.created_at) >= ?", *filter.StartDate)
	}
	if filter.EndDate != nil {
		query = query.Where("COALESCE(a.first_occurred, a.created_at) <= ?", *filter.EndDate)
	}
	if strings.TrimSpace(filter.Search) != "" {
		pattern := "%" + strings.TrimSpace(filter.Search) + "%"
		query = query.Where(
			"(a.title ILIKE ? OR a.message ILIKE ? OR d.name ILIKE ? OR CAST(d.ip_address AS TEXT) ILIKE ?)",
			pattern, pattern, pattern, pattern,
		)
	}

	statuses := mapStatusFilters(filter.Statuses)
	if len(statuses) > 0 {
		query = query.Where("a.status IN ?", statuses)
	}

	severities := mapSeverityFilters(filter.Severities)
	if len(severities) > 0 {
		query = query.Where("a.severity IN ?", severities)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	order := buildAlertOrder(filter.SortBy, filter.SortOrder)
	rows := make([]AlertWithDevice, 0)
	if err := query.Order(order).
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Scan(&rows).Error; err != nil {
		return nil, 0, err
	}

	return rows, total, nil
}

func (s *Service) GetAlert(ctx context.Context, alertID int) (AlertWithDevice, error) {
	var result AlertWithDevice
	if s == nil || s.db == nil {
		return result, fmt.Errorf("database not initialized")
	}

	err := s.db.WithContext(ctx).
		Table("alerts AS a").
		Select("a.*, d.name AS device_name, d.ip_address AS device_ip, r.name AS rule_name").
		Joins("JOIN devices d ON d.id = a.device_id").
		Joins("LEFT JOIN alert_rules r ON r.id = a.rule_id").
		Where("a.id = ?", alertID).
		Take(&result).Error
	return result, err
}

func (s *Service) ListAlertOperations(ctx context.Context, alertID int, limit int) ([]AlertOperationHistory, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	if alertID <= 0 {
		return nil, fmt.Errorf("invalid alert_id")
	}

	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}

	rows := make([]AlertOperationHistory, 0)
	err := s.db.WithContext(ctx).
		Table("alert_operation_history").
		Where("alert_id = ?", alertID).
		Order("operation_time desc, id desc").
		Limit(limit).
		Find(&rows).Error
	if err != nil {
		return nil, err
	}

	return rows, nil
}

func (s *Service) GetRecentAlerts(ctx context.Context, limit int) ([]AlertWithDevice, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	if limit <= 0 {
		limit = 5
	}

	rows := make([]AlertWithDevice, 0)
	err := s.db.WithContext(ctx).
		Table("alerts AS a").
		Select("a.*, d.name AS device_name, d.ip_address AS device_ip, r.name AS rule_name").
		Joins("JOIN devices d ON d.id = a.device_id").
		Joins("LEFT JOIN alert_rules r ON r.id = a.rule_id").
		Order("a.last_occurred desc, a.created_at desc").
		Limit(limit).
		Scan(&rows).Error
	return rows, err
}

func (s *Service) GetAlertStatistics(ctx context.Context) (AlertStatistics, error) {
	if s == nil || s.db == nil {
		return AlertStatistics{}, fmt.Errorf("database not initialized")
	}

	stats := AlertStatistics{
		ByCategory: map[string]int{},
		ByDevice:   map[string]int{},
	}

	var total int64
	if err := s.db.WithContext(ctx).
		Table("alerts AS a").
		Joins("JOIN devices d ON d.id = a.device_id").
		Count(&total).Error; err != nil {
		return stats, err
	}
	stats.Total = int(total)

	var active int64
	if err := s.db.WithContext(ctx).
		Table("alerts AS a").
		Joins("JOIN devices d ON d.id = a.device_id").
		Where("a.status IN ?", []string{alertStatusOpen, alertStatusAcknowledged}).
		Count(&active).Error; err != nil {
		return stats, err
	}
	stats.Active = int(active)

	var acknowledged int64
	if err := s.db.WithContext(ctx).
		Table("alerts AS a").
		Joins("JOIN devices d ON d.id = a.device_id").
		Where("a.status = ?", alertStatusAcknowledged).
		Count(&acknowledged).Error; err != nil {
		return stats, err
	}
	stats.Acknowledged = int(acknowledged)

	var resolved int64
	if err := s.db.WithContext(ctx).
		Table("alerts AS a").
		Joins("JOIN devices d ON d.id = a.device_id").
		Where("a.status IN ?", []string{alertStatusResolved, alertStatusClosed}).
		Count(&resolved).Error; err != nil {
		return stats, err
	}
	stats.Resolved = int(resolved)

	type severityRow struct {
		Severity string `gorm:"column:severity"`
		Count    int    `gorm:"column:count"`
	}
	severityRows := make([]severityRow, 0)
	if err := s.db.WithContext(ctx).
		Table("alerts AS a").
		Joins("JOIN devices d ON d.id = a.device_id").
		Select("severity, COUNT(*) as count").
		Where("a.status IN ?", []string{alertStatusOpen, alertStatusAcknowledged}).
		Group("severity").
		Scan(&severityRows).Error; err != nil {
		return stats, err
	}
	for _, row := range severityRows {
		switch NormalizeSeverity(row.Severity) {
		case "critical":
			stats.Critical += row.Count
		case "warning":
			stats.Warning += row.Count
		default:
			stats.Info += row.Count
		}
	}

	type categoryRow struct {
		Category string `gorm:"column:category"`
		Count    int    `gorm:"column:count"`
	}
	categoryRows := make([]categoryRow, 0)
	if err := s.db.WithContext(ctx).
		Table("alerts AS a").
		Joins("JOIN devices d ON d.id = a.device_id").
		Select("category, COUNT(*) as count").
		Where("a.status IN ?", []string{alertStatusOpen, alertStatusAcknowledged}).
		Group("category").
		Scan(&categoryRows).Error; err != nil {
		return stats, err
	}
	for _, row := range categoryRows {
		if strings.TrimSpace(row.Category) == "" {
			continue
		}
		stats.ByCategory[row.Category] = row.Count
	}

	type deviceRow struct {
		DeviceID   int     `gorm:"column:device_id"`
		DeviceName *string `gorm:"column:device_name"`
		Count      int     `gorm:"column:count"`
	}
	deviceRows := make([]deviceRow, 0)
	if err := s.db.WithContext(ctx).
		Table("alerts AS a").
		Select("a.device_id, d.name AS device_name, COUNT(*) as count").
		Joins("JOIN devices d ON d.id = a.device_id").
		Where("a.status IN ?", []string{alertStatusOpen, alertStatusAcknowledged}).
		Group("a.device_id, d.name").
		Order("count desc").
		Limit(10).
		Scan(&deviceRows).Error; err != nil {
		return stats, err
	}
	for _, row := range deviceRows {
		key := ""
		if row.DeviceName != nil && strings.TrimSpace(*row.DeviceName) != "" {
			key = strings.TrimSpace(*row.DeviceName)
		} else if row.DeviceID > 0 {
			key = fmt.Sprintf("设备#%d", row.DeviceID)
		} else {
			key = "未知设备"
		}
		stats.ByDevice[key] = row.Count
	}

	return stats, nil
}

func (s *Service) AcknowledgeAlert(ctx context.Context, alertID int, operator Operator, note *string, assignee *string) error {
	metadata := map[string]interface{}{}
	if assignee != nil && strings.TrimSpace(*assignee) != "" {
		metadata["assignee"] = *assignee
	}
	return s.updateAlertStatus(ctx, alertID, alertStatusAcknowledged, operator, note, nil, metadata)
}

func (s *Service) ResolveAlert(ctx context.Context, alertID int, operator Operator, resolution *string, note *string) error {
	updates := map[string]interface{}{
		"resolution_note": stringValueOrNil(resolution),
	}
	metadata := map[string]interface{}{}
	if resolution != nil && strings.TrimSpace(*resolution) != "" {
		metadata["resolution"] = *resolution
	}
	return s.updateAlertStatus(ctx, alertID, alertStatusResolved, operator, note, updates, metadata)
}

func (s *Service) ReactivateAlert(ctx context.Context, alertID int, operator Operator, reason *string) error {
	if s == nil || s.db == nil {
		return fmt.Errorf("database not initialized")
	}

	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var alert Alert
		if err := tx.Table("alerts").Where("id = ?", alertID).Take(&alert).Error; err != nil {
			return err
		}
		if alert.Status != alertStatusResolved && alert.Status != alertStatusClosed {
			return ErrInvalidAlertStatus
		}

		now := time.Now().UTC()
		updates := map[string]interface{}{
			"status":              alertStatusOpen,
			"reactivated_at":      now,
			"reactivated_by":      normalizeOperator(operator).ID,
			"reactivation_reason": stringValueOrNil(reason),
			"acknowledged_at":     nil,
			"acknowledged_by":     nil,
			"resolved_at":         nil,
			"resolved_by":         nil,
			"resolution_note":     nil,
			"last_occurred":       now,
			"updated_at":          now,
		}

		if err := tx.Table("alerts").Where("id = ?", alertID).Updates(updates).Error; err != nil {
			return err
		}

		prev := alert.Status
		note := reason
		newStatus := alertStatusOpen
		if err := s.recordOperation(tx, alertID, "reactivate", operator, note, &prev, &newStatus, map[string]interface{}{
			"reason": reason,
		}); err != nil {
			return err
		}

		return nil
	})
}

func (s *Service) DeleteAlert(ctx context.Context, alertID int) error {
	if s == nil || s.db == nil {
		return fmt.Errorf("database not initialized")
	}
	result := s.db.WithContext(ctx).Table("alerts").Where("id = ?", alertID).Delete(&Alert{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (s *Service) AddAlertComment(ctx context.Context, alertID int, operator Operator, comment *string) error {
	if s == nil || s.db == nil {
		return fmt.Errorf("database not initialized")
	}

	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var alert Alert
		if err := tx.Table("alerts").Where("id = ?", alertID).Take(&alert).Error; err != nil {
			return err
		}

		if err := tx.Table("alerts").Where("id = ?", alertID).Updates(map[string]interface{}{
			"updated_at": time.Now().UTC(),
		}).Error; err != nil {
			return err
		}

		meta := map[string]interface{}{}
		if comment != nil {
			meta["comment"] = *comment
		}
		return s.recordOperation(tx, alertID, "update", operator, comment, nil, nil, meta)
	})
}

func (s *Service) AssignAlert(ctx context.Context, alertID int, operator Operator, assignee *string) error {
	if s == nil || s.db == nil {
		return fmt.Errorf("database not initialized")
	}

	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var alert Alert
		if err := tx.Table("alerts").Where("id = ?", alertID).Take(&alert).Error; err != nil {
			return err
		}

		if err := tx.Table("alerts").Where("id = ?", alertID).Updates(map[string]interface{}{
			"updated_at": time.Now().UTC(),
		}).Error; err != nil {
			return err
		}

		meta := map[string]interface{}{}
		if assignee != nil {
			meta["assignee"] = *assignee
		}
		return s.recordOperation(tx, alertID, "update", operator, nil, nil, nil, meta)
	})
}

func (s *Service) ListRules(ctx context.Context, filter ListRulesFilter) ([]AlertRule, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	query := s.db.WithContext(ctx).Table("alert_rules")
	if filter.Severity != nil && strings.TrimSpace(*filter.Severity) != "" {
		query = query.Where("severity = ?", strings.TrimSpace(*filter.Severity))
	}
	if filter.Category != nil && strings.TrimSpace(*filter.Category) != "" {
		query = query.Where("category = ?", strings.TrimSpace(*filter.Category))
	}
	if filter.IsActive != nil {
		query = query.Where("is_active = ?", *filter.IsActive)
	}

	rows := make([]AlertRule, 0)
	if err := query.Order("created_at desc").Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

func (s *Service) GetRule(ctx context.Context, ruleID int) (AlertRule, error) {
	if s == nil || s.db == nil {
		return AlertRule{}, fmt.Errorf("database not initialized")
	}
	var rule AlertRule
	if err := s.db.WithContext(ctx).Table("alert_rules").Where("id = ?", ruleID).Take(&rule).Error; err != nil {
		return AlertRule{}, err
	}
	return rule, nil
}

func (s *Service) CreateRule(ctx context.Context, rule *AlertRule) error {
	if s == nil || s.db == nil {
		return fmt.Errorf("database not initialized")
	}
	if rule == nil {
		return fmt.Errorf("rule is nil")
	}
	return s.db.WithContext(ctx).Table("alert_rules").Create(rule).Error
}

func (s *Service) UpdateRule(ctx context.Context, ruleID int, updates map[string]interface{}) (AlertRule, error) {
	if s == nil || s.db == nil {
		return AlertRule{}, fmt.Errorf("database not initialized")
	}
	if len(updates) == 0 {
		return s.GetRule(ctx, ruleID)
	}
	if err := s.db.WithContext(ctx).Table("alert_rules").Where("id = ?", ruleID).Updates(updates).Error; err != nil {
		return AlertRule{}, err
	}
	return s.GetRule(ctx, ruleID)
}

func (s *Service) DeleteRule(ctx context.Context, ruleID int) error {
	if s == nil || s.db == nil {
		return fmt.Errorf("database not initialized")
	}
	result := s.db.WithContext(ctx).Table("alert_rules").Where("id = ?", ruleID).
		Updates(map[string]interface{}{
			"is_active":  false,
			"updated_at": time.Now().UTC(),
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func NormalizeSeverity(raw string) string {
	normalized := strings.ToLower(strings.TrimSpace(raw))
	switch normalized {
	case "fatal", "emergency":
		return "critical"
	case "critical", "warning", "info":
		return normalized
	default:
		if normalized == "" {
			return "info"
		}
		return "info"
	}
}

func NormalizeStatus(raw string) string {
	normalized := strings.ToLower(strings.TrimSpace(raw))
	switch normalized {
	case "open", "active":
		return "active"
	case "acknowledged":
		return "acknowledged"
	case "resolved", "closed", "suppressed":
		return "resolved"
	default:
		if normalized == "" {
			return "active"
		}
		return "active"
	}
}

func mapStatusFilters(values []string) []string {
	result := make([]string, 0)
	seen := map[string]struct{}{}
	for _, raw := range values {
		normalized := strings.ToLower(strings.TrimSpace(raw))
		switch normalized {
		case "active", "open":
			normalized = alertStatusOpen
		case "suppressed":
			normalized = alertStatusClosed
		case "resolved":
			for _, value := range []string{alertStatusResolved, alertStatusClosed} {
				if _, ok := seen[value]; ok {
					continue
				}
				seen[value] = struct{}{}
				result = append(result, value)
			}
			continue
		case "acknowledged":
			normalized = alertStatusAcknowledged
		case "closed":
			normalized = alertStatusClosed
		default:
			continue
		}
		if _, ok := seen[normalized]; ok {
			continue
		}
		seen[normalized] = struct{}{}
		result = append(result, normalized)
	}
	return result
}

func mapSeverityFilters(values []string) []string {
	result := make([]string, 0)
	seen := map[string]struct{}{}
	for _, raw := range values {
		normalized := strings.ToLower(strings.TrimSpace(raw))
		switch normalized {
		case "critical":
			for _, v := range []string{"critical", "fatal", "emergency"} {
				if _, ok := seen[v]; ok {
					continue
				}
				seen[v] = struct{}{}
				result = append(result, v)
			}
			continue
		case "warning", "info", "fatal", "emergency":
		default:
			continue
		}
		if _, ok := seen[normalized]; ok {
			continue
		}
		seen[normalized] = struct{}{}
		result = append(result, normalized)
	}
	return result
}

func mapCategoryFilters(values []string) []string {
	result := make([]string, 0)
	seen := map[string]struct{}{}
	for _, raw := range values {
		for _, part := range strings.Split(raw, ",") {
			normalized := strings.ToLower(strings.TrimSpace(part))
			if normalized == "" {
				continue
			}
			if _, ok := seen[normalized]; ok {
				continue
			}
			seen[normalized] = struct{}{}
			result = append(result, normalized)
		}
	}
	return result
}

// NormalizeCategoryFilters 对分类筛选值做归一化处理，便于跨包回归测试复用。
func NormalizeCategoryFilters(values []string) []string {
	return mapCategoryFilters(values)
}

func buildAlertOrder(sortBy string, sortOrder string) string {
	direction := "desc"
	if strings.EqualFold(sortOrder, "asc") {
		direction = "asc"
	}

	switch strings.ToLower(strings.TrimSpace(sortBy)) {
	case "severity":
		return fmt.Sprintf("CASE a.severity WHEN 'info' THEN 1 WHEN 'warning' THEN 2 WHEN 'critical' THEN 3 WHEN 'fatal' THEN 4 WHEN 'emergency' THEN 4 ELSE 0 END %s, a.last_occurred desc", direction)
	case "status":
		return fmt.Sprintf("CASE a.status WHEN 'open' THEN 1 WHEN 'acknowledged' THEN 2 WHEN 'resolved' THEN 3 WHEN 'closed' THEN 4 ELSE 5 END %s, a.last_occurred desc", direction)
	case "created_at":
		return fmt.Sprintf("a.created_at %s", direction)
	case "first_occurred":
		return fmt.Sprintf("a.first_occurred %s", direction)
	case "last_occurred":
		return fmt.Sprintf("a.last_occurred %s", direction)
	case "timestamp", "time":
		return fmt.Sprintf("COALESCE(a.last_occurred, a.first_occurred, a.created_at) %s", direction)
	default:
		return "a.last_occurred desc, a.created_at desc"
	}
}

func (s *Service) updateAlertStatus(ctx context.Context, alertID int, targetStatus string, operator Operator, note *string, extraUpdates map[string]interface{}, metadata map[string]interface{}) error {
	if s == nil || s.db == nil {
		return fmt.Errorf("database not initialized")
	}

	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var alert Alert
		if err := tx.Table("alerts").Where("id = ?", alertID).Take(&alert).Error; err != nil {
			return err
		}

		switch targetStatus {
		case alertStatusAcknowledged:
			if alert.Status == alertStatusAcknowledged {
				return nil
			}
			if alert.Status != alertStatusOpen {
				return ErrInvalidAlertStatus
			}
		case alertStatusResolved:
			if alert.Status == alertStatusResolved {
				return nil
			}
			if alert.Status != alertStatusOpen && alert.Status != alertStatusAcknowledged {
				return ErrInvalidAlertStatus
			}
		default:
			return ErrInvalidAlertStatus
		}

		now := time.Now().UTC()
		updates := map[string]interface{}{
			"status":     targetStatus,
			"updated_at": now,
		}
		if targetStatus == alertStatusAcknowledged {
			updates["acknowledged_at"] = now
			updates["acknowledged_by"] = normalizeOperator(operator).ID
		}
		if targetStatus == alertStatusResolved {
			updates["resolved_at"] = now
			updates["resolved_by"] = normalizeOperator(operator).ID
		}

		for key, value := range extraUpdates {
			updates[key] = value
		}

		if err := tx.Table("alerts").Where("id = ?", alertID).Updates(updates).Error; err != nil {
			return err
		}

		prev := alert.Status
		meta := map[string]interface{}{}
		for key, value := range metadata {
			meta[key] = value
		}

		opType := "update"
		switch targetStatus {
		case alertStatusAcknowledged:
			opType = "acknowledge"
		case alertStatusResolved:
			opType = "resolve"
		}

		if err := s.recordOperation(tx, alertID, opType, operator, note, &prev, &targetStatus, meta); err != nil {
			return err
		}

		return nil
	})
}

func (s *Service) recordOperation(tx *gorm.DB, alertID int, operationType string, operator Operator, note *string, previousStatus *string, newStatus *string, metadata map[string]interface{}) error {
	if tx == nil {
		return fmt.Errorf("transaction is nil")
	}

	normalized := normalizeOperator(operator)
	opName := normalized.Name
	if strings.TrimSpace(opName) == "" {
		opName = normalized.ID
	}
	if strings.TrimSpace(opName) == "" {
		opName = "系统"
	}

	metaPayload := datatypes.JSON([]byte("{}"))
	if metadata != nil {
		if encoded, err := json.Marshal(metadata); err == nil {
			metaPayload = datatypes.JSON(encoded)
		}
	}

	history := AlertOperationHistory{
		AlertID:        alertID,
		OperationType:  operationType,
		OperatorID:     normalized.ID,
		OperatorName:   opName,
		OperationTime:  time.Now().UTC(),
		Note:           note,
		PreviousStatus: previousStatus,
		NewStatus:      newStatus,
		Metadata:       metaPayload,
	}

	return tx.Table("alert_operation_history").Create(&history).Error
}

func normalizeOperator(operator Operator) Operator {
	if strings.TrimSpace(operator.ID) == "" {
		operator.ID = "system"
	}
	if strings.TrimSpace(operator.Name) == "" {
		operator.Name = operator.ID
	}
	return operator
}

func stringValueOrNil(value *string) interface{} {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return trimmed
}

func encodeJSON(value interface{}) (datatypes.JSON, error) {
	if value == nil {
		return datatypes.JSON([]byte("null")), nil
	}
	raw, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	return datatypes.JSON(raw), nil
}
