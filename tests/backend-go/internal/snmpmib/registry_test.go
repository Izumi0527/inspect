package snmpmib_test

import (
	"testing"

	"github.com/your-org/inspect-system/backend-go/internal/snmpmib"
)

func TestDefaultRegistry_ShouldLoadEmbeddedJSON(t *testing.T) {
	registry, err := snmpmib.DefaultRegistry()
	if err != nil {
		t.Fatalf("DefaultRegistry error: %v", err)
	}

	if registry.SchemaVersion != 1 {
		t.Fatalf("SchemaVersion=%d, want 1", registry.SchemaVersion)
	}

	if registry.Common.Probe.SysDescr.OID != "1.3.6.1.2.1.1.1.0" {
		t.Fatalf("sysDescr oid=%q", registry.Common.Probe.SysDescr.OID)
	}
}

func TestRegistryValidate_ShouldRequireCoreSections(t *testing.T) {
	registry := snmpmib.Registry{}
	err := registry.Validate()
	if err == nil {
		t.Fatal("Validate() error = nil, want non-nil")
	}
}

func TestDefaultRegistry_ShouldContainCurrentSupportedCandidates(t *testing.T) {
	registry, err := snmpmib.DefaultRegistry()
	if err != nil {
		t.Fatalf("DefaultRegistry error: %v", err)
	}

	if len(registry.Metrics.CPUUsage) == 0 {
		t.Fatal("cpu_usage candidates should not be empty")
	}

	if registry.Trap.Core.TrapOID == "" {
		t.Fatal("trap core oid should not be empty")
	}
}

func TestDefaultRegistry_ShouldExposeVendorCatalogEntries(t *testing.T) {
	registry, err := snmpmib.DefaultRegistry()
	if err != nil {
		t.Fatalf("DefaultRegistry error: %v", err)
	}

	huaweiEntries := registry.CatalogEntries("Huawei", "bgp")
	if len(huaweiEntries) == 0 {
		t.Fatal("huawei bgp catalog entries should not be empty")
	}
	if huaweiEntries[0].OID == "" {
		t.Fatal("huawei bgp first entry oid should not be empty")
	}

	h3cEntries := registry.CatalogEntries("h3c_comware", "optical")
	if len(h3cEntries) == 0 {
		t.Fatal("h3c optical catalog entries should not be empty")
	}
}

func TestRegistryValidate_ShouldRejectCatalogVendorOutsideVendorList(t *testing.T) {
	registry := snmpmib.Registry{
		SchemaVersion: 1,
		Vendors: map[string]snmpmib.Vendor{
			"huawei": {DisplayName: "Huawei"},
		},
		Common: snmpmib.CommonSection{
			Probe: snmpmib.ProbeSection{
				SysDescr: snmpmib.OIDDefinition{OID: "1.3.6.1.2.1.1.1.0", Method: "get"},
			},
			System: snmpmib.SystemSection{
				SysUptime: snmpmib.OIDDefinition{OID: "1.3.6.1.2.1.1.3.0", Method: "get"},
			},
			Interfaces: snmpmib.InterfacesSection{
				IfDescr:       snmpmib.OIDDefinition{OID: "1.3.6.1.2.1.2.2.1.2", Method: "bulkwalk"},
				IfHCInOctets:  snmpmib.OIDDefinition{OID: "1.3.6.1.2.1.31.1.1.1.6", Method: "bulkwalk"},
				IfHCOutOctets: snmpmib.OIDDefinition{OID: "1.3.6.1.2.1.31.1.1.1.10", Method: "bulkwalk"},
			},
		},
		Metrics: snmpmib.MetricsSection{
			CPUUsage: []snmpmib.MetricCandidate{
				{
					ID:       "default_cpu",
					Vendors:  []string{"*"},
					Method:   "get",
					OIDs:     []string{"1.3.6.1.4.1.9.2.1.56.0"},
					Strategy: "get_percent",
				},
			},
			MemoryUsage: []snmpmib.MetricCandidate{
				{
					ID:       "default_memory",
					Vendors:  []string{"*"},
					Method:   "get",
					OIDs:     []string{"1.3.6.1.4.1.2021.4.5.0", "1.3.6.1.4.1.2021.4.6.0"},
					Strategy: "get_total_avail_kb",
				},
			},
			Temperature: []snmpmib.MetricCandidate{
				{
					ID:       "default_temperature",
					Vendors:  []string{"*"},
					Method:   "bulkwalk",
					OIDs:     []string{"1.3.6.1.4.1.9.9.13.1.3.1.3"},
					Strategy: "walk_max_celsius",
				},
			},
		},
		Catalog: snmpmib.FeatureCatalog{
			"unknown_vendor": {
				"bgp": []snmpmib.CatalogOID{
					{
						ID:          "test_bgp_state",
						Name:        "testBgpState",
						OID:         "1.3.6.1.4.1.9999.1.1.1",
						Method:      "bulkwalk",
						ValueType:   "integer",
						Description: "测试 BGP 状态",
					},
				},
			},
		},
		Trap: snmpmib.TrapSection{
			Core: snmpmib.TrapCoreSection{
				TrapOID:      "1.3.6.1.6.3.1.1.4.1.0",
				SysUptime:    "1.3.6.1.2.1.1.3.0",
				Community:    "1.3.6.1.6.3.18.1.4.0",
				Enterprise:   "1.3.6.1.6.3.18.1.5.0",
				AgentAddress: "1.3.6.1.6.3.18.1.3.0",
			},
		},
	}

	if err := registry.Validate(); err == nil {
		t.Fatal("Validate() error = nil, want non-nil when catalog references unknown vendor")
	}
}
