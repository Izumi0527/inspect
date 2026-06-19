package handlers_test

import (
	"testing"
	_ "unsafe"

	_ "github.com/your-org/inspect-system/backend-go/internal/http/handlers"
)

//go:linkname buildDeviceUpdates github.com/your-org/inspect-system/backend-go/internal/http/handlers.buildDeviceUpdates
func buildDeviceUpdates(payload map[string]interface{}) map[string]interface{}

func TestBuildDeviceUpdates_ShouldIncludeSnmpPort(t *testing.T) {
	payload := map[string]interface{}{
		"snmp_port": float64(1161),
	}

	updates := buildDeviceUpdates(payload)

	got, ok := updates["snmp_port"]
	if !ok {
		t.Fatalf("updates[snmp_port] missing")
	}

	port, ok := got.(int)
	if !ok {
		t.Fatalf("updates[snmp_port] type = %T, want int", got)
	}

	if port != 1161 {
		t.Fatalf("updates[snmp_port] = %d, want 1161", port)
	}
}

// TestBuildDeviceUpdates_SensitiveBlankKeepsExisting 验证：敏感凭据字段
// （snmp_community / ssh_password / telnet_password / enable_password）在缺省、null、
// 空串、纯空白时一律不写入 updates（保持数据库原值），仅在传入非空值时才更新。
// 这样详情/列表响应对凭据脱敏后，前端编辑回填空值也不会误抹 DB 中已存的凭据。
func TestBuildDeviceUpdates_SensitiveBlankKeepsExisting(t *testing.T) {
	secretKeys := []string{"snmp_community", "ssh_password", "telnet_password", "enable_password"}

	t.Run("缺省时不写入", func(t *testing.T) {
		updates := buildDeviceUpdates(map[string]interface{}{"name": "sw01"})
		for _, key := range secretKeys {
			if _, ok := updates[key]; ok {
				t.Fatalf("字段 %s 缺省时不应出现在 updates 中", key)
			}
		}
	})

	t.Run("null_空串_空白均视为保持原值", func(t *testing.T) {
		for _, key := range secretKeys {
			for _, blank := range []interface{}{nil, "", "   "} {
				updates := buildDeviceUpdates(map[string]interface{}{key: blank})
				if _, ok := updates[key]; ok {
					t.Fatalf("字段 %s 传入空值 %#v 时不应写入 updates", key, blank)
				}
			}
		}
	})

	t.Run("非空值才更新且去除首尾空白", func(t *testing.T) {
		updates := buildDeviceUpdates(map[string]interface{}{
			"snmp_community":  " private ",
			"ssh_password":    "p@ss",
			"telnet_password": "tn",
			"enable_password": "en",
		})
		if got := updates["snmp_community"]; got != "private" {
			t.Fatalf("snmp_community 期望 %q，实际 %#v", "private", got)
		}
		if got := updates["ssh_password"]; got != "p@ss" {
			t.Fatalf("ssh_password 期望 %q，实际 %#v", "p@ss", got)
		}
		if got := updates["telnet_password"]; got != "tn" {
			t.Fatalf("telnet_password 期望 %q，实际 %#v", "tn", got)
		}
		if got := updates["enable_password"]; got != "en" {
			t.Fatalf("enable_password 期望 %q，实际 %#v", "en", got)
		}
	})
}

// TestBuildDeviceUpdates_PlainFieldsClearable 验证普通配置字段（如 ssh_username）
// 传入 null 时仍可被清空，行为不受敏感字段处理影响。
func TestBuildDeviceUpdates_PlainFieldsClearable(t *testing.T) {
	updates := buildDeviceUpdates(map[string]interface{}{
		"ssh_username":    nil,
		"telnet_username": "admin",
		"snmp_version":    " v3 ",
	})

	val, ok := updates["ssh_username"]
	if !ok {
		t.Fatalf("ssh_username 传入 null 时应写入 updates 以支持清空")
	}
	if val != nil {
		t.Fatalf("ssh_username 期望被清空为 nil，实际 %#v", val)
	}
	if got := updates["telnet_username"]; got != "admin" {
		t.Fatalf("telnet_username 期望 %q，实际 %#v", "admin", got)
	}
	if got := updates["snmp_version"]; got != "v3" {
		t.Fatalf("snmp_version 期望 %q，实际 %#v", "v3", got)
	}
}
