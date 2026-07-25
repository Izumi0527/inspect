package devices_test

import (
	"encoding/json"
	"testing"
	_ "unsafe"

	"gorm.io/datatypes"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
)

//go:linkname mergeTagsCredentials github.com/your-org/inspect-system/backend-go/internal/devices.mergeTagsCredentials
func mergeTagsCredentials(newTags, oldTags datatypes.JSON) datatypes.JSON

func decodeTagsJSON(t *testing.T, raw datatypes.JSON) map[string]interface{} {
	t.Helper()
	var root map[string]interface{}
	if err := json.Unmarshal(raw, &root); err != nil {
		t.Fatalf("解析 tags JSON 失败: %v", err)
	}
	return root
}

func sshConfigOf(t *testing.T, root map[string]interface{}) map[string]interface{} {
	t.Helper()
	cli, _ := root["cli_config"].(map[string]interface{})
	sshCfg, _ := cli["ssh_config"].(map[string]interface{})
	if sshCfg == nil {
		t.Fatal("tags 中缺少 cli_config.ssh_config")
	}
	return sshCfg
}

func TestMergeTagsCredentials_EmptyNewValueInheritsOld(t *testing.T) {
	oldTags := datatypes.JSON([]byte(`{"cli_config":{"ssh_config":{
		"use_key_auth":true,"private_key":"OLD-KEY","key_passphrase":"OLD-PASS","password":"OLD-PWD"}}}`))
	// 前端编辑未重贴私钥：敏感键缺失（undefined 序列化后不出现）
	newTags := datatypes.JSON([]byte(`{"cli_config":{"ssh_config":{"use_key_auth":true,"port":22}}}`))

	merged := mergeTagsCredentials(newTags, oldTags)
	sshCfg := sshConfigOf(t, decodeTagsJSON(t, merged))

	if sshCfg["private_key"] != "OLD-KEY" {
		t.Fatalf("private_key 应继承旧值，实际: %v", sshCfg["private_key"])
	}
	if sshCfg["key_passphrase"] != "OLD-PASS" {
		t.Fatalf("key_passphrase 应继承旧值，实际: %v", sshCfg["key_passphrase"])
	}
	if sshCfg["password"] != "OLD-PWD" {
		t.Fatalf("password 应继承旧值，实际: %v", sshCfg["password"])
	}
	if sshCfg["port"] != float64(22) {
		t.Fatalf("非凭据字段应保留新值，实际: %v", sshCfg["port"])
	}
}

func TestMergeTagsCredentials_NewValueWins(t *testing.T) {
	oldTags := datatypes.JSON([]byte(`{"cli_config":{"ssh_config":{"private_key":"OLD-KEY"}}}`))
	newTags := datatypes.JSON([]byte(`{"cli_config":{"ssh_config":{"private_key":"NEW-KEY"}}}`))

	merged := mergeTagsCredentials(newTags, oldTags)
	sshCfg := sshConfigOf(t, decodeTagsJSON(t, merged))
	if sshCfg["private_key"] != "NEW-KEY" {
		t.Fatalf("用户输入的新私钥应保留，实际: %v", sshCfg["private_key"])
	}
}

func TestMergeTagsCredentials_MissingParentBlockSkipsInherit(t *testing.T) {
	// 用户从 SSH 切到 Telnet：新 tags 无 ssh_config，不应凭空恢复
	oldTags := datatypes.JSON([]byte(`{"cli_config":{"ssh_config":{"private_key":"OLD-KEY"}}}`))
	newTags := datatypes.JSON([]byte(`{"cli_config":{"telnet_config":{"password":"tel-pwd"}}}`))

	merged := mergeTagsCredentials(newTags, oldTags)
	root := decodeTagsJSON(t, merged)
	cli, _ := root["cli_config"].(map[string]interface{})
	if _, exists := cli["ssh_config"]; exists {
		t.Fatal("新 tags 未包含 ssh_config 时不应从旧 tags 恢复该配置块")
	}
}

func TestMergeTagsCredentials_EmptyOldTagsReturnsNewAsIs(t *testing.T) {
	newTags := datatypes.JSON([]byte(`{"cli_config":{"ssh_config":{"port":22}}}`))
	merged := mergeTagsCredentials(newTags, nil)
	if string(merged) != string(newTags) {
		t.Fatalf("旧 tags 为空应原样返回新 tags，实际: %s", string(merged))
	}
}

func TestSSHKeyCredentials_KeyAuthEnabled(t *testing.T) {
	device := devices.Device{Tags: datatypes.JSON([]byte(`{"cli_config":{"ssh_config":{
		"use_key_auth":true,"private_key":"KEY-CONTENT","key_passphrase":"KEY-PASS"}}}`))}

	privateKey, passphrase := device.SSHKeyCredentials()
	if privateKey != "KEY-CONTENT" || passphrase != "KEY-PASS" {
		t.Fatalf("use_key_auth=true 应返回私钥与口令，实际: %q / %q", privateKey, passphrase)
	}
}

func TestSSHKeyCredentials_KeyAuthDisabledReturnsEmpty(t *testing.T) {
	device := devices.Device{Tags: datatypes.JSON([]byte(`{"cli_config":{"ssh_config":{
		"use_key_auth":false,"private_key":"RESIDUAL-KEY"}}}`))}

	if privateKey, _ := device.SSHKeyCredentials(); privateKey != "" {
		t.Fatalf("use_key_auth=false 时即使 tags 残留私钥也不应返回，实际: %q", privateKey)
	}
}

func TestSSHKeyCredentials_EmptyTagsReturnsEmpty(t *testing.T) {
	device := devices.Device{}
	if privateKey, passphrase := device.SSHKeyCredentials(); privateKey != "" || passphrase != "" {
		t.Fatalf("空 tags 应返回空凭据，实际: %q / %q", privateKey, passphrase)
	}
}
