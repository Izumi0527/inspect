package settings_test

// 通用配置校验的回归：数字区间 / 枚举 / 字符串形状三类约束在写库前拦住
// 非法值。这两个校验函数未导出，经 go:linkname 直测（与同目录
// monitoring_uptime_test.go 同口径）。

import (
	"strings"
	"testing"
	_ "unsafe"

	// blank import：确保被测包被链接进测试二进制，go:linkname 才能解析到符号。
	_ "github.com/your-org/inspect-system/backend-go/internal/settings"
)

//go:linkname validateGeneralSetting github.com/your-org/inspect-system/backend-go/internal/settings.validateGeneralSetting
func validateGeneralSetting(key string, value interface{}) (enforcedType string, err error)

//go:linkname validateNewSettingKey github.com/your-org/inspect-system/backend-go/internal/settings.validateNewSettingKey
func validateNewSettingKey(key string) error

func TestValidateGeneralSettingNumeric(t *testing.T) {
	cases := []struct {
		name       string
		key        string
		value      interface{}
		wantErr    bool
		wantErrSub string
		wantType   string
	}{
		{name: "超时下界", key: "inspection.default_timeout", value: float64(5), wantType: "integer"},
		{name: "超时上界", key: "inspection.default_timeout", value: float64(300), wantType: "integer"},
		{name: "超时越上界", key: "inspection.default_timeout", value: float64(9999), wantErr: true, wantErrSub: "5-300"},
		{name: "超时越下界", key: "inspection.default_timeout", value: float64(4), wantErr: true, wantErrSub: "5-300"},
		{name: "超时null拒绝", key: "inspection.default_timeout", value: nil, wantErr: true, wantErrSub: "不能为空"},
		{name: "超时字符串数字放行", key: "inspection.default_timeout", value: "45", wantType: "integer"},
		{name: "超时非数字拒绝", key: "inspection.default_timeout", value: "abc", wantErr: true, wantErrSub: "必须是数字"},
		{name: "超时小数拒绝", key: "inspection.default_timeout", value: 45.5, wantErr: true, wantErrSub: "必须是整数"},
		{name: "并发区间", key: "inspection.max_concurrent_tasks", value: float64(50), wantType: "integer"},
		{name: "并发越界", key: "inspection.max_concurrent_tasks", value: float64(51), wantErr: true, wantErrSub: "1-50"},
		{name: "重试零合法", key: "inspection.retry_attempts", value: float64(0), wantType: "integer"},
		{name: "重试负数拒绝", key: "inspection.retry_attempts", value: float64(-1), wantErr: true, wantErrSub: "0-10"},
		{name: "导出上限", key: "report.max_export_records", value: float64(100000), wantType: "integer"},
		{name: "导出越界", key: "report.max_export_records", value: float64(100001), wantErr: true, wantErrSub: "1-100000"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			gotType, err := validateGeneralSetting(tc.key, tc.value)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("期望报错，实际通过（type=%q）", gotType)
				}
				if tc.wantErrSub != "" && !strings.Contains(err.Error(), tc.wantErrSub) {
					t.Fatalf("错误信息 %q 未包含 %q", err.Error(), tc.wantErrSub)
				}
				return
			}
			if err != nil {
				t.Fatalf("期望通过，实际报错: %v", err)
			}
			if gotType != tc.wantType {
				t.Fatalf("data_type 期望 %q，实际 %q", tc.wantType, gotType)
			}
		})
	}
}

func TestValidateNewSettingKey(t *testing.T) {
	valid := []string{
		"system.new_flag", "inspection.some_option", "logs.retention_days",
		"user_preference.date_format", "backup.schedule",
	}
	for _, key := range valid {
		if err := validateNewSettingKey(key); err != nil {
			t.Fatalf("合法 key %q 被拒绝: %v", key, err)
		}
	}

	invalid := []string{
		"garbage.key", "noprefix", "system.", "unknown_category.value", ".dotstart",
	}
	for _, key := range invalid {
		if err := validateNewSettingKey(key); err == nil {
			t.Fatalf("非法 key %q 未被拒绝", key)
		}
	}
}

