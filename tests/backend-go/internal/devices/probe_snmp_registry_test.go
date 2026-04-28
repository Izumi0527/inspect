package devices_test

import (
	"testing"
	_ "unsafe"

	_ "github.com/your-org/inspect-system/backend-go/internal/devices"
)

//go:linkname probeSystemDescrOID github.com/your-org/inspect-system/backend-go/internal/devices.probeSystemDescrOID
func probeSystemDescrOID() (string, error)

func TestProbeSNMP_ShouldUseRegistryProbeOID(t *testing.T) {
	oid, err := probeSystemDescrOID()
	if err != nil {
		t.Fatalf("probeSystemDescrOID error: %v", err)
	}

	if oid != "1.3.6.1.2.1.1.1.0" {
		t.Fatalf("probe sysDescr oid=%q, want %q", oid, "1.3.6.1.2.1.1.1.0")
	}
}
