package logs

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"go.uber.org/zap"
	"gorm.io/gorm"
)

const (
	defaultLogLimit = 100
	maxLogLimit     = 1000
)

type Service struct {
	db     *gorm.DB
	logger *zap.Logger
}

type LogFilter struct {
	DeviceID  *int
	Level     *string
	Facility  *string
	Source    *string
	StartTime *time.Time
	EndTime   *time.Time
	Search    *string
	Skip      int
	Limit     int
}

func NewService(db *gorm.DB, logger *zap.Logger) *Service {
	return &Service{
		db:     db,
		logger: logger,
	}
}

func (s *Service) ListLogs(ctx context.Context, filter LogFilter) ([]DeviceLogWithDevice, int64, error) {
	if s == nil || s.db == nil {
		return nil, 0, fmt.Errorf("database not initialized")
	}

	filter = normalizeFilter(filter)
	base := s.buildLogQuery(ctx, filter)

	var total int64
	if err := base.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	rows := make([]DeviceLogWithDevice, 0)
	if err := base.
		Order("l.log_timestamp desc").
		Offset(filter.Skip).
		Limit(filter.Limit).
		Scan(&rows).Error; err != nil {
		return nil, 0, err
	}

	return rows, total, nil
}

func (s *Service) GetRecentLogs(ctx context.Context, deviceID *int, hours int, limit int) ([]DeviceLogWithDevice, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	if hours <= 0 {
		hours = 24
	}
	if limit <= 0 {
		limit = defaultLogLimit
	}

	start := time.Now().Add(-time.Duration(hours) * time.Hour)
	filter := LogFilter{
		DeviceID:  deviceID,
		StartTime: &start,
		Limit:     limit,
	}
	filter = normalizeFilter(filter)
	base := s.buildLogQuery(ctx, filter)

	rows := make([]DeviceLogWithDevice, 0)
	if err := base.
		Order("l.log_timestamp desc").
		Limit(filter.Limit).
		Scan(&rows).Error; err != nil {
		return nil, err
	}

	return rows, nil
}

func (s *Service) SearchLogs(ctx context.Context, keyword string, filter LogFilter) ([]DeviceLogWithDevice, int64, error) {
	if s == nil || s.db == nil {
		return nil, 0, fmt.Errorf("database not initialized")
	}

	trimmed := strings.TrimSpace(keyword)
	if trimmed == "" {
		return []DeviceLogWithDevice{}, 0, nil
	}

	filter.Search = &trimmed
	filter = normalizeFilter(filter)

	base := s.buildLogQuery(ctx, filter)

	var total int64
	if err := base.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	rows := make([]DeviceLogWithDevice, 0)
	if err := base.
		Order("l.log_timestamp desc").
		Offset(filter.Skip).
		Limit(filter.Limit).
		Scan(&rows).Error; err != nil {
		return nil, 0, err
	}

	return rows, total, nil
}

