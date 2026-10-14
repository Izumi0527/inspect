package alerts

import (
	"context"
	"fmt"
	"strings"
	"time"

	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/sshutil"
	"github.com/your-org/inspect-system/backend-go/internal/ws"
)

// SSH 主机密钥指纹变化告警的固定字段：
// metric_name 是类型标记——Resolve 按它精确匹配，不依赖会随设备改名漂移的 title 文本。
const (
	hostKeyAlertMetric   = "ssh_host_key_fingerprint"
	hostKeyAlertCategory = "security"
)

// HostKeyAlertStore 抽象指纹告警的持久化层，便于在不依赖真实数据库的情况下回归测试。
type HostKeyAlertStore interface {
	GetDeviceName(ctx context.Context, deviceID int) (string, error)
	FindActiveAlertByTitle(ctx context.Context, deviceID int, category string, title string) (*Alert, error)
	CreateAlert(ctx context.Context, alert Alert) (int, error)
	UpdateAlertOccurrence(ctx context.Context, alertID int, message string, occurredAt time.Time) error
	ResolveActiveByMetric(ctx context.Context, deviceID int, metricName string, resolvedAt time.Time) ([]int, error)
}

// SSHHostKeyAlertBridge 把 TOFU 主机密钥指纹变化转为系统告警。
// 实现 sshutil.HostKeyAlertNotifier：任一 SSH 连接点（日志采集/连接测试/配置备份/巡检）
// 校验失败都会产生（或累计）一条活跃告警；重置指纹记录后自动解除。
type SSHHostKeyAlertBridge struct {
	store     HostKeyAlertStore
	wsManager *ws.Manager
	logger    *zap.Logger
	now       func() time.Time
}

func NewSSHHostKeyAlertBridge(db *gorm.DB, wsManager *ws.Manager, logger *zap.Logger) *SSHHostKeyAlertBridge {
	return NewSSHHostKeyAlertBridgeWithDeps(
		gormHostKeyAlertStore{gormSyslogAlertStore{db: db}},
		wsManager,
		logger,
	)
}

// NewSSHHostKeyAlertBridgeWithDeps 用于测试注入（store 可为 fake 实现）。
func NewSSHHostKeyAlertBridgeWithDeps(store HostKeyAlertStore, wsManager *ws.Manager, logger *zap.Logger) *SSHHostKeyAlertBridge {
	return &SSHHostKeyAlertBridge{
		store:     store,
		wsManager: wsManager,
		logger:    logger,
		now:       func() time.Time { return time.Now().UTC() },
	}
}

// NotifyHostKeyMismatch 产生或累计一条指纹变化告警。
// 同一设备已有活跃告警时只累计次数与最近消息——日志采集每轮失败都会调用本方法，
// 去重保证不会刷屏。
func (b *SSHHostKeyAlertBridge) NotifyHostKeyMismatch(ctx context.Context, mismatch sshutil.HostKeyMismatch) error {
	if b == nil || b.store == nil {
		return fmt.Errorf("ssh host key alert bridge not initialized")
	}
	if ctx == nil {
		ctx = context.Background()
	}
	if mismatch.DeviceID <= 0 {
		return fmt.Errorf("device_id is required")
	}

	deviceName := b.resolveDeviceName(ctx, mismatch.DeviceID)
	title := buildHostKeyAlertTitle(deviceName)
	message := buildHostKeyAlertMessage(deviceName, mismatch)
	now := b.now().UTC()

	existing, err := b.store.FindActiveAlertByTitle(ctx, mismatch.DeviceID, hostKeyAlertCategory, title)
	if err != nil {
		return err
	}
	if existing != nil && existing.ID > 0 {
		return b.store.UpdateAlertOccurrence(ctx, existing.ID, message, now)
	}

	metricName := hostKeyAlertMetric
	occurrenceCount := 1
	alert := Alert{
		DeviceID:        mismatch.DeviceID,
		Title:           title,
		Message:         message,
		Category:        hostKeyAlertCategory,
		Severity:        "warning",
		Status:          alertStatusOpen,
		MetricName:      &metricName,
		FirstOccurred:   &now,
		LastOccurred:    &now,
		OccurrenceCount: &occurrenceCount,
		CreatedAt:       &now,
		UpdatedAt:       &now,
	}

	id, err := b.store.CreateAlert(ctx, alert)
	if err != nil {
		return err
	}
	alert.ID = id

	b.broadcastActive(alert, deviceName, now)

	if b.logger != nil {
		b.logger.Info("SSH 主机密钥指纹变化告警已创建",
			zap.Int("alert_id", id),
			zap.Int("device_id", mismatch.DeviceID),
			zap.String("recorded_algorithm", mismatch.RecordedAlgorithm),
			zap.String("current_algorithm", mismatch.CurrentAlgorithm))
	}
	return nil
}

