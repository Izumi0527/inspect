package settings

import (
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"
)

func normalizeCategoryFromKey(key string) string {
	value := strings.TrimSpace(key)
	if value == "" {
		return "system"
	}
	parts := strings.Split(value, ".")
	if len(parts) == 0 {
		return "system"
	}
	category := strings.TrimSpace(parts[0])
	if category == "" {
		return "system"
	}
	switch category {
	case "system", "notification", "email", "inspection", "report", "logs", "security", "backup", "user_preference":
		return category
	default:
		return "system"
	}
}

func inferDataType(value interface{}) string {
	switch value.(type) {
	case bool:
		return "boolean"
	case int, int32, int64:
		return "integer"
	case float32, float64:
		return "float"
	case []interface{}, map[string]interface{}:
		return "json"
	default:
		return "string"
	}
}

func formatSettingValue(value interface{}, dataType string) (*string, error) {
	if value == nil {
		return nil, nil
	}

	switch dataType {
	case "boolean":
		if v, ok := value.(bool); ok {
			text := strconv.FormatBool(v)
			return &text, nil
		}
	case "integer":
		if v, ok := asInt64(value); ok {
			text := strconv.FormatInt(v, 10)
			return &text, nil
		}
	case "float":
		if v, ok := asFloat64(value); ok {
			text := strconv.FormatFloat(v, 'f', -1, 64)
			return &text, nil
		}
	case "json":
		if v, ok := value.(string); ok {
			trimmed := strings.TrimSpace(v)
			if trimmed != "" {
				if json.Valid([]byte(trimmed)) {
					return &trimmed, nil
				}
			}
		}
		payload, err := json.Marshal(value)
		if err != nil {
			return nil, err
		}
		text := string(payload)
		return &text, nil
	case "text", "string":
		text := fmt.Sprint(value)
		return &text, nil
	default:
		text := fmt.Sprint(value)
		return &text, nil
	}

	text := fmt.Sprint(value)
	return &text, nil
}

func parseSettingValue(raw *string, dataType string) interface{} {
	if raw == nil {
		return nil
	}
	value := strings.TrimSpace(*raw)
	if value == "" {
		return ""
	}

	switch dataType {
	case "boolean":
		if parsed, err := strconv.ParseBool(value); err == nil {
			return parsed
		}
	case "integer":
		if parsed, err := strconv.ParseInt(value, 10, 64); err == nil {
			return parsed
		}
	case "float":
		if parsed, err := strconv.ParseFloat(value, 64); err == nil {
			return parsed
		}
	case "json":
		var result interface{}
		if err := json.Unmarshal([]byte(value), &result); err == nil {
			return result
		}
	case "text", "string":
		return value
	default:
		return value
	}

	return value
}

func asInt64(value interface{}) (int64, bool) {
	switch v := value.(type) {
	case int:
		return int64(v), true
	case int32:
		return int64(v), true
	case int64:
		return v, true
	case float64:
		return int64(v), true
	case float32:
		return int64(v), true
	case string:
		if parsed, err := strconv.ParseInt(strings.TrimSpace(v), 10, 64); err == nil {
			return parsed, true
		}
	}
	return 0, false
}

func asFloat64(value interface{}) (float64, bool) {
	switch v := value.(type) {
	case float64:
		return v, true
	case float32:
		return float64(v), true
	case int:
		return float64(v), true
	case int32:
		return float64(v), true
	case int64:
		return float64(v), true
	case string:
		if parsed, err := strconv.ParseFloat(strings.TrimSpace(v), 64); err == nil {
			return parsed, true
		}
	}
	return 0, false
}

func generateSettingID(key string) string {
	hash := md5.Sum([]byte(key))
	return hex.EncodeToString(hash[:])[:16]
}

func generateSettingLabel(key string) string {
	labelMap := map[string]string{
		"system.application_name": "应用程序名称",
		"system.version":          "系统版本",
		"system.timezone":         "时区",
		"system.session_timeout":  "会话超时",
		"notification.email_enabled": "启用邮件通知",
		"notification.levels":        "通知级别",
		"email.smtp_server":          "SMTP服务器",
		"email.smtp_port":            "SMTP端口",
		"email.smtp_username":        "SMTP用户名",
		"email.smtp_password":        "SMTP密码",
		"email.use_tls":              "使用TLS",
		"email.use_ssl":              "使用SSL",
		"email.sender_name":          "发件人名称",
		"email.sender_email":         "发件人邮箱",
		"inspection.max_concurrent_tasks": "最大并发任务数",
		"inspection.default_timeout":       "默认超时时间",
		"inspection.retry_attempts":        "重试次数",
		"report.default_format":            "默认报表格式",
		"report.max_export_records":        "最大导出记录数",
		"logs.auto_cleanup_enabled":        "启用日志自动清理",
		"logs.retention_days":              "设备日志保留天数",
		"security.password.min_length":     "密码最小长度",
		"security.password.max_login_attempts": "最大登录尝试次数",
		"backup.auto_backup_enabled":           "启用自动备份",
		"backup.retention_days":                "备份保留天数",
	}
	if label, ok := labelMap[key]; ok {
		return label
	}

	parts := strings.Split(key, ".")
	if len(parts) == 0 {
		return key
	}
	name := parts[len(parts)-1]
	name = strings.ReplaceAll(name, "_", " ")
	return strings.Title(name)
}