func (s *Service) GetLogStatistics(ctx context.Context, deviceID *int, hours int) (LogStatistics, error) {
	if s == nil || s.db == nil {
		return LogStatistics{}, fmt.Errorf("database not initialized")
	}
	if hours <= 0 {
		hours = 24
	}

	start := time.Now().Add(-time.Duration(hours) * time.Hour)
	base := s.db.WithContext(ctx).Table("device_logs").Where("log_timestamp >= ?", start)
	if deviceID != nil {
		base = base.Where("device_id = ?", *deviceID)
	}

	stats := LogStatistics{
		ByLevel:       map[string]int64{},
		ByFacility:    map[string]int64{},
		ByDevice:      map[int]int64{},
		Trends:        map[string]int64{},
		TimeRangeHours: hours,
	}

	if err := base.Count(&stats.TotalLogs).Error; err != nil {
		return stats, err
	}

	type aggRow struct {
		Key   string `gorm:"column:key"`
		Count int64  `gorm:"column:count"`
	}

	levelRows := make([]aggRow, 0)
	if err := base.Session(&gorm.Session{}).
		Select("level AS key, COUNT(*) AS count").
		Group("level").
		Scan(&levelRows).Error; err != nil {
		return stats, err
	}
	for _, row := range levelRows {
		stats.ByLevel[row.Key] = row.Count
	}

	facilityRows := make([]aggRow, 0)
	if err := base.Session(&gorm.Session{}).
		Select("facility AS key, COUNT(*) AS count").
		Group("facility").
		Scan(&facilityRows).Error; err != nil {
		return stats, err
	}
	for _, row := range facilityRows {
		stats.ByFacility[row.Key] = row.Count
	}

	if deviceID == nil {
		type deviceRow struct {
			DeviceID int   `gorm:"column:device_id"`
			Count    int64 `gorm:"column:count"`
		}
		deviceRows := make([]deviceRow, 0)
		if err := base.Session(&gorm.Session{}).
			Select("device_id, COUNT(*) AS count").
			Group("device_id").
			Order("count desc").
			Limit(10).
			Scan(&deviceRows).Error; err != nil {
			return stats, err
		}
		for _, row := range deviceRows {
			stats.ByDevice[row.DeviceID] = row.Count
		}
	}

	type trendRow struct {
		Hour  time.Time `gorm:"column:hour"`
		Count int64     `gorm:"column:count"`
	}
	trendRows := make([]trendRow, 0)
	if err := base.Session(&gorm.Session{}).
		Select("date_trunc('hour', log_timestamp) AS hour, COUNT(*) AS count").
		Group("hour").
		Order("hour").
		Scan(&trendRows).Error; err != nil {
		return stats, err
	}
	for _, row := range trendRows {
		stats.Trends[row.Hour.Format(time.RFC3339)] = row.Count
	}

	return stats, nil
}

func (s *Service) DeleteLog(ctx context.Context, logID int) (bool, error) {
	if s == nil || s.db == nil {
		return false, fmt.Errorf("database not initialized")
	}
	if logID <= 0 {
		return false, nil
	}

	result := s.db.WithContext(ctx).Table("device_logs").Where("id = ?", logID).Delete(&DeviceLog{})
	if result.Error != nil {
		return false, result.Error
	}
	return result.RowsAffected > 0, nil
}

func (s *Service) BatchDelete(ctx context.Context, logIDs []int) (int64, error) {
	if s == nil || s.db == nil {
		return 0, fmt.Errorf("database not initialized")
	}
	if len(logIDs) == 0 {
		return 0, nil
	}

	result := s.db.WithContext(ctx).Table("device_logs").Where("id IN ?", logIDs).Delete(&DeviceLog{})
	if result.Error != nil {
		return 0, result.Error
	}
	return result.RowsAffected, nil
}

func (s *Service) CleanupDeviceLogsBefore(ctx context.Context, before time.Time) (int64, error) {
	if s == nil || s.db == nil {
		return 0, fmt.Errorf("database not initialized")
	}
	if before.IsZero() {
		return 0, fmt.Errorf("before is required")
	}

	result := s.db.WithContext(ctx).
		Table("device_logs").
		Where("created_at < ?", before).
		Delete(&DeviceLog{})
	if result.Error != nil {
		return 0, result.Error
	}
	return result.RowsAffected, nil
}

