package settings

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"
)

// AuditEntry 描述一条待写入的审计日志。
// Action 取值与前端 actionLabels 对齐：
// login / logout / create / update / delete / export / import / config_change
type AuditEntry struct {
	UserID       string
	Action       string
	ResourceType string
	ResourceID   string
	Description  string
	IPAddress    string
	UserAgent    string
	Status       string // success / failed
	ErrorMessage string
}

// RecordAuditLog 尽力而为写入审计日志：失败仅记录告警，绝不向调用方冒错或 panic，
// 保证审计落库故障不阻断任何业务请求。
func (s *Service) RecordAuditLog(ctx context.Context, entry AuditEntry) {
	if s == nil || !s.isReady() {
		return
	}

	defer func() {
		if r := recover(); r != nil && s.logger != nil {
			s.logger.Warn("record audit log panicked", zap.Any("recover", r))
		}
	}()

	now := time.Now().UTC()
	row := AuditLog{
		ID:           uuid.NewString(),
		UserID:       optionalAuditString(entry.UserID),
		Action:       strings.TrimSpace(entry.Action),
		ResourceType: strings.TrimSpace(entry.ResourceType),
		ResourceID:   optionalAuditString(entry.ResourceID),
		Description:  entry.Description,
		IPAddress:    optionalAuditString(entry.IPAddress),
		UserAgent:    optionalAuditString(entry.UserAgent),
		Status:       strings.TrimSpace(entry.Status),
		ErrorMessage: optionalAuditString(entry.ErrorMessage),
		CreatedAt:    &now,
	}

	if err := s.db.WithContext(ctx).Create(&row).Error; err != nil && s.logger != nil {
		s.logger.Warn("failed to record audit log",
			zap.String("action", row.Action),
			zap.String("resource_type", row.ResourceType),
			zap.Error(err))
	}
}

func optionalAuditString(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}
