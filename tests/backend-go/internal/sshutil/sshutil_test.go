package sshutil_test

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/pem"
	"strings"
	"testing"

	"golang.org/x/crypto/ssh"

	"github.com/your-org/inspect-system/backend-go/internal/sshutil"
)

// generateTestKey 运行时生成测试专用 ed25519 私钥 PEM 文本（passphrase 非空时生成加密私钥），
// 避免在仓库中硬编码任何私钥文本。
func generateTestKey(t *testing.T, passphrase string) string {
	t.Helper()
	_, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("生成 ed25519 密钥失败: %v", err)
	}

	var block *pem.Block
	if passphrase == "" {
		block, err = ssh.MarshalPrivateKey(priv, "test-key")
	} else {
		block, err = ssh.MarshalPrivateKeyWithPassphrase(priv, "test-key", []byte(passphrase))
	}
	if err != nil {
		t.Fatalf("序列化私钥失败: %v", err)
	}
	return string(pem.EncodeToMemory(block))
}

func TestBuildAuthMethods_EmptyCredentialsShouldFail(t *testing.T) {
	if _, err := sshutil.BuildAuthMethods("", "", ""); err == nil {
		t.Fatal("密码与私钥均为空时应返回错误")
	}
}

func TestBuildAuthMethods_PasswordOnlyShouldIncludeKeyboardInteractive(t *testing.T) {
	methods, err := sshutil.BuildAuthMethods("secret", "", "")
	if err != nil {
		t.Fatalf("仅密码时不应报错: %v", err)
	}
	// password + keyboard-interactive 自动应答（华为/H3C 常配 interactive 认证）
	if len(methods) != 2 {
		t.Fatalf("仅密码应产生 2 种认证方法（password + keyboard-interactive），实际 %d", len(methods))
	}
}

func TestBuildAuthMethods_PrivateKeyOnly(t *testing.T) {
	key := generateTestKey(t, "")
	methods, err := sshutil.BuildAuthMethods("", key, "")
	if err != nil {
		t.Fatalf("有效私钥不应报错: %v", err)
	}
	if len(methods) != 1 {
		t.Fatalf("仅私钥应产生 1 种认证方法，实际 %d", len(methods))
	}
}

func TestBuildAuthMethods_PasswordAndKeyCombined(t *testing.T) {
	key := generateTestKey(t, "")
	methods, err := sshutil.BuildAuthMethods("secret", key, "")
	if err != nil {
		t.Fatalf("密码+私钥不应报错: %v", err)
	}
	if len(methods) != 3 {
		t.Fatalf("密码+私钥应产生 3 种认证方法（publickey 优先 + password + keyboard-interactive），实际 %d", len(methods))
	}
}

func TestBuildAuthMethods_PastedKeyWithSurroundingWhitespace(t *testing.T) {
	// 模拟前端文本框粘贴：首尾空白 + 缺失结尾换行
	key := "  \n" + strings.TrimRight(generateTestKey(t, ""), "\n") + "  "
	if _, err := sshutil.BuildAuthMethods("", key, ""); err != nil {
		t.Fatalf("带首尾空白的私钥应被规整后解析成功: %v", err)
	}
}

func TestBuildAuthMethods_EncryptedKeyWithoutPassphraseShouldHint(t *testing.T) {
	key := generateTestKey(t, "topsecret")
	_, err := sshutil.BuildAuthMethods("", key, "")
	if err == nil {
		t.Fatal("加密私钥未提供口令应报错")
	}
	if !strings.Contains(err.Error(), "口令") {
		t.Fatalf("错误信息应提示需要口令，实际: %v", err)
	}
}

func TestBuildAuthMethods_EncryptedKeyWithPassphrase(t *testing.T) {
	key := generateTestKey(t, "topsecret")
	methods, err := sshutil.BuildAuthMethods("", key, "topsecret")
	if err != nil {
		t.Fatalf("加密私钥+正确口令不应报错: %v", err)
	}
	if len(methods) != 1 {
		t.Fatalf("应产生 1 种认证方法，实际 %d", len(methods))
	}
}

func TestBuildAuthMethods_InvalidKeyShouldFail(t *testing.T) {
	if _, err := sshutil.BuildAuthMethods("", "not a valid key", ""); err == nil {
		t.Fatal("无效私钥内容应报错")
	}
}