func (s *Service) ListParsingRules(ctx context.Context) ([]LogParsingRule, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	rows := make([]LogParsingRule, 0)
	if err := s.db.WithContext(ctx).Order("priority asc, id asc").Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

func (s *Service) CreateParsingRule(ctx context.Context, payload ParsingRulePayload) (LogParsingRule, error) {
	if s == nil || s.db == nil {
		return LogParsingRule{}, fmt.Errorf("database not initialized")
	}
	if strings.TrimSpace(payload.Name) == "" || strings.TrimSpace(payload.Vendor) == "" || strings.TrimSpace(payload.Pattern) == "" {
		return LogParsingRule{}, fmt.Errorf("name, vendor and pattern are required")
	}

	isActive := true
	if payload.IsActive != nil {
		isActive = *payload.IsActive
	}
	priority := 100
	if payload.Priority != nil {
		priority = *payload.Priority
	}

	now := time.Now().UTC()
	rule := LogParsingRule{
		Name:            strings.TrimSpace(payload.Name),
		Description:     payload.Description,
		Vendor:          strings.TrimSpace(payload.Vendor),
		DeviceType:      payload.DeviceType,
		Pattern:         payload.Pattern,
		LevelMapping:    payload.LevelMapping,
		FacilityMapping: payload.FacilityMapping,
		IsActive:        isActive,
		Priority:        priority,
		CreatedAt:       now,
		UpdatedAt:       now,
	}

	if err := s.db.WithContext(ctx).Create(&rule).Error; err != nil {
		return LogParsingRule{}, err
	}
	return rule, nil
}

func (s *Service) UpdateParsingRule(ctx context.Context, ruleID int, payload ParsingRulePayload) (LogParsingRule, error) {
	if s == nil || s.db == nil {
		return LogParsingRule{}, fmt.Errorf("database not initialized")
	}
	if ruleID <= 0 {
		return LogParsingRule{}, gorm.ErrRecordNotFound
	}

	updates := map[string]interface{}{}
	if payload.Name != "" {
		updates["name"] = strings.TrimSpace(payload.Name)
	}
	if payload.Description != nil {
		updates["description"] = payload.Description
	}
	if payload.Vendor != "" {
		updates["vendor"] = strings.TrimSpace(payload.Vendor)
	}
	if payload.DeviceType != nil {
		updates["device_type"] = payload.DeviceType
	}
	if payload.Pattern != "" {
		updates["pattern"] = payload.Pattern
	}
	if payload.LevelMapping != nil {
		updates["level_mapping"] = payload.LevelMapping
	}
	if payload.FacilityMapping != nil {
		updates["facility_mapping"] = payload.FacilityMapping
	}
	if payload.IsActive != nil {
		updates["is_active"] = *payload.IsActive
	}
	if payload.Priority != nil {
		updates["priority"] = *payload.Priority
	}

	if len(updates) == 0 {
		return s.GetParsingRule(ctx, ruleID)
	}
	updates["updated_at"] = time.Now().UTC()

	if err := s.db.WithContext(ctx).
		Table("log_parsing_rules").
		Where("id = ?", ruleID).
		Updates(updates).Error; err != nil {
		return LogParsingRule{}, err
	}

	return s.GetParsingRule(ctx, ruleID)
}

func (s *Service) DeleteParsingRule(ctx context.Context, ruleID int) (bool, error) {
	if s == nil || s.db == nil {
		return false, fmt.Errorf("database not initialized")
	}
	if ruleID <= 0 {
		return false, nil
	}

	result := s.db.WithContext(ctx).
		Table("log_parsing_rules").
		Where("id = ?", ruleID).
		Delete(&LogParsingRule{})
	if result.Error != nil {
		return false, result.Error
	}
	return result.RowsAffected > 0, nil
}

func (s *Service) GetParsingRule(ctx context.Context, ruleID int) (LogParsingRule, error) {
	if s == nil || s.db == nil {
		return LogParsingRule{}, fmt.Errorf("database not initialized")
	}

	var rule LogParsingRule
	err := s.db.WithContext(ctx).Table("log_parsing_rules").Where("id = ?", ruleID).Take(&rule).Error
	if err != nil {
		return LogParsingRule{}, err
	}
	return rule, nil
}

func (s *Service) buildLogQuery(ctx context.Context, filter LogFilter) *gorm.DB {
	query := s.db.WithContext(ctx).
		Table("device_logs AS l").
		Select("l.*, d.name AS device_name, d.ip_address AS device_ip").
		Joins("LEFT JOIN devices d ON d.id = l.device_id")

	if filter.DeviceID != nil {
		query = query.Where("l.device_id = ?", *filter.DeviceID)
	}
	if filter.Level != nil && strings.TrimSpace(*filter.Level) != "" {
		query = query.Where("l.level = ?", strings.TrimSpace(*filter.Level))
	}
	if filter.Facility != nil && strings.TrimSpace(*filter.Facility) != "" {
		query = query.Where("l.facility = ?", strings.TrimSpace(*filter.Facility))
	}
	if filter.Source != nil && strings.TrimSpace(*filter.Source) != "" {
		query = query.Where("l.source = ?", strings.TrimSpace(*filter.Source))
	}
	if filter.StartTime != nil {
		query = query.Where("l.log_timestamp >= ?", *filter.StartTime)
	}
	if filter.EndTime != nil {
		query = query.Where("l.log_timestamp <= ?", *filter.EndTime)
	}
	if filter.Search != nil && strings.TrimSpace(*filter.Search) != "" {
		pattern := "%" + strings.TrimSpace(*filter.Search) + "%"
		query = query.Where("(l.message ILIKE ? OR l.raw_message ILIKE ?)", pattern, pattern)
	}

	return query
}

func normalizeFilter(filter LogFilter) LogFilter {
	if filter.Limit <= 0 {
		filter.Limit = defaultLogLimit
	}
	if filter.Limit > maxLogLimit {
		filter.Limit = maxLogLimit
	}
	if filter.Skip < 0 {
		filter.Skip = 0
	}

	if filter.DeviceID == nil && filter.StartTime == nil && filter.EndTime == nil {
		start := time.Now().Add(-24 * time.Hour)
		filter.StartTime = &start
	}

	return filter
}

func parseNullString(raw sql.NullString) *string {
	if !raw.Valid {
		return nil
	}
	value := strings.TrimSpace(raw.String)
	if value == "" {
		return nil
	}
	return &value
}

func parseNullTime(raw sql.NullTime) *time.Time {
	if !raw.Valid {
		return nil
	}
	value := raw.Time
	return &value
}

var (
	ErrDeviceNotFound     = errors.New("device not found")
	ErrSSHNotConfigured   = errors.New("ssh credentials not configured")
	ErrDeviceIPRequired   = errors.New("device ip required")
	ErrCollectionCanceled = errors.New("log collection canceled")
)

type BatchCollectResult struct {
	Collected map[int]int
	Failed    map[int]string
}

type deviceInfo struct {
	ID          int
	IPAddress   string
	Vendor      string
	SshUsername string
	SshPassword string
	SshPort     int
}

func (s *Service) CollectDeviceLogs(ctx context.Context, deviceID int, logType string, maxEntries int) (int, error) {
	if s == nil || s.db == nil {
		return 0, fmt.Errorf("database not initialized")
	}
	if deviceID <= 0 {
		return 0, fmt.Errorf("invalid device_id")
	}

	logType = normalizeLogType(logType)
	maxEntries = normalizeMaxEntries(maxEntries)

	info, err := s.getDeviceInfo(ctx, deviceID)
	if err != nil {
		return 0, err
	}
	if strings.TrimSpace(info.IPAddress) == "" {
		return 0, ErrDeviceIPRequired
	}
	if strings.TrimSpace(info.SshUsername) == "" || strings.TrimSpace(info.SshPassword) == "" {
		return 0, ErrSSHNotConfigured
	}

	collector := NewSSHCollector()
	entries, err := collector.Collect(ctx, info, logType, maxEntries)
	if err != nil {
		return 0, err
	}
	if len(entries) == 0 {
		return 0, nil
	}

	return s.storeLogEntries(ctx, entries)
}

func (s *Service) BatchCollectLogs(ctx context.Context, deviceIDs []int, logType string, maxEntries int, maxConcurrent int) (BatchCollectResult, error) {
	result := BatchCollectResult{
		Collected: map[int]int{},
		Failed:    map[int]string{},
	}

	if s == nil || s.db == nil {
		return result, fmt.Errorf("database not initialized")
	}
	if len(deviceIDs) == 0 {
		return result, nil
	}

	logType = normalizeLogType(logType)
	maxEntries = normalizeMaxEntries(maxEntries)
	if maxConcurrent <= 0 {
		maxConcurrent = 5
	}
	if maxConcurrent > len(deviceIDs) {
		maxConcurrent = len(deviceIDs)
	}

	jobs := make(chan int, len(deviceIDs))
	var wg sync.WaitGroup
	var mu sync.Mutex

	worker := func() {
		defer wg.Done()
		for id := range jobs {
			count, err := s.CollectDeviceLogs(ctx, id, logType, maxEntries)
			mu.Lock()
			if err != nil {
				result.Failed[id] = err.Error()
			} else {
				result.Collected[id] = count
			}
			mu.Unlock()
		}
	}

	for i := 0; i < maxConcurrent; i++ {
		wg.Add(1)
		go worker()
	}

	for _, id := range deviceIDs {
		jobs <- id
	}
	close(jobs)
	wg.Wait()

	return result, nil
}

func (s *Service) getDeviceInfo(ctx context.Context, deviceID int) (deviceInfo, error) {
	type row struct {
		ID          int     `gorm:"column:id"`
		IPAddress   string  `gorm:"column:ip_address"`
		Vendor      string  `gorm:"column:vendor"`
		SshUsername *string `gorm:"column:ssh_username"`
		SshPassword *string `gorm:"column:ssh_password"`
		SshPort     *int    `gorm:"column:ssh_port"`
	}

	var item row
	err := s.db.WithContext(ctx).
		Table("devices").
		Select("id, ip_address, vendor, ssh_username, ssh_password, ssh_port").
		Where("id = ?", deviceID).
		Take(&item).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return deviceInfo{}, ErrDeviceNotFound
		}
		return deviceInfo{}, err
	}

	port := 22
	if item.SshPort != nil && *item.SshPort > 0 {
		port = *item.SshPort
	}

	return deviceInfo{
		ID:          item.ID,
		IPAddress:   item.IPAddress,
		Vendor:      item.Vendor,
		SshUsername: safeString(item.SshUsername),
		SshPassword: safeString(item.SshPassword),
		SshPort:     port,
	}, nil
}

