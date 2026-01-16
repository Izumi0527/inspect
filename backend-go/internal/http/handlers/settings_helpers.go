package handlers

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

func readString(payload map[string]interface{}, keys ...string) string {
	for _, key := range keys {
		if value, ok := payload[key]; ok {
			switch v := value.(type) {
			case string:
				if strings.TrimSpace(v) != "" {
					return strings.TrimSpace(v)
				}
			case []byte:
				text := strings.TrimSpace(string(v))
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
			switch v := value.(type) {
			case int:
				return v, true
			case int32:
				return int(v), true
			case int64:
				return int(v), true
			case float64:
				return int(v), true
			case float32:
				return int(v), true
			case string:
				if parsed, err := strconv.Atoi(strings.TrimSpace(v)); err == nil {
					return parsed, true
				}
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

func readStringMap(payload map[string]interface{}, keys ...string) map[string]string {
	for _, key := range keys {
		if value, ok := payload[key]; ok {
			switch v := value.(type) {
			case map[string]string:
				result := make(map[string]string, len(v))
				for k, item := range v {
					trimmed := strings.TrimSpace(item)
					if trimmed == "" {
						continue
					}
					result[k] = trimmed
				}
				return result
			case map[string]interface{}:
				result := make(map[string]string, len(v))
				for k, item := range v {
					if item == nil {
						continue
					}
					switch text := item.(type) {
					case string:
						trimmed := strings.TrimSpace(text)
						if trimmed == "" {
							continue
						}
						result[k] = trimmed
					default:
						result[k] = fmt.Sprint(item)
					}
				}
				return result
			}
		}
	}
	return map[string]string{}
}

func readInterfaceMap(payload map[string]interface{}, keys ...string) map[string]interface{} {
	for _, key := range keys {
		if value, ok := payload[key]; ok {
			switch v := value.(type) {
			case map[string]interface{}:
				return v
			case map[string]string:
				result := make(map[string]interface{}, len(v))
				for k, item := range v {
					result[k] = item
				}
				return result
			}
		}
	}
	return map[string]interface{}{}
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
