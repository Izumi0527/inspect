package devices_test

import (
	"testing"

	"github.com/gosnmp/gosnmp"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
)

// NewSNMPClient 是 logs 等外部包复用设备 SNMP 凭据解析（含 tags 内 v3 参数）的唯一入口，
// 这里锁定版本/团体字/端口的解析契约；连接行为不在单测范围。

func intPtr(v int) *int { return &v }

func TestNewSNMPClient_V2cShouldRequireCommunity(t *testing.T) {
	if _, err := devices.NewSNMPClient("192.168.20.1", strPtr("  "), strPtr("2c"), nil, nil); err == nil {
		t.Fatal("v2c 缺 community 应报错")
	}

	client, err := devices.NewSNMPClient("192.168.20.1", strPtr("public"), strPtr("2c"), nil, nil)
	if err != nil {
		t.Fatalf("NewSNMPClient error: %v", err)
	}
	if client.Version != gosnmp.Version2c || client.Community != "public" {
		t.Fatalf("version/community=%v/%q", client.Version, client.Community)
	}
	if client.Port != 161 {
		t.Fatalf("port=%d, want 默认 161", client.Port)
	}
	if client.Target != "192.168.20.1" {
		t.Fatalf("target=%q", client.Target)
	}
}

func TestNewSNMPClient_V3ShouldUseTagsWithoutCommunity(t *testing.T) {
	tags := map[string]interface{}{
		"snmp_config": map[string]interface{}{
			"version": "3",
			"v3_config": map[string]interface{}{
				"username":       "monitor",
				"security_level": "authPriv",
				"auth_protocol":  "SHA",
				"auth_password":  "auth-secret",
				"priv_protocol":  "AES",
				"priv_password":  "priv-secret",
			},
		},
	}

	client, err := devices.NewSNMPClient("192.168.20.1", nil, strPtr("3"), intPtr(1161), tags)
	if err != nil {
		t.Fatalf("v3 不需要 community，却报错: %v", err)
	}
	if client.Version != gosnmp.Version3 || client.Port != 1161 {
		t.Fatalf("version/port=%v/%d", client.Version, client.Port)
	}
	params, ok := client.SecurityParameters.(*gosnmp.UsmSecurityParameters)
	if !ok || params.UserName != "monitor" || params.AuthenticationPassphrase != "auth-secret" {
		t.Fatalf("v3 参数未从 tags 解析: %+v", client.SecurityParameters)
	}
	if client.MsgFlags != gosnmp.AuthPriv {
		t.Fatalf("security level=%v, want AuthPriv", client.MsgFlags)
	}
}

func TestNewSNMPClient_ShouldRejectEmptyIP(t *testing.T) {
	if _, err := devices.NewSNMPClient("   ", strPtr("public"), strPtr("2c"), nil, nil); err == nil {
		t.Fatal("空 IP 应报错")
	}
}
