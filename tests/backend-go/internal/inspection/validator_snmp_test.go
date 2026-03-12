package inspection_test

import (
	"errors"
	"testing"

	"github.com/your-org/inspect-system/backend-go/internal/inspection"
)

func TestValidateSNMPConfig_ShouldAllowOIDUsedAndOIDFree(t *testing.T) {
	v := inspection.NewTemplateValidator(&inspection.Service{})
	err := v.ValidateSNMPConfig(map[string]interface{}{
		"oid_used": "1.3.6.1.4.1.9.9.48.1.1.1.5",
		"oid_free": "1.3.6.1.4.1.9.9.48.1.1.1.6",
	})
	if err != nil {
		t.Fatalf("ValidateSNMPConfig: %v", err)
	}
}

func TestValidateSNMPConfig_ShouldAllowEmptyConfigForConnectivityCheck(t *testing.T) {
	v := inspection.NewTemplateValidator(&inspection.Service{})
	err := v.ValidateSNMPConfig(map[string]interface{}{})
	if err != nil {
		t.Fatalf("ValidateSNMPConfig: %v", err)
	}
}

func TestValidateSNMPConfig_ShouldRejectInvalidOIDUsed(t *testing.T) {
	v := inspection.NewTemplateValidator(&inspection.Service{})
	err := v.ValidateSNMPConfig(map[string]interface{}{
		"oid_used": "1.3.bad.oid",
	})
	if err == nil {
		t.Fatalf("ValidateSNMPConfig: want error, got nil")
	}

	var ve *inspection.ValidationError
	if !errors.As(err, &ve) {
		t.Fatalf("ValidateSNMPConfig error type = %T, want *inspection.ValidationError", err)
	}
	if ve.Field != "config.oid_used" {
		t.Fatalf("ValidationError.Field = %q, want %q", ve.Field, "config.oid_used")
	}
}