func isSettingReadonly(key string) bool {
	switch key {
	case "system.version", "system.application_name":
		return true
	default:
		return false
	}
}

type ValidationRule struct {
	Min     *float64       `json:"min,omitempty"`
	Max     *float64       `json:"max,omitempty"`
	Pattern *string        `json:"pattern,omitempty"`
	Options []LabelValue   `json:"options,omitempty"`
}

type LabelValue struct {
	Label string      `json:"label"`
	Value interface{} `json:"value"`
}

func parseValidationRule(rule *string, dataType string) *ValidationRule {
	if rule == nil || strings.TrimSpace(*rule) == "" {
		return nil
	}
	text := strings.TrimSpace(*rule)

	result := ValidationRule{}
	if dataType == "integer" || dataType == "float" {
		if strings.Contains(text, ">=") {
			parts := strings.Split(text, ">=")
			if len(parts) > 1 {
				chunk := strings.Split(parts[1], ",")[0]
				if val, err := strconv.ParseFloat(strings.TrimSpace(chunk), 64); err == nil {
					result.Min = &val
				}
			}
		}
		if strings.Contains(text, "<=") {
			parts := strings.Split(text, "<=")
			if len(parts) > 1 {
				chunk := strings.Split(parts[1], ",")[0]
				if val, err := strconv.ParseFloat(strings.TrimSpace(chunk), 64); err == nil {
					result.Max = &val
				}
			}
		}
	} else if dataType == "string" {
		if strings.HasPrefix(text, "^") {
			result.Pattern = &text
		} else if strings.Contains(text, ",") {
			options := make([]LabelValue, 0)
			for _, item := range strings.Split(text, ",") {
				value := strings.TrimSpace(item)
				if value == "" {
					continue
				}
				options = append(options, LabelValue{Label: value, Value: value})
			}
			result.Options = options
		}
	}

	if result.Min == nil && result.Max == nil && result.Pattern == nil && len(result.Options) == 0 {
		return nil
	}
	return &result
}

func parseTimeValue(value string) (time.Time, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return time.Time{}, fmt.Errorf("time value is empty")
	}

	formats := []string{
		time.RFC3339,
		"2006-01-02 15:04:05",
		"2006-01-02",
	}
	for _, format := range formats {
		if parsed, err := time.Parse(format, trimmed); err == nil {
			return parsed, nil
		}
	}

	return time.Time{}, fmt.Errorf("invalid time format")
}

func readString(payload map[string]interface{}, keys ...string) string {
	for _, key := range keys {
		if value, ok := payload[key]; ok {
			switch v := value.(type) {
			case string:
				if strings.TrimSpace(v) != "" {
					return strings.TrimSpace(v)
				}
			case fmt.Stringer:
				text := strings.TrimSpace(v.String())
				if text != "" {
					return text
				}
			}
		}
	}
	return ""
}

func readBool(payload map[string]interface{}, keys ...string) (bool, bool) {
	for _, key := range keys {
		if value, ok := payload[key]; ok {
			switch v := value.(type) {
			case bool:
				return v, true
			case string:
				if parsed, err := strconv.ParseBool(strings.TrimSpace(v)); err == nil {
					return parsed, true
				}
			}
		}
	}
	return false, false
}

func readInt(payload map[string]interface{}, keys ...string) (int, bool) {
	for _, key := range keys {
		if value, ok := payload[key]; ok {
			if parsed, ok := asInt64(value); ok {
				return int(parsed), true
			}
		}
	}
	return 0, false
}

func readStringSlice(payload map[string]interface{}, keys ...string) []string {
	for _, key := range keys {
		if value, ok := payload[key]; ok {
			switch v := value.(type) {
			case []interface{}:
				items := make([]string, 0, len(v))
				for _, item := range v {
					if text, ok := item.(string); ok {
						trimmed := strings.TrimSpace(text)
						if trimmed != "" {
							items = append(items, trimmed)
						}
					}
				}
				return items
			case []string:
				items := make([]string, 0, len(v))
				for _, item := range v {
					trimmed := strings.TrimSpace(item)
					if trimmed != "" {
						items = append(items, trimmed)
					}
				}
				return items
			}
		}
	}
	return []string{}
}
