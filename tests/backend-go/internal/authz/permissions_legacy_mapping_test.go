package authz_test

import (
	"testing"

	"github.com/your-org/inspect-system/backend-go/internal/authz"
)

func TestLegacyPermissionKeyMappings(t *testing.T) {
	t.Run("旧key能映射为新key", func(t *testing.T) {
		if got := authz.NormalizePermissionKey("device:read"); got != "devices:read" {
			t.Fatalf("期望 device:read => devices:read，got=%q", got)
		}
		if got := authz.NormalizePermissionKey("alert:read"); got != "alerts:read" {
			t.Fatalf("期望 alert:read => alerts:read，got=%q", got)
		}
	})

	t.Run("不会产生误命中", func(t *testing.T) {
		if authz.NormalizePermissionKey("device:read") == authz.NormalizePermissionKey("devices:update") {
			t.Fatalf("不应把 devices:update 误判为已授权")
		}
	})
}

