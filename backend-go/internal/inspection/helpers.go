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

// CheckStatusNotApplicable 表示该检查项不适用于当前设备类型（如交换机上的 BGP、
// 路由器上的 PoE）。它既不是通过也不是失败，不计入异常，也不计入通过率分母。
//
// 与 skip 的区别：skip 是"该查但没查成"（采集失败、缺少基线），需要运维关注；
// not_applicable 是"这台设备根本没有这个特性"，属于预期内的正常情况。
const CheckStatusNotApplicable = "not_applicable"

// normalizeCheckResultStatus 归一化检查结果状态，是落库前的最后一道关。
//
// 注意 default 分支落 fail：写入未登记的状态值会被静默转成"失败"，不报错也无日志。
// 新增状态枚举时**必须先改这里再写入**，否则设备完全健康却报一堆失败。
func normalizeCheckResultStatus(raw string) string {
	value := strings.ToLower(strings.TrimSpace(raw))
	switch value {
	case "pass", "fail", "warning", "skip", CheckStatusNotApplicable:
		return value
	case "error":
		return "fail"
	default:
		return "fail"
	}
}
