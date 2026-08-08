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

// ---------------------------------------------------------------------------
// 报告展示层中文化映射。数据库与 API 契约仍存英文枚举（switch / huawei /
// pass / completed …），仅在渲染时翻译；未识别的取值原样返回，避免把
// 型号、自定义分类等误翻。网络协议 / 采集方式（ICMP、SNMP、CLI …）按
// 用户约定保留英文原文，只做标准大写规范化。
// ---------------------------------------------------------------------------

func localizeDeviceType(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "switch":
		return "交换机"
	case "router":
		return "路由器"
	case "firewall":
		return "防火墙"
	case "server":
		return "服务器"
	case "ap", "access_point", "wireless":
		return "无线AP"
	case "load_balancer", "loadbalancer", "lb":
		return "负载均衡"
	default:
		return strings.TrimSpace(value)
	}
}

func localizeVendor(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "huawei":
		return "华为"
	case "cisco":
		return "思科"
	case "ruijie":
		return "锐捷"
	case "zte":
		return "中兴"
	case "h3c":
		return "H3C"
	case "juniper":
		return "Juniper"
	default:
		return strings.TrimSpace(value)
	}
}

// localizeStatusWord 覆盖巡检执行状态（completed / running …）、设备状态
// （online / offline …）与检查项状态（pass / fail / warning / skip）。两套
// 枚举无键冲突，合并一个字典让所有「状态」列共用一个翻译入口。
func localizeStatusWord(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "pass", "passed", "success", "ok":
		return "通过"
	case "fail", "failed":
		return "失败"
	case "warning", "warn":
		return "警告"
	case "skip", "skipped":
		return "跳过"
	case "error":
		return "错误"
	case "completed", "complete", "done":
		return "已完成"
	case "running", "in_progress":
		return "执行中"
	case "pending", "waiting":
		return "待执行"
	case "cancelled", "canceled":
		return "已取消"
	case "timeout":
		return "超时"
	case "online", "active", "up":
		return "在线"
	case "offline", "inactive", "down":
		return "离线"
	case "maintenance":
		return "维护中"
	case "unknown":
		return "未知"
	default:
		return strings.TrimSpace(value)
	}
}

// localizeProtocolTerm 把采集方式 / 协议名规范为标准大写写法（保留英文，
// 不翻译），如 icmp → ICMP、snmp → SNMP。未识别的取值原样返回。
func localizeProtocolTerm(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "icmp":
		return "ICMP"
	case "snmp":
		return "SNMP"
	case "cli":
		return "CLI"
	case "ssh":
		return "SSH"
	case "telnet":
		return "Telnet"
	case "ping":
		return "PING"
	case "http":
		return "HTTP"
	case "https":
		return "HTTPS"
	case "api":
		return "API"
	default:
		return strings.TrimSpace(value)
	}
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

// localizeIntMapKeys 用 fn 翻译计数 map 的键（如设备类型分布的
// switch/router → 交换机/路由器）；翻译后键相同的条目数值合并。
func localizeIntMapKeys(values map[string]int, fn func(string) string) map[string]int {
	if len(values) == 0 {
		return values
	}
	out := make(map[string]int, len(values))
	for key, count := range values {
		out[fn(key)] += count
	}
	return out
}

// localizeStrings 返回逐项翻译后的新切片，供 preferred 排序表与翻译后的
// map 键保持一致。
func localizeStrings(values []string, fn func(string) string) []string {
	out := make([]string, 0, len(values))
	for _, v := range values {
		out = append(out, fn(v))
	}
	return out
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
