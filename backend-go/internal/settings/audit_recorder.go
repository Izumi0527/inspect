package settings

import (
	"context"
	"encoding/json"
	"reflect"
	"strings"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/datatypes"
)

const (
	maxAuditSanitizeDepth   = 64
	maxAuditDetailsJSONSize = 64 * 1024
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
	Details      interface{}
	IPAddress    string
	UserAgent    string
	Status       string // success / failed
	ErrorMessage string
}

var safeSNMPMetadataKeys = map[string]bool{
	"snmp_version":   true,
	"snmp_port":      true,
	"snmp_status":    true,
	"snmp_enabled":   true,
	"snmp_reachable": true,
	"snmp_timeout":   true,
	"snmp_retries":   true,
}

var sensitiveAuditKeyFragments = []string{
	"password",
	"passwd",
	"secret",
	"community",
	"token",
	"auth_pass",
	"priv_pass",
	"private_key",
	"passphrase",
	"credential",
	"api_key",
	"apikey",
	"access_key",
}

// SanitizeAuditDetails 递归过滤审计详情中的敏感凭据键（password/secret/community/token/
// auth_pass/priv_pass/snmp_* 等），确保审计表与日志绝不泄露任何密钥明文。
func SanitizeAuditDetails(raw interface{}) interface{} {
	if raw == nil {
		return nil
	}

	switch typed := raw.(type) {
	case datatypes.JSON:
		return sanitizeAuditRawBytes(typed)
	case []byte:
		return sanitizeAuditRawBytes(typed)
	case string:
		trimmed := strings.TrimSpace(typed)
		if trimmed == "" {
			return nil
		}
		if json.Valid([]byte(trimmed)) {
			return sanitizeAuditRawBytes([]byte(trimmed))
		}
		return trimmed
	case map[string]interface{}:
		return sanitizeAuditValue(typed)
	case []interface{}:
		return sanitizeAuditValue(typed)
	default:
		encoded, err := json.Marshal(typed)
		if err != nil {
			return nil
		}
		return sanitizeAuditRawBytes(encoded)
	}
}

// SanitizeAuditDetailsJSON 将审计详情脱敏并编码为 datatypes.JSON；为空或全凭据键时返回 nil。
func SanitizeAuditDetailsJSON(raw interface{}) datatypes.JSON {
	sanitized := SanitizeAuditDetails(raw)
	if sanitized == nil {
		return nil
	}
	encoded, err := json.Marshal(sanitized)
	if err != nil || len(encoded) == 0 || string(encoded) == "null" {
		return nil
	}
	if len(encoded) > maxAuditDetailsJSONSize {
		truncated, mErr := json.Marshal(map[string]interface{}{
			"truncated":    true,
			"originalSize": len(encoded),
		})
		if mErr != nil {
			return nil
		}
		return datatypes.JSON(truncated)
	}
	return datatypes.JSON(encoded)
}

func sanitizeAuditRawBytes(raw []byte) interface{} {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" || trimmed == "null" {
		return nil
	}
	var parsed interface{}
	if err := json.Unmarshal([]byte(trimmed), &parsed); err != nil {
		return nil
	}
	return sanitizeAuditValue(parsed)
}

func sanitizeAuditValue(value interface{}) interface{} {
	return sanitizeAuditValueWithGuard(value, 0, make(map[uintptr]bool))
}

func sanitizeAuditValueWithGuard(value interface{}, depth int, visited map[uintptr]bool) interface{} {
	if depth > maxAuditSanitizeDepth {
		return "[max-depth-truncated]"
	}
	switch typed := value.(type) {
	case map[string]interface{}:
		if len(typed) == 0 {
			return nil
		}
		ptr := reflect.ValueOf(typed).Pointer()
		if ptr != 0 {
			if visited[ptr] {
				return "[circular]"
			}
			visited[ptr] = true
			defer delete(visited, ptr)
		}
		return sanitizeAuditMap(typed, depth+1, visited)
	case []interface{}:
		if len(typed) == 0 {
			return []interface{}{}
		}
		ptr := reflect.ValueOf(typed).Pointer()
		if ptr != 0 {
			if visited[ptr] {
				return "[circular]"
			}
			visited[ptr] = true
			defer delete(visited, ptr)
		}
		return sanitizeAuditSlice(typed, depth+1, visited)
	default:
		return typed
	}
}

func sanitizeAuditMap(values map[string]interface{}, depth int, visited map[uintptr]bool) interface{} {
	if len(values) == 0 {
		return nil
	}
	out := make(map[string]interface{}, len(values))
	for key, val := range values {
		if isSensitiveAuditKey(key) {
			continue
		}
		out[key] = sanitizeAuditValueWithGuard(val, depth, visited)
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func sanitizeAuditSlice(items []interface{}, depth int, visited map[uintptr]bool) interface{} {
	if len(items) == 0 {
		return []interface{}{}
	}
	out := make([]interface{}, 0, len(items))
	for _, item := range items {
		out = append(out, sanitizeAuditValueWithGuard(item, depth, visited))
	}
	return out
}

func isSensitiveAuditKey(key string) bool {
	lower := strings.ToLower(strings.TrimSpace(key))
	if lower == "" {
		return false
	}
	if safeSNMPMetadataKeys[lower] {
		return false
	}
	if strings.HasPrefix(lower, "snmp_") {
		return true
	}
	for _, fragment := range sensitiveAuditKeyFragments {
		if strings.Contains(lower, fragment) {
			return true
		}
	}
	return false
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
		Details:      SanitizeAuditDetailsJSON(entry.Details),
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
