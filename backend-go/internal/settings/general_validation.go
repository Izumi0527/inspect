package settings

import (
	"fmt"
	"math"
	"regexp"
	"strings"
)

// 通用配置写入约束：UpsertSetting（含 bulk 路径）在写库前强制校验。
// 数值区间与前端 useGeneralSettings 的 GENERAL_NUMERIC_RULES 保持同步，
// 两处集合修改时必须一起改。

type generalNumericConstraint struct {
	Min   float64
	Max   float64
	Label string
}

var generalNumericConstraints = map[string]generalNumericConstraint{
	"inspection.max_concurrent_tasks": {Min: 1, Max: 50, Label: "最大并发任务数"},
	"inspection.default_timeout":      {Min: 5, Max: 300, Label: "默认超时时间"},
	"inspection.retry_attempts":       {Min: 0, Max: 10, Label: "失败重试次数"},
	"report.max_export_records":       {Min: 1, Max: 100000, Label: "最大导出记录数"},
}

var generalEnumConstraints = map[string][]string{
	"report.default_format":       {"excel", "pdf", "csv"},
	"user_preference.theme":       {"light", "dark", "auto"},
	"user_preference.time_format": {"12h", "24h"},
	"user_preference.language":    {"zh-CN", "en-US"},
}

// IANA 时区名的形状校验（Area/City 或 UTC）；不依赖系统 tzdata，避免
// Windows 部署环境缺 zoneinfo 时误杀合法值。
var timezonePattern = regexp.MustCompile(`^[A-Za-z]+(/[A-Za-z0-9_+\-]+)+$|^UTC$`)

const applicationNameMaxLength = 100

// validSettingCategories 是允许新建配置项的类别前缀集合。
// 已存在的 key 不受限（更新路径），仅拦截 bulk/单 key 写入创造未知前缀的垃圾行。
var validSettingCategories = map[string]struct{}{
	"system": {}, "notification": {}, "email": {}, "inspection": {},
	"report": {}, "logs": {}, "security": {}, "backup": {}, "user_preference": {},
}

// validateNewSettingKey 校验新建配置项的 key 形状：必须是 <合法类别>.<名称>。
func validateNewSettingKey(key string) error {
	parts := strings.SplitN(key, ".", 2)
	if len(parts) < 2 || strings.TrimSpace(parts[1]) == "" {
		return fmt.Errorf("配置项 key（%s）必须是 <类别>.<名称> 形式", key)
	}
	if _, ok := validSettingCategories[parts[0]]; !ok {
		return fmt.Errorf("配置项 key（%s）类别前缀不合法", key)
	}
	return nil
}

// validateGeneralSetting 校验已知通用配置 key 的取值。
// 返回值 enforcedType 非空时表示该 key 的 data_type 由约束表钦定
// （数字项恒为 integer，可纠正历史上动态创建导致的 float 漂移）。
// 未知 key 不做校验，原样放行。
func validateGeneralSetting(key string, value interface{}) (enforcedType string, err error) {
	if c, ok := generalNumericConstraints[key]; ok {
		if value == nil {
			return "", fmt.Errorf("%s（%s）不能为空", c.Label, key)
		}
		num, ok := asFloat64(value)
		if !ok {
			return "", fmt.Errorf("%s（%s）必须是数字", c.Label, key)
		}
		if math.IsNaN(num) || math.IsInf(num, 0) || num != math.Trunc(num) {
			return "", fmt.Errorf("%s（%s）必须是整数", c.Label, key)
		}
		if num < c.Min || num > c.Max {
			return "", fmt.Errorf("%s（%s）必须在 %g-%g 之间", c.Label, key, c.Min, c.Max)
		}
		return "integer", nil
	}

	if allowed, ok := generalEnumConstraints[key]; ok {
		text, isString := value.(string)
		if !isString {
			return "", fmt.Errorf("%s 必须是字符串", key)
		}
		trimmed := strings.TrimSpace(text)
		for _, item := range allowed {
			if strings.EqualFold(trimmed, item) {
				return "string", nil
			}
		}
		return "", fmt.Errorf("%s 取值必须是 %s 之一", key, strings.Join(allowed, "/"))
	}

	switch key {
	case "system.timezone":
		text, isString := value.(string)
		if !isString || !timezonePattern.MatchString(strings.TrimSpace(text)) {
			return "", fmt.Errorf("时区（%s）必须是合法的 IANA 时区名", key)
		}
		return "string", nil
	case "system.application_name":
		text, isString := value.(string)
		if !isString {
			return "", fmt.Errorf("应用程序名称（%s）必须是字符串", key)
		}
		trimmed := strings.TrimSpace(text)
		if trimmed == "" {
			return "", fmt.Errorf("应用程序名称（%s）不能为空", key)
		}
		if len([]rune(trimmed)) > applicationNameMaxLength {
			return "", fmt.Errorf("应用程序名称（%s）不能超过 %d 个字符", key, applicationNameMaxLength)
		}
		return "string", nil
	}

	return "", nil
}
