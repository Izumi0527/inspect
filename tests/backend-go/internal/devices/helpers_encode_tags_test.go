package devices_test

import (
	"testing"
	_ "unsafe"

	"gorm.io/datatypes"

	_ "github.com/your-org/inspect-system/backend-go/internal/devices"
)

//go:linkname encodeTags github.com/your-org/inspect-system/backend-go/internal/devices.encodeTags
func encodeTags(tags interface{}) (datatypes.JSON, error)

func TestEncodeTags_InvalidJSONString_ShouldReturnError(t *testing.T) {
	_, err := encodeTags("{invalid-json")
	if err == nil {
		t.Fatalf("expected error, got nil")
	}
}

func TestEncodeTags_ValidJSONString_ShouldReturnJSON(t *testing.T) {
	raw := `{"cli_config":{"cli_protocol":"ssh"}}`
	encoded, err := encodeTags(raw)
	if err != nil {
		t.Fatalf("encodeTags error = %v, want nil", err)
	}
	if string(encoded) != raw {
		t.Fatalf("encodeTags = %s, want %s", string(encoded), raw)
	}
}