func (s *Service) storeLogEntries(ctx context.Context, entries []logEntry) (int, error) {
	if len(entries) == 0 {
		return 0, nil
	}

	records := make([]DeviceLog, 0, len(entries))
	for _, entry := range entries {
		collectedAt := entry.CollectedAt
		if collectedAt.IsZero() {
			collectedAt = time.Now().UTC()
		}
		logTimestamp := entry.LogTimestamp
		if logTimestamp.IsZero() {
			logTimestamp = collectedAt
		}

		record := DeviceLog{
			DeviceID:     entry.DeviceID,
			Level:        normalizeLevel(entry.Level),
			Facility:     normalizeFacility(entry.Facility),
			Source:       normalizeSource(entry.Source),
			Message:      entry.Message,
			LogTimestamp: logTimestamp,
			CollectedAt:  collectedAt,
			CreatedAt:    collectedAt,
		}

		if entry.RawMessage != "" {
			raw := entry.RawMessage
			record.RawMessage = &raw
		}
		if entry.SourceIP != nil && strings.TrimSpace(*entry.SourceIP) != "" {
			value := strings.TrimSpace(*entry.SourceIP)
			record.SourceIP = &value
		}
		if entry.SourceProcess != nil && strings.TrimSpace(*entry.SourceProcess) != "" {
			value := strings.TrimSpace(*entry.SourceProcess)
			record.SourceProcess = &value
		}

		records = append(records, record)
	}

	if err := s.db.WithContext(ctx).Create(&records).Error; err != nil {
		return 0, err
	}

	return len(records), nil
}

func normalizeLogType(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "system", "interface", "security", "recent", "trap", "alarm":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return "system"
	}
}

func normalizeMaxEntries(value int) int {
	if value <= 0 {
		return 100
	}
	if value > 1000 {
		return 1000
	}
	return value
}

func normalizeLevel(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "critical", "error", "warning", "info", "debug":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return "info"
	}
}

func normalizeFacility(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "system", "interface", "security", "routing", "switching", "snmp", "ssh", "other":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return "system"
	}
}

func normalizeSource(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "ssh", "syslog", "snmp_trap", "manual":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return "ssh"
	}
}

func safeString(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}
