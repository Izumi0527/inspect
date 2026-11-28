package inspection_test

import (
	"errors"
	"strings"
	"testing"

	"github.com/your-org/inspect-system/backend-go/internal/inspection"
)

// SNMP 检查项必须携带合法 metric —— 防止无 metric 的模板入库后在执行端退化为
// "连通性检查假通过"（历史事故：SQL 种子遗留的旧版模板全部检查项显示探测耗时 4.00ms）。
func TestValidateCheckItem_SNMPMetricRequired(t *testing.T) {
	v := inspection.NewTemplateValidator(nil)

	cases := []struct {
		name    string
		metric  string
		wantErr bool
	}{
		{"空 metric 拒绝", "", true},
		{"非法 metric 拒绝", "cpu_usage", true},
		{"reachable 合法", "reachable", false},
		{"system_info 合法", "system_info", false},
		{"cpu 合法", "cpu", false},
		{"memory 合法", "memory", false},
		{"temperature 合法", "temperature", false},
		{"uptime 合法", "uptime", false},
		{"interface 合法", "interface", false},
		{"bandwidth 合法", "bandwidth", false},
		{"board_status 合法", "board_status", false},
		{"stack_status 合法", "stack_status", false},
		{"config_save_status 合法", "config_save_status", false},
		{"vlan_status 合法", "vlan_status", false},
		{"flash_usage 合法", "flash_usage", false},
		{"大小写与空白容忍", " CPU ", false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			item := &inspection.CheckItem{
				ID: "x", Name: "检查项", Type: "snmp", Metric: tc.metric,
				Config: map[string]interface{}{},
			}
			err := v.ValidateCheckItem(item)
			if tc.wantErr && err == nil {
				t.Fatalf("metric=%q 应校验失败", tc.metric)
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("metric=%q 应校验通过，实际 %v", tc.metric, err)
			}
			if tc.wantErr && err != nil && !strings.Contains(err.Error(), "metric") {
				t.Fatalf("错误信息应提示 metric，实际 %v", err)
			}
		})
	}
}

// 非 SNMP 类型不校验 metric（icmp/ping 项 metric 为空是内置模板的合法形态）。
func TestValidateCheckItem_NonSNMPMetricNotRequired(t *testing.T) {
	v := inspection.NewTemplateValidator(nil)
	item := &inspection.CheckItem{
		ID: "c", Name: "设备连通性", Type: "ping", Metric: "",
		Config: map[string]interface{}{},
	}
	if err := v.ValidateCheckItem(item); err != nil {
		t.Fatalf("ping 项不应校验 metric，实际 %v", err)
	}
}

func TestIsLowerBoundedMetric(t *testing.T) {
	for _, metric := range []string{"poe", "optical_power", "stp_status", " PoE "} {
		if !inspection.IsLowerBoundedMetric(metric) {
			t.Errorf("IsLowerBoundedMetric(%q) = false, want true", metric)
		}
	}
	for _, metric := range []string{"cpu", "memory", "flash_usage", "vlan_status", ""} {
		if inspection.IsLowerBoundedMetric(metric) {
			t.Errorf("IsLowerBoundedMetric(%q) = true, want false", metric)
		}
	}
}

func TestValidateCheckItem_BidirectionalThreshold(t *testing.T) {
	v := inspection.NewTemplateValidator(nil)

	cases := []struct {
		name     string
		metric   string
		warning  interface{}
		critical interface{}
		wantErr  bool
		wantMsg  string
	}{
		{"常规指标 warning<critical(float64) 通过", "cpu", 70.0, 85.0, false, ""},
		{"常规指标 warning<critical(int) 通过", "flash_usage", 80, 90, false, ""},
		{"常规指标 warning<critical(int64) 通过", "vlan_status", int64(80), int64(95), false, ""},
		{"常规指标 warning==critical 拒绝", "cpu", 80.0, 80.0, true, "必须小于"},
		{"常规指标 warning>critical 拒绝", "flash_usage", 95, 90, true, "必须小于"},
		{"下限指标 poe warning>critical(int) 通过", "poe", 30, 10, false, ""},
		{"下限指标 optical_power warning>critical(float64) 通过", "optical_power", -25.0, -30.0, false, ""},
		{"下限指标 stp_status warning>critical(int64) 通过", "stp_status", int64(3600), int64(300), false, ""},
		{"下限指标 poe warning<=critical 拒绝", "poe", 10, 30, true, "数值越低越危险"},
		{"下限指标 optical_power warning==critical 拒绝", "optical_power", -25.0, -25.0, true, "数值越低越危险"},
		{"下限指标 stp_status warning<critical 拒绝", "stp_status", 300, 3600, true, "数值越低越危险"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			item := &inspection.CheckItem{
				ID:     "t",
				Name:   "阈值测试",
				Type:   "snmp",
				Metric: tc.metric,
				Config: map[string]interface{}{
					"threshold": map[string]interface{}{
						"warning":  tc.warning,
						"critical": tc.critical,
					},
				},
			}
			err := v.ValidateCheckItem(item)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("期望校验失败，实际通过")
				}
				if !errors.Is(err, inspection.ErrInvalidThreshold) {
					t.Fatalf("期望 ErrInvalidThreshold，实际 %v", err)
				}
				if tc.wantMsg != "" && !strings.Contains(err.Error(), tc.wantMsg) {
					t.Fatalf("错误信息 %q 未包含 %q", err.Error(), tc.wantMsg)
				}
				return
			}
			if err != nil {
				t.Fatalf("期望校验通过，实际失败: %v", err)
			}
		})
	}
}
