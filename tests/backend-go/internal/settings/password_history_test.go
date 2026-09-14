package settings_test

import (
	"testing"
	_ "unsafe"

	"golang.org/x/crypto/bcrypt"
)

//go:linkname passwordReusedRecently github.com/your-org/inspect-system/backend-go/internal/settings.passwordReusedRecently
func passwordReusedRecently(newPassword string, recentHashes []string) bool

func mustHash(t *testing.T, plain string) string {
	t.Helper()
	h, err := bcrypt.GenerateFromPassword([]byte(plain), bcrypt.MinCost)
	if err != nil {
		t.Fatalf("bcrypt: %v", err)
	}
	return string(h)
}

func TestPasswordReusedRecently(t *testing.T) {
	recent := []string{mustHash(t, "OldPass1!"), mustHash(t, "OlderPass2!"), "not-a-bcrypt-hash"}

	if !passwordReusedRecently("OldPass1!", recent) {
		t.Fatalf("与最近密码相同应判定为重复使用")
	}
	if !passwordReusedRecently("OlderPass2!", recent) {
		t.Fatalf("与更早的历史密码相同也应判定为重复使用")
	}
	if passwordReusedRecently("Fresh3!", recent) {
		t.Fatalf("全新密码不应判定为重复使用")
	}
	if passwordReusedRecently("Fresh3!", nil) {
		t.Fatalf("无历史记录时不应判定为重复使用")
	}
}
