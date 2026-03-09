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
