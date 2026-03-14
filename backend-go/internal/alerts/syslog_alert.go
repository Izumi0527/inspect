package alerts

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/logs"
	"github.com/your-org/inspect-system/backend-go/internal/ws"
)

// SyslogAlertStore 抽象告警持久化层，便于在不依赖真实数据库的情况下进行回归测试。
type SyslogAlertStore interface {
	GetDeviceName(ctx context.Context, deviceID int) (string, error)
	FindActiveAlertByTitle(ctx context.Context, deviceID int, category string, title string) (*Alert, error)
	CreateAlert(ctx context.Context, alert Alert) (int, error)
	UpdateAlertOccurrence(ctx context.Context, alertID int, message string, occurredAt time.Time) error
}

// SyslogRateLimiter 用于对“新告警创建”做限流（防止告警风暴）。
// 注意：更新已有告警（去重命中）不应算作“新告警”。
type SyslogRateLimiter interface {
	AllowNew(ctx context.Context, deviceID int, maxPerMinute int) (bool, error)
}

// SyslogAlertBridge 将 Syslog 日志转换为告警记录。
// 实现 logs.SyslogAlertCreator 接口。
type SyslogAlertBridge struct {
	store     SyslogAlertStore
	limiter   SyslogRateLimiter
	wsManager *ws.Manager
	logger    *zap.Logger
	now       func() time.Time
}

func NewSyslogAlertBridge(db *gorm.DB, redisClient *redis.Client, wsManager *ws.Manager, logger *zap.Logger) *SyslogAlertBridge {
	return NewSyslogAlertBridgeWithDeps(
		gormSyslogAlertStore{db: db},
		&redisSyslogRateLimiter{client: redisClient, now: func() time.Time { return time.Now().UTC() }},
		wsManager,
		logger,
	)
}

// NewSyslogAlertBridgeWithDeps 用于测试注入（store/limiter 可为 fake 实现）。
func NewSyslogAlertBridgeWithDeps(store SyslogAlertStore, limiter SyslogRateLimiter, wsManager *ws.Manager, logger *zap.Logger) *SyslogAlertBridge {
	return &SyslogAlertBridge{
		store:     store,
		limiter:   limiter,
		wsManager: wsManager,
		logger:    logger,
		now:       func() time.Time { return time.Now().UTC() },
	}
}