func TestValidateGeneralSettingEnumAndString(t *testing.T) {
	cases := []struct {
		name    string
		key     string
		value   interface{}
		wantErr bool
	}{
		{name: "导出格式合法", key: "report.default_format", value: "csv"},
		{name: "导出格式非法", key: "report.default_format", value: "word", wantErr: true},
		{name: "主题合法", key: "user_preference.theme", value: "dark"},
		{name: "主题非法", key: "user_preference.theme", value: "midnight", wantErr: true},
		{name: "主题null拒绝", key: "user_preference.theme", value: nil, wantErr: true},
		{name: "时间制合法", key: "user_preference.time_format", value: "12h"},
		{name: "时间制非法", key: "user_preference.time_format", value: "48h", wantErr: true},
		{name: "语言合法", key: "user_preference.language", value: "zh-CN"},
		{name: "时区合法", key: "system.timezone", value: "Asia/Shanghai"},
		{name: "时区UTC合法", key: "system.timezone", value: "UTC"},
		{name: "时区乱码拒绝", key: "system.timezone", value: "not a timezone!", wantErr: true},
		{name: "时区null拒绝", key: "system.timezone", value: nil, wantErr: true},
		{name: "应用名合法", key: "system.application_name", value: "网络设备巡检系统"},
		{name: "应用名空白拒绝", key: "system.application_name", value: "   ", wantErr: true},
		{name: "应用名超长拒绝", key: "system.application_name", value: strings.Repeat("名", 101), wantErr: true},
		{name: "未知key放行", key: "logs.retention_days", value: float64(-99)},
		{name: "未知key的null放行", key: "notification.levels", value: nil},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := validateGeneralSetting(tc.key, tc.value)
			if tc.wantErr && err == nil {
				t.Fatalf("期望报错，实际通过")
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("期望通过，实际报错: %v", err)
			}
		})
	}
}

func TestValidateGeneralSettingExcludeKeywords(t *testing.T) {
	keys := []string{"system.alert_exclude_keywords", "logs.exclude_keywords"}

	for _, key := range keys {
		t.Run(key+"_合法字符串", func(t *testing.T) {
			enforcedType, err := validateGeneralSetting(key, "CPU, MEM; 磁盘，网络")
			if err != nil {
				t.Fatalf("期望通过，实际报错: %v", err)
			}
			if enforcedType != "string" {
				t.Fatalf("enforcedType=%q, want 'string'", enforcedType)
			}
		})

		t.Run(key+"_空字符串及全空白分隔符", func(t *testing.T) {
			for _, val := range []interface{}{"", "   ", ",,,;；，"} {
				enforcedType, err := validateGeneralSetting(key, val)
				if err != nil {
					t.Fatalf("val=%q 期望通过，实际报错: %v", val, err)
				}
				if enforcedType != "string" {
					t.Fatalf("enforcedType=%q, want 'string'", enforcedType)
				}
			}
		})

		t.Run(key+"_非字符串拒绝", func(t *testing.T) {
			for _, val := range []interface{}{123, true, nil, []string{"test"}} {
				_, err := validateGeneralSetting(key, val)
				if err == nil {
					t.Fatalf("val=%v 期望报错，实际通过", val)
				}
				if !strings.Contains(err.Error(), "必须是字符串") {
					t.Fatalf("错误信息未包含'必须是字符串': %v", err)
				}
			}
		})

		t.Run(key+"_超过20个独立关键字拒绝", func(t *testing.T) {
			var kws []string
			for i := 1; i <= 21; i++ {
				kws = append(kws, strings.Repeat("a", i))
			}
			val := strings.Join(kws, ",")
			_, err := validateGeneralSetting(key, val)
			if err == nil {
				t.Fatalf("21个独立关键字期望报错，实际通过")
			}
			if !strings.Contains(err.Error(), "最多允许配置 20 个") {
				t.Fatalf("错误信息未包含'最多允许配置 20 个': %v", err)
			}
		})

		t.Run(key+"_含重复时不超过20个独立关键字通过", func(t *testing.T) {
			var kws []string
			for i := 1; i <= 20; i++ {
				kws = append(kws, strings.Repeat("b", i))
			}
			// 追加大小写重复项
			kws = append(kws, "B", "bb", "BBB")
			val := strings.Join(kws, ",")
			enforcedType, err := validateGeneralSetting(key, val)
			if err != nil {
				t.Fatalf("去重后20个关键字期望通过，实际报错: %v", err)
			}
			if enforcedType != "string" {
				t.Fatalf("enforcedType=%q, want 'string'", enforcedType)
			}
		})

		t.Run(key+"_单个关键字超100字符拒绝", func(t *testing.T) {
			over100 := strings.Repeat("字", 101)
			val := "正常," + over100
			_, err := validateGeneralSetting(key, val)
			if err == nil {
				t.Fatalf("101字符关键字期望报错，实际通过")
			}
			if !strings.Contains(err.Error(), "单个屏蔽关键字长度不能超过 100 个字符") {
				t.Fatalf("错误信息未包含'单个屏蔽关键字长度不能超过 100 个字符': %v", err)
			}
		})

		t.Run(key+"_单个关键字正好100字符通过", func(t *testing.T) {
			exact100 := strings.Repeat("测", 100)
			val := "kw1," + exact100
			enforcedType, err := validateGeneralSetting(key, val)
			if err != nil {
				t.Fatalf("100字符关键字期望通过，实际报错: %v", err)
			}
			if enforcedType != "string" {
				t.Fatalf("enforcedType=%q, want 'string'", enforcedType)
			}
		})
	}
}
