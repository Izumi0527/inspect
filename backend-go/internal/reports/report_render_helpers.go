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
	case "not_applicable", "n/a", "na":
		return "不适用"
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

// ---------------------------------------------------------------------------
// 巡检覆盖范围
// ---------------------------------------------------------------------------

// inspectionDimension 描述一个可巡检维度：Metric 是执行端的分派键，Label 是报告展示名。
type inspectionDimension struct {
	Metric string
	Label  string
}

// inspectionDimensions 是全部可采集维度的清单，顺序即报告中的呈现顺序，
// 与 inspection 包内置检查项的 metric 一一对应（19 项）。
//
// **这是新增 metric 的第五处同步点**：漏加会让该维度被永远算作「未覆盖」，
// 报告于是在已经查过的情况下平白给出「某某维度未核查」的免责声明。
// 另外四处是 inspection_execution.go 的分派分支、validator.go 的
// validSNMPMetrics、外置测试 builtin_templates_test.go 的两个清单、
// 以及前端 types/index.ts 的 metric 文档注释。
var inspectionDimensions = []inspectionDimension{
	{Metric: "connectivity", Label: "连通性"},
	{Metric: "reachable", Label: "SNMP 可达"},
	{Metric: "cpu", Label: "CPU"},
	{Metric: "memory", Label: "内存"},
	{Metric: "fan_status", Label: "风扇状态"},
	{Metric: "power_status", Label: "电源状态"},
	{Metric: "temperature", Label: "温度"},
	{Metric: "uptime", Label: "运行时长"},
	{Metric: "interface", Label: "接口状态"},
	{Metric: "interface_utilization", Label: "接口利用率"},
	{Metric: "interface_errors", Label: "接口错包率"},
	{Metric: "interface_discards", Label: "接口丢弃率"},
	{Metric: "interface_admin_status", Label: "接口管理状态"},
	{Metric: "interface_duplex", Label: "接口双工模式"},
	{Metric: "bandwidth", Label: "带宽吞吐量"},
	{Metric: "poe", Label: "PoE 供电"},
	{Metric: "optical_power", Label: "光模块光功率"},
	{Metric: "bgp_peers", Label: "BGP 邻居"},
	{Metric: "firmware_version", Label: "固件版本"},
}

// checkItemDimensionKey 把一个检查项归一到维度键。
// ICMP/PING 类检查项没有 metric（执行端按 type 分派），统一归到 connectivity。
func checkItemDimensionKey(item map[string]interface{}) string {
	typ, _ := item["type"].(string)
	switch strings.ToLower(strings.TrimSpace(typ)) {
	case "icmp", "ping":
		return "connectivity"
	}
	metric, _ := item["metric"].(string)
	return strings.ToLower(strings.TrimSpace(metric))
}

// summarizeTemplateCoverage 从巡检模板的 check_items 推导本次覆盖与未覆盖的维度。
//
// 覆盖范围取自模板定义而非执行结果，这是刻意的：覆盖范围要回答的是「这个模板
// 打算查什么」，某一项执行失败或跳过仍属于覆盖范围内（只是没查成，那由异常清单
// 负责呈现）。inspection_results 表也确实没有 metric 列，无从反推。
//
// 读不到模板信息时返回空，由渲染层跳过覆盖范围声明——绝不能把「读不到模板」
// 当成「什么都没查」，那会让历史报告（template_id 为 NULL）平白多出一句
// 「全部 19 个维度未核查」，比不写更误导。
func summarizeTemplateCoverage(checkItems []byte) (covered []string, uncovered []string) {
	if len(checkItems) == 0 {
		return nil, nil
	}

	var items []map[string]interface{}
	if err := json.Unmarshal(checkItems, &items); err != nil || len(items) == 0 {
		return nil, nil
	}

	present := make(map[string]bool, len(items))
	for _, item := range items {
		if item == nil {
			continue
		}
		// enabled 缺失视为启用（与执行端 filterEnabledCheckItems 的口径一致）；
		// 显式停用的项不会被执行，算进覆盖范围就等于声称查过了。
		if enabled, ok := item["enabled"].(bool); ok && !enabled {
			continue
		}
		if key := checkItemDimensionKey(item); key != "" {
			present[key] = true
		}
	}

	covered = make([]string, 0, len(inspectionDimensions))
	uncovered = make([]string, 0, len(inspectionDimensions))
	for _, dim := range inspectionDimensions {
		if present[dim.Metric] {
			covered = append(covered, dim.Label)
			continue
		}
		uncovered = append(uncovered, dim.Label)
	}
	// 模板存在但没有任何一项落在已知维度上，与读不到模板同样处理：
	// 此时 uncovered 会是全部 19 项，输出出去就是那句误导性的免责声明。
	if len(covered) == 0 {
		return nil, nil
	}
	return covered, uncovered
}