// ResolveHostKeyMismatch 解除该设备全部活跃的指纹变化告警（重置指纹记录后调用），
// 并对每条被解除的告警推送 resolved 广播（与手动处理告警的前端契约一致）。
func (b *SSHHostKeyAlertBridge) ResolveHostKeyMismatch(ctx context.Context, deviceID int) error {
	if b == nil || b.store == nil {
		return fmt.Errorf("ssh host key alert bridge not initialized")
	}
	if ctx == nil {
		ctx = context.Background()
	}
	if deviceID <= 0 {
		return fmt.Errorf("device_id is required")
	}

	now := b.now().UTC()
	resolvedIDs, err := b.store.ResolveActiveByMetric(ctx, deviceID, hostKeyAlertMetric, now)
	if err != nil {
		return err
	}
	for _, id := range resolvedIDs {
		b.broadcastResolved(id, now)
	}
	if len(resolvedIDs) > 0 && b.logger != nil {
		b.logger.Info("SSH 主机密钥指纹变化告警已解除",
			zap.Int("device_id", deviceID),
			zap.Int("resolved_count", len(resolvedIDs)))
	}
	return nil
}

func (b *SSHHostKeyAlertBridge) resolveDeviceName(ctx context.Context, deviceID int) string {
	if name, err := b.store.GetDeviceName(ctx, deviceID); err == nil {
		if trimmed := strings.TrimSpace(name); trimmed != "" {
			return trimmed
		}
	}
	return fmt.Sprintf("device-%d", deviceID)
}

func buildHostKeyAlertTitle(deviceName string) string {
	return fmt.Sprintf("[WARNING] %s - SSH 主机密钥指纹变化", deviceName)
}

func buildHostKeyAlertMessage(deviceName string, mismatch sshutil.HostKeyMismatch) string {
	return fmt.Sprintf("设备 %s 的 SSH 主机密钥指纹发生变化（记录: %s（%s），当前: %s（%s）），SSH 连接已拒绝；若确认为合法变更，请在设备详情页重置主机密钥指纹。",
		deviceName,
		mismatch.RecordedFingerprint, mismatch.RecordedAlgorithm,
		mismatch.CurrentFingerprint, mismatch.CurrentAlgorithm)
}

func (b *SSHHostKeyAlertBridge) broadcastActive(alert Alert, deviceName string, now time.Time) {
	if b.wsManager == nil {
		return
	}
	b.wsManager.SendToRoom("alerts", ws.Message{
		Type: ws.MessageAlert,
		Data: map[string]interface{}{
			"id":        alert.ID,
			"device_id": alert.DeviceID,
			"device":    deviceName,
			"title":     alert.Title,
			"message":   alert.Message,
			"severity":  alert.Severity,
			"category":  alert.Category,
			"status":    "active",
			"timestamp": now.Format(time.RFC3339),
			"source":    "ssh_hostkey",
		},
	})
}

func (b *SSHHostKeyAlertBridge) broadcastResolved(alertID int, now time.Time) {
	if b.wsManager == nil {
		return
	}
	b.wsManager.SendToRoom("alerts", ws.Message{
		Type: ws.MessageAlert,
		Data: map[string]interface{}{
			"id":        alertID,
			"status":    alertStatusResolved,
			"timestamp": now.Format(time.RFC3339),
		},
	})
}

// gormHostKeyAlertStore 复用 syslog 告警的查询/写入实现，仅补充按 metric 解除告警。
type gormHostKeyAlertStore struct {
	gormSyslogAlertStore
}

// ResolveActiveByMetric 解除设备全部活跃的指定类型告警并返回被解除的告警 ID
// （用于逐条推送 resolved 广播）。
func (s gormHostKeyAlertStore) ResolveActiveByMetric(ctx context.Context, deviceID int, metricName string, resolvedAt time.Time) ([]int, error) {
	if s.db == nil {
		return nil, fmt.Errorf("db not configured")
	}
	var ids []int
	err := s.db.WithContext(ctx).Raw(
		`UPDATE alerts SET status = ?, resolved_at = ?, updated_at = ? `+
			`WHERE device_id = ? AND metric_name = ? AND status IN ? RETURNING id`,
		alertStatusResolved, resolvedAt, resolvedAt,
		deviceID, metricName, []string{alertStatusOpen, alertStatusAcknowledged},
	).Scan(&ids).Error
	if err != nil {
		return nil, err
	}
	return ids, nil
}
