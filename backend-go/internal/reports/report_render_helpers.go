package reports

import (
	"encoding/json"
	"fmt"
	"reflect"
	"sort"
	"strconv"
	"strings"
	"time"
)

func formatPercent(value float64, precision int) string {
	if precision < 0 {
		precision = 0
	}
	if value < 0 {
		value = 0
	}
	return fmt.Sprintf("%.*f%%", precision, value)
}

func formatPercentByTotal(count int, total int) string {
	if total <= 0 {
		return "0%"
	}
	return formatPercent(float64(count)/float64(total)*100, 1)
}

func formatDurationSeconds(seconds int) string {
	if seconds <= 0 {
		return "0 秒"
	}
	return fmt.Sprintf("%d 秒", seconds)
}

func formatHours(value float64) string {
	if value < 0 {
		value = 0
	}
	return fmt.Sprintf("%.1f小时", value)
}

func formatFloat(value float64, precision int) string {
	return fmt.Sprintf("%.*f", precision, value)
}

func formatSummaryValue(summary map[string]interface{}) string {
	if len(summary) == 0 {
		return "{}"
	}
	orderedKeys := []string{"total", "success", "failed"}
	used := make(map[string]struct{}, len(summary))
	parts := make([]string, 0, len(summary))

	for _, key := range orderedKeys {
		if value, ok := summary[key]; ok {
			parts = append(parts, fmt.Sprintf("'%s': %s", key, formatSummaryItem(value)))
			used[key] = struct{}{}
		}
	}

	keys := make([]string, 0, len(summary))
	for key := range summary {
		if _, ok := used[key]; ok {
			continue
		}
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		parts = append(parts, fmt.Sprintf("'%s': %s", key, formatSummaryItem(summary[key])))
	}

	return "{" + strings.Join(parts, ", ") + "}"
}

func formatSummaryItem(value interface{}) string {
	switch v := value.(type) {
	case string:
		return fmt.Sprintf("'%s'", v)
	case []byte:
		return fmt.Sprintf("'%s'", string(v))
	case float64:
		return strconv.FormatFloat(v, 'f', -1, 64)
	case float32:
		return strconv.FormatFloat(float64(v), 'f', -1, 32)
	case int, int64, int32, uint, uint64, uint32:
		return fmt.Sprintf("%v", v)
	case bool:
		if v {
			return "true"
		}
		return "false"
	default:
		return fmt.Sprintf("%v", v)
	}
}

// formatValueForReport 用于把复杂结构（map/slice/array）格式化为可读的 JSON 字符串。
// 主要服务于通用报表（GenericReportData）的 Extra 字段展示，避免输出难读的 Go 默认格式。
func formatValueForReport(value interface{}) string {
	if value == nil {
		return ""
	}
	switch v := value.(type) {
	case string:
		return v
	case []byte:
		return string(v)
	}
	rv := reflect.ValueOf(value)
	switch rv.Kind() {
	case reflect.Map, reflect.Slice, reflect.Array:
		if raw, err := json.MarshalIndent(value, "", "  "); err == nil {
			return string(raw)
		}
	}
	return fmt.Sprintf("%v", value)
}

func sortedKeys(values map[string]interface{}) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func sortedIntKeys(values map[string]int) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func sortedKeysByCount(values map[string]int) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Slice(keys, func(i, j int) bool {
		left := values[keys[i]]
		right := values[keys[j]]
		if left == right {
			return keys[i] < keys[j]
		}
		return left > right
	})
	return keys
}

func orderedKeysByPreference(values map[string]int, preferred []string) []string {
	seen := make(map[string]struct{}, len(values))
	keys := make([]string, 0, len(values))
	for _, key := range preferred {
		if _, ok := values[key]; ok {
			keys = append(keys, key)
			seen[key] = struct{}{}
		}
	}

	remaining := make([]string, 0, len(values))
	for key := range values {
		if _, ok := seen[key]; ok {
			continue
		}
		remaining = append(remaining, key)
	}
	sort.Slice(remaining, func(i, j int) bool {
		left := values[remaining[i]]
		right := values[remaining[j]]
		if left == right {
			return remaining[i] < remaining[j]
		}
		return left > right
	})

	return append(keys, remaining...)
}

func normalizeReportTime(primary string, fallback time.Time) string {
	value := strings.TrimSpace(primary)
	if value != "" {
		return value
	}
	if fallback.IsZero() {
		return time.Now().Format("2006-01-02 15:04:05")
	}
	return fallback.Format("2006-01-02 15:04:05")
}

func normalizeReportTitle(title string, fallback string) string {
	value := strings.TrimSpace(title)
	if value != "" {
		return value
	}
	return fallback
}
