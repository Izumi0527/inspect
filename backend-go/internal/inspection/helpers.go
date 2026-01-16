package inspection

import (
	"encoding/json"
	"strings"

	"gorm.io/datatypes"
)

func encodeJSON(value interface{}) (datatypes.JSON, error) {
	if value == nil {
		return datatypes.JSON([]byte("null")), nil
	}
	payload, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	return datatypes.JSON(payload), nil
}

func decodeStringSlice(raw datatypes.JSON) []string {
	if len(raw) == 0 || string(raw) == "null" {
		return []string{}
	}
	var items []string
	if err := json.Unmarshal(raw, &items); err == nil {
		result := make([]string, 0, len(items))
		for _, item := range items {
			trimmed := strings.TrimSpace(item)
			if trimmed != "" {
				result = append(result, trimmed)
			}
		}
		return result
	}
	var generic []interface{}
	if err := json.Unmarshal(raw, &generic); err != nil {
		return []string{}
	}
	result := make([]string, 0, len(generic))
	for _, item := range generic {
		if text, ok := item.(string); ok {
			trimmed := strings.TrimSpace(text)
			if trimmed != "" {
				result = append(result, trimmed)
			}
		}
	}
	return result
}

func decodeIntSlice(raw datatypes.JSON) []int {
	if len(raw) == 0 || string(raw) == "null" {
		return []int{}
	}
	var items []int
	if err := json.Unmarshal(raw, &items); err == nil {
		return items
	}
	var generic []interface{}
	if err := json.Unmarshal(raw, &generic); err != nil {
		return []int{}
	}
	result := make([]int, 0, len(generic))
	for _, item := range generic {
		switch value := item.(type) {
		case float64:
			if value > 0 {
				result = append(result, int(value))
			}
		case int:
			if value > 0 {
				result = append(result, value)
			}
		case string:
			trimmed := strings.TrimSpace(value)
			if trimmed == "" {
				continue
			}
			var parsed int
			if err := json.Unmarshal([]byte(trimmed), &parsed); err == nil && parsed > 0 {
				result = append(result, parsed)
			}
		}
	}
	return result
}

func decodeMapSlice(raw datatypes.JSON) []map[string]interface{} {
	if len(raw) == 0 || string(raw) == "null" {
		return []map[string]interface{}{}
	}
	var items []map[string]interface{}
	if err := json.Unmarshal(raw, &items); err == nil {
		return items
	}
	return []map[string]interface{}{}
}

func normalizeStrategyType(raw string) string {
	value := strings.ToLower(strings.TrimSpace(raw))
	switch value {
	case StrategyScheduled:
		return StrategyScheduled
	case StrategyManual:
		return StrategyManual
	default:
		return StrategyManual
	}
}

func normalizeInspectionStatus(raw string) string {
	value := strings.ToLower(strings.TrimSpace(raw))
	switch value {
	case StatusPending, StatusRunning, StatusCompleted, StatusFailed, StatusCancelled, StatusTimeout:
		return value
	default:
		return StatusPending
	}
}

func normalizeTrigger(raw string) string {
	value := strings.ToLower(strings.TrimSpace(raw))
	switch value {
	case TriggerScheduled:
		return TriggerScheduled
	case TriggerAlert:
		return TriggerAlert
	default:
		return TriggerManual
	}
}

func normalizeCheckResultStatus(raw string) string {
	value := strings.ToLower(strings.TrimSpace(raw))
	switch value {
	case "pass", "fail", "warning", "skip":
		return value
	case "error":
		return "fail"
	default:
		return "fail"
	}
}