func (b *SyslogAlertBridge) CreateSyslogAlert(ctx context.Context, input logs.SyslogAlertInput) (logs.SyslogAlertOutcome, error) {
	if b == nil || b.store == nil {
		return logs.SyslogAlertOutcomeNone, fmt.Errorf("syslog alert bridge not initialized")
	}
	if ctx == nil {
		ctx = context.Background()
	}
	if input.DeviceID <= 0 {
		return logs.SyslogAlertOutcomeNone, fmt.Errorf("device_id is required")
	}

	message := strings.TrimSpace(input.Message)
	if message == "" {
		return logs.SyslogAlertOutcomeNone, nil
	}

	facility := strings.ToLower(strings.TrimSpace(input.Facility))
	process := strings.TrimSpace(input.Process)
	severity := mapSyslogLevelToSeverity(input.Level)
	category := mapTrapFacilityToCategory(facility)

	deviceName := strings.TrimSpace(input.SourceIP)
	if name, err := b.store.GetDeviceName(ctx, input.DeviceID); err == nil {
		if trimmed := strings.TrimSpace(name); trimmed != "" {
			deviceName = trimmed
		}
	}
	if deviceName == "" {
		deviceName = fmt.Sprintf("device-%d", input.DeviceID)
	}

	title := buildSyslogAlertTitle(severity, deviceName, facility, process)

	// 先做去重：命中则更新次数，不计入“新告警”限流。
	existing, err := b.store.FindActiveAlertByTitle(ctx, input.DeviceID, category, title)
	if err != nil {
		return logs.SyslogAlertOutcomeNone, err
	}

	now := b.now().UTC()
	if existing != nil && existing.ID > 0 {
		if err := b.store.UpdateAlertOccurrence(ctx, existing.ID, message, now); err != nil {
			return logs.SyslogAlertOutcomeNone, err
		}
		return logs.SyslogAlertOutcomeUpdated, nil
	}

	// 限流：仅限制“新告警创建”。
	if b.limiter != nil && input.MaxNewPerMinute > 0 {
		allowed, err := b.limiter.AllowNew(ctx, input.DeviceID, input.MaxNewPerMinute)
		if err != nil && b.logger != nil {
			b.logger.Warn("Syslog告警限流器错误，已降级为放行", zap.Error(err))
		}
		if err == nil && !allowed {
			_ = b.upsertStormAlert(ctx, input.DeviceID, deviceName, input.MaxNewPerMinute, now)
			return logs.SyslogAlertOutcomeRateLimited, nil
		}
	}

	occurrenceCount := 1
	alert := Alert{
		DeviceID:        input.DeviceID,
		Title:           title,
		Message:         message,
		Category:        category,
		Severity:        severity,
		Status:          alertStatusOpen,
		FirstOccurred:   &now,
		LastOccurred:    &now,
		OccurrenceCount: &occurrenceCount,
		CreatedAt:       &now,
		UpdatedAt:       &now,
	}

	id, err := b.store.CreateAlert(ctx, alert)
	if err != nil {
		return logs.SyslogAlertOutcomeNone, err
	}
	alert.ID = id

	// WebSocket 推送（仅新建时推送，与 Trap 行为保持一致）
	if b.wsManager != nil {
		b.wsManager.SendToRoom("alerts", ws.Message{
			Type: ws.MessageAlert,
			Data: map[string]interface{}{
				"id":        alert.ID,
				"device_id": input.DeviceID,
				"device":    deviceName,
				"title":     title,
				"message":   message,
				"severity":  severity,
				"category":  category,
				"status":    "active",
				"timestamp": now.Format(time.RFC3339),
				"source":    "syslog",
			},
		})
	}

	if b.logger != nil {
		b.logger.Info("Syslog alert created",
			zap.Int("alert_id", alert.ID),
			zap.Int("device_id", input.DeviceID),
			zap.String("severity", severity),
			zap.String("category", category))
	}

	return logs.SyslogAlertOutcomeCreated, nil
}

func (b *SyslogAlertBridge) upsertStormAlert(ctx context.Context, deviceID int, deviceName string, maxPerMinute int, now time.Time) error {
	if b == nil || b.store == nil {
		return nil
	}
	if ctx == nil {
		ctx = context.Background()
	}

	category := "other"
	severity := "warning"
	title := fmt.Sprintf("[WARNING] %s - Syslog 告警风暴", deviceName)
	message := fmt.Sprintf("1 分钟内新 Syslog 告警超过限制（%d/分钟），已触发限流保护。", maxPerMinute)

	existing, err := b.store.FindActiveAlertByTitle(ctx, deviceID, category, title)
	if err != nil {
		return err
	}
	if existing != nil && existing.ID > 0 {
		return b.store.UpdateAlertOccurrence(ctx, existing.ID, message, now)
	}

	occ := 1
	alert := Alert{
		DeviceID:        deviceID,
		Title:           title,
		Message:         message,
		Category:        category,
		Severity:        severity,
		Status:          alertStatusOpen,
		FirstOccurred:   &now,
		LastOccurred:    &now,
		OccurrenceCount: &occ,
		CreatedAt:       &now,
		UpdatedAt:       &now,
	}

	id, err := b.store.CreateAlert(ctx, alert)
	if err != nil {
		return err
	}

	// 新建风暴告警也推送，方便前端即时提示。
	if b.wsManager != nil {
		b.wsManager.SendToRoom("alerts", ws.Message{
			Type: ws.MessageAlert,
			Data: map[string]interface{}{
				"id":        id,
				"device_id": deviceID,
				"device":    deviceName,
				"title":     title,
				"message":   message,
				"severity":  severity,
				"category":  category,
				"status":    "active",
				"timestamp": now.Format(time.RFC3339),
				"source":    "syslog",
			},
		})
	}

	if b.logger != nil {
		b.logger.Warn("Syslog alert storm rate-limited",
			zap.Int("device_id", deviceID),
			zap.Int("max_per_minute", maxPerMinute))
	}
	return nil
}

