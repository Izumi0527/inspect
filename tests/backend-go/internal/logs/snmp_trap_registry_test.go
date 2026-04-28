package logs_test

import (
	"testing"
	_ "unsafe"

	_ "github.com/your-org/inspect-system/backend-go/internal/logs"
	"github.com/your-org/inspect-system/backend-go/internal/snmpmib"
)

//go:linkname loadTrapSection github.com/your-org/inspect-system/backend-go/internal/logs.loadTrapSection
func loadTrapSection() (snmpmib.TrapSection, error)

//go:linkname trapOverrideForOID github.com/your-org/inspect-system/backend-go/internal/logs.trapOverrideForOID
func trapOverrideForOID(oid string) (string, string, bool)

func TestLoadTrapSection_ShouldUseRegistryCoreOIDs(t *testing.T) {
	section, err := loadTrapSection()
	if err != nil {
		t.Fatalf("loadTrapSection error: %v", err)
	}

	if section.Core.TrapOID != "1.3.6.1.6.3.1.1.4.1.0" {
		t.Fatalf("trap oid=%q", section.Core.TrapOID)
	}

	if section.Core.Community != "1.3.6.1.6.3.18.1.4.0" {
		t.Fatalf("community oid=%q", section.Core.Community)
	}
}

func TestTrapOverrideForOID_ShouldUseRegistryOverrides(t *testing.T) {
	level, facility, ok := trapOverrideForOID("1.3.6.1.6.3.1.1.5.3")
	if !ok {
		t.Fatal("override not found")
	}

	if level != "warning" {
		t.Fatalf("level=%q, want warning", level)
	}

	if facility != "interface" {
		t.Fatalf("facility=%q, want interface", facility)
	}
}
