package ws_test

import (
	"testing"

	"github.com/your-org/inspect-system/backend-go/internal/ws"
)

func TestManagerHasPermission_NormalizesLegacyPermissionKeys(t *testing.T) {
	manager := ws.NewManager()

	connectionID, err := manager.Connect(nil, "u1", nil, []string{
		"alert:read",
		"inspection:read",
		"monitoring:read",
	})
	if err != nil {
		t.Fatalf("Connect() err=%v", err)
	}

	if !manager.HasPermission(connectionID, "alerts:read") {
		t.Fatalf("期望 legacy 权限 alert:read 能命中 alerts:read")
	}

	if !manager.HasPermission(connectionID, "inspections:read") {
		t.Fatalf("期望 legacy 权限 inspection:read 能命中 inspections:read")
	}

	if !manager.HasPermission(connectionID, "monitoring:read") {
		t.Fatalf("期望 monitoring:read 应被识别")
	}

	if manager.HasPermission(connectionID, "system:config") {
		t.Fatalf("未授予 system:config 时不应通过权限校验")
	}
}

