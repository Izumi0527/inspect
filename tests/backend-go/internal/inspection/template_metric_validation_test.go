package inspection_test

import (
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