func mapSyslogLevelToSeverity(level string) string {
	switch strings.ToLower(strings.TrimSpace(level)) {
	case "critical":
		return "critical"
	case "error", "warning":
		return "warning"
	default:
		return "info"
	}
}

func buildSyslogAlertTitle(severity string, deviceName string, facility string, process string) string {
	facilityLabel := mapFacilityLabel(facility)
	procSuffix := ""
	if strings.TrimSpace(process) != "" {
		procSuffix = " (" + strings.TrimSpace(process) + ")"
	}
	return fmt.Sprintf("[%s] %s - Syslog %s%s",
		strings.ToUpper(severity), deviceName, facilityLabel, procSuffix)
}

type gormSyslogAlertStore struct {
	db *gorm.DB
}

func (s gormSyslogAlertStore) GetDeviceName(ctx context.Context, deviceID int) (string, error) {
	if s.db == nil {
		return "", fmt.Errorf("db not configured")
	}
	var row struct {
		Name string `gorm:"column:name"`
	}
	err := s.db.WithContext(ctx).Table("devices").
		Select("name").
		Where("id = ?", deviceID).
		Take(&row).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", nil
		}
		return "", err
	}
	return row.Name, nil
}

func (s gormSyslogAlertStore) FindActiveAlertByTitle(ctx context.Context, deviceID int, category string, title string) (*Alert, error) {
	if s.db == nil {
		return nil, fmt.Errorf("db not configured")
	}
	var existing Alert
	err := s.db.WithContext(ctx).
		Table("alerts").
		Where("device_id = ? AND category = ? AND title = ? AND status IN ?",
			deviceID, category, title, []string{alertStatusOpen, alertStatusAcknowledged}).
		Order("last_occurred DESC").
		Take(&existing).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &existing, nil
}

func (s gormSyslogAlertStore) CreateAlert(ctx context.Context, alert Alert) (int, error) {
	if s.db == nil {
		return 0, fmt.Errorf("db not configured")
	}
	record := alert
	if err := s.db.WithContext(ctx).Table("alerts").Create(&record).Error; err != nil {
		return 0, err
	}
	return record.ID, nil
}

func (s gormSyslogAlertStore) UpdateAlertOccurrence(ctx context.Context, alertID int, message string, occurredAt time.Time) error {
	if s.db == nil {
		return fmt.Errorf("db not configured")
	}
	return s.db.WithContext(ctx).
		Table("alerts").
		Where("id = ?", alertID).
		Updates(map[string]interface{}{
			"last_occurred":    occurredAt,
			"message":          message,
			"occurrence_count": gorm.Expr("COALESCE(occurrence_count, 0) + 1"),
			"updated_at":       occurredAt,
		}).Error
}

type redisSyslogRateLimiter struct {
	client *redis.Client
	now    func() time.Time
}

func (l *redisSyslogRateLimiter) AllowNew(ctx context.Context, deviceID int, maxPerMinute int) (bool, error) {
	if l == nil || l.client == nil || maxPerMinute <= 0 {
		return true, nil
	}
	if ctx == nil {
		ctx = context.Background()
	}
	now := time.Now().UTC()
	if l.now != nil {
		now = l.now().UTC()
	}
	minute := now.Unix() / 60
	key := fmt.Sprintf("syslog:alerts:new:%d:%d", deviceID, minute)

	n, err := l.client.Incr(ctx, key).Result()
	if err != nil {
		return true, err
	}
	if n == 1 {
		// TTL 略大于 60s，避免边界抖动导致的重复窗口。
		_ = l.client.Expire(ctx, key, 90*time.Second).Err()
	}
	return int(n) <= maxPerMinute, nil
}
