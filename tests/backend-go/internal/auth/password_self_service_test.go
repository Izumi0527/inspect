package auth_test

import (
	"testing"

	"golang.org/x/crypto/bcrypt"

	"github.com/your-org/inspect-system/backend-go/internal/auth"
	"github.com/your-org/inspect-system/backend-go/internal/config"
)

// PasswordMatches 用于自助改密时校验旧口令，必须无副作用地正确区分匹配/不匹配，
// 并对 nil 用户与空哈希安全返回 false。
func TestPasswordMatches(t *testing.T) {
	svc := auth.NewService(nil, config.Config{}, nil)

	hash, err := bcrypt.GenerateFromPassword([]byte("S3cret!pass"), bcrypt.DefaultCost)
	if err != nil {
		t.Fatalf("生成测试哈希失败: %v", err)
	}
	user := &auth.UserRecord{HashedPassword: string(hash)}

	if !svc.PasswordMatches(user, "S3cret!pass") {
		t.Fatalf("正确口令应匹配")
	}
	if svc.PasswordMatches(user, "wrong-pass") {
		t.Fatalf("错误口令不应匹配")
	}
	if svc.PasswordMatches(nil, "anything") {
		t.Fatalf("nil 用户不应匹配")
	}
	if svc.PasswordMatches(&auth.UserRecord{}, "anything") {
		t.Fatalf("空哈希不应匹配")
	}
}

func TestUserMustChangePassword(t *testing.T) {
	yes := true
	no := false

	if !auth.UserMustChangePassword(&auth.UserRecord{ForcePasswordChange: &yes}) {
		t.Fatalf("force_password_change=true 应判定为需改密")
	}
	if auth.UserMustChangePassword(&auth.UserRecord{ForcePasswordChange: &no}) {
		t.Fatalf("force_password_change=false 不应判定为需改密")
	}
	if auth.UserMustChangePassword(&auth.UserRecord{}) {
		t.Fatalf("字段为 nil（未设置）不应判定为需改密")
	}
	if auth.UserMustChangePassword(nil) {
		t.Fatalf("nil 用户不应判定为需改密")
	}
}
