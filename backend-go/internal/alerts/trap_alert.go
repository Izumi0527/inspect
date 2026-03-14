package alerts

import (
	"context"
	"fmt"
	"strings"
	"time"

	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/ws"
)

// TrapAlertBridge 将 SNMP Trap 转换为告警记录
// 实现 logs.TrapAlertCreator 接口
type TrapAlertBridge struct {
	db        *gorm.DB
	wsManager *ws.Manager
	logger    *zap.Logger
}

// NewTrapAlertBridge 创建 Trap 告警桥接器
func NewTrapAlertBridge(db *gorm.DB, wsManager *ws.Manager, logger *zap.Logger) *TrapAlertBridge {
	return &TrapAlertBridge{
		db:        db,
		wsManager: wsManager,
		logger:    logger,
	}
}

// CreateTrapAlert 根据 SNMP Trap 创建告警
func (b *TrapAlertBridge) CreateTrapAlert(
	ctx context.Context,
	deviceID int,
	level string,
	facility string,
	message string,
	trapOID string,
	sourceIP string,
) error {
	if b == nil || b.db == nil {
		return fmt.Errorf("trap alert bridge not initialized")
	}

	severity := mapTrapLevelToSeverity(level)
	category := mapTrapFacilityToCategory(facility)

	// 查找设备名称
	deviceName := sourceIP
	var nameRow struct {
		Name string `gorm:"column:name"`
	}
	if err := b.db.WithContext(ctx).Table("devices").
		Select("name").Where("id = ?", deviceID).
		Take(&nameRow).Error; err == nil && nameRow.Name != "" {
		deviceName = nameRow.Name
	}

	// 检查是否已有相同 Trap OID + 设备的活跃告警（防止重复）
	var existing Alert
	dedupeQuery := b.db.WithContext(ctx).
		Table("alerts").
		Where("device_id = ? AND category = ? AND status IN ?",
			deviceID, category, []string{alertStatusOpen, alertStatusAcknowledged})

	if trapOID != "" {
		dedupeQuery = dedupeQuery.Where("title LIKE ?", "%"+truncateOID(trapOID)+"%")
	}

	err := dedupeQuery.Order("last_occurred DESC").Take(&existing).Error
	if err == nil {
		// 已有活跃告警，更新发生次数
		now := time.Now().UTC()
		return b.db.WithContext(ctx).
			Table("alerts").
			Where("id = ?", existing.ID).
			Updates(map[string]interface{}{
				"last_occurred":    now,
				"message":          message,
				"occurrence_count": gorm.Expr("COALESCE(occurrence_count, 0) + 1"),
				"updated_at":       now,
			}).Error
	}

	// 创建新告警
	now := time.Now().UTC()
	occurrenceCount := 1
	title := buildTrapAlertTitle(severity, deviceName, trapOID, facility)

	alert := Alert{
		DeviceID:        deviceID,
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

	if err := b.db.WithContext(ctx).Table("alerts").Create(&alert).Error; err != nil {
		return fmt.Errorf("create trap alert: %w", err)
	}

	// WebSocket 推送
	if b.wsManager != nil {
		b.wsManager.SendToRoom("alerts", ws.Message{
			Type: ws.MessageAlert,
			Data: map[string]interface{}{
				"id":        alert.ID,
				"device_id": deviceID,
				"device":    deviceName,
				"title":     title,
				"message":   message,
				"severity":  severity,
				"category":  category,
				"status":    "active",
				"timestamp": now.Format(time.RFC3339),
				"source":    "snmp_trap",
			},
		})
	}

	if b.logger != nil {
		b.logger.Info("SNMP Trap alert created",
			zap.Int("alert_id", alert.ID),
			zap.Int("device_id", deviceID),
			zap.String("severity", severity),
			zap.String("category", category),
			zap.String("trap_oid", trapOID))
	}

	return nil
}

func mapTrapLevelToSeverity(level string) string {
	switch strings.ToLower(strings.TrimSpace(level)) {
	case "critical", "emergency", "fatal":
		return "critical"
	case "error", "warning":
		return "warning"
	default:
		return "info"
	}
}

func mapTrapFacilityToCategory(facility string) string {
	switch strings.ToLower(strings.TrimSpace(facility)) {
	case "interface":
		return "connectivity"
	case "security":
		return "security"
	case "routing", "switching":
		return "performance"
	case "hardware", "environment":
		return "hardware"
	case "configuration", "config":
		return "configuration"
	default:
		return "other"
	}
}

func buildTrapAlertTitle(severity string, deviceName string, trapOID string, facility string) string {
	facilityLabel := mapFacilityLabel(facility)
	oidSuffix := ""
	if trapOID != "" {
		oidSuffix = " (" + truncateOID(trapOID) + ")"
	}
	return fmt.Sprintf("[%s] %s - SNMP Trap %s%s",
		strings.ToUpper(severity), deviceName, facilityLabel, oidSuffix)
}

func mapFacilityLabel(facility string) string {
	switch strings.ToLower(strings.TrimSpace(facility)) {
	case "interface":
		return "接口告警"
	case "security":
		return "安全告警"
	case "routing":
		return "路由告警"
	case "switching":
		return "交换告警"
	case "system":
		return "系统告警"
	case "snmp":
		return "SNMP告警"
	default:
		return "设备告警"
	}
}

func truncateOID(oid string) string {
	if len(oid) > 40 {
		return oid[:40] + "..."
	}
	return oid
}
