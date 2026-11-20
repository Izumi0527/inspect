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

func TestRegistry_ResolveVendorByContext_HuaweiAliasesAndSysObjectID(t *testing.T) {
	registry, err := snmpmib.DefaultRegistry()
	if err != nil {
		t.Fatalf("DefaultRegistry error: %v", err)
	}

	cases := []struct {
		name        string
		vendor      string
		sysObjectID string
		sysDescr    string
		want        string
	}{
		{
			name:   "chinese_alias",
			vendor: "华为",
			want:   "huawei",
		},
		{
			name:   "huawei_technologies_alias",
			vendor: "Huawei Technologies",
			want:   "huawei",
		},
		{
			name:   "huawei_v600_alias",
			vendor: "huawei_v600",
			want:   "huawei",
		},
		{
			name:        "other_vendor_with_huawei_sysobjectid",
			vendor:      "other",
			sysObjectID: ".1.3.6.1.4.1.2011.2.23.982",
			want:        "huawei",
		},
		{
			name:        "empty_vendor_with_cloudengine_sysdescr",
			vendor:      "",
			sysObjectID: "",
			sysDescr:    "Huawei Versatile Routing Platform Software (CloudEngine S5736-S24S4XC V600R022C00)",
			want:        "huawei",
		},
		{
			name:        "enterprise_prefix_boundary_should_not_match_20110",
			vendor:      "other",
			sysObjectID: ".1.3.6.1.4.1.20110.1.1",
			want:        "other",
		},
		{
			name:        "h3c_sysobjectid_fallback",
			vendor:      "",
			sysObjectID: ".1.3.6.1.4.1.25506.1.1",
			want:        "h3c",
		},
		{
			name:     "h3c_sysdescr_fallback",
			vendor:   "unknown",
			sysDescr: "H3C Comware Platform Software",
			want:     "h3c",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := registry.ResolveVendorByContext(tc.vendor, tc.sysObjectID, tc.sysDescr)
			if got != tc.want {
				t.Fatalf("ResolveVendorByContext(%q, %q, %q) = %q, want %q", tc.vendor, tc.sysObjectID, tc.sysDescr, got, tc.want)
			}
		})
	}

	cpuCandidates := registry.MetricCandidates("cpu_usage", "huawei")
	if len(cpuCandidates) < 4 {
		t.Fatalf("len(cpuCandidates) = %d, want >= 4", len(cpuCandidates))
	}
	if cpuCandidates[0].ID != "huawei_entity_cpu" {
		t.Fatalf("first cpu candidate = %q, want huawei_entity_cpu", cpuCandidates[0].ID)
	}
	if len(cpuCandidates[0].OIDs) != 1 || cpuCandidates[0].OIDs[0] != "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.5" {
		t.Fatalf("first cpu candidate oids = %v, want [1.3.6.1.4.1.2011.5.25.31.1.1.1.1.5]", cpuCandidates[0].OIDs)
	}

	memCandidates := registry.MetricCandidates("memory_usage", "huawei")
	if len(memCandidates) < 4 {
		t.Fatalf("len(memCandidates) = %d, want >= 4", len(memCandidates))
	}
	if memCandidates[0].ID != "huawei_entity_memory_mega" {
		t.Fatalf("first memory candidate = %q, want huawei_entity_memory_mega", memCandidates[0].ID)
	}
	if len(memCandidates[0].OIDs) != 2 ||
		memCandidates[0].OIDs[0] != "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.7" ||
		memCandidates[0].OIDs[1] != "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.19" {
		t.Fatalf("first memory candidate oids = %v", memCandidates[0].OIDs)
	}
	if memCandidates[1].ID != "huawei_entity_memory_bytes" {
		t.Fatalf("second memory candidate = %q, want huawei_entity_memory_bytes", memCandidates[1].ID)
	}
	if len(memCandidates[1].OIDs) != 2 ||
		memCandidates[1].OIDs[0] != "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.7" ||
		memCandidates[1].OIDs[1] != "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.9" {
		t.Fatalf("second memory candidate oids = %v", memCandidates[1].OIDs)
	}
	for _, candidate := range memCandidates {
		if candidate.ID == "huawei_mem_dev" || candidate.ID == "huawei_entity_memory_mega" || candidate.ID == "huawei_entity_memory_bytes" || candidate.ID == "huawei_entity_memory_usage_only" {
			for _, oid := range candidate.OIDs {
				if oid == "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.10" {
					t.Fatalf("memory candidate %q still references wrong hwEntityUpTime OID .10", candidate.ID)
				}
			}
		}
	}
}

func TestRegistry_ResolveVendorByContext_ThirdPartyAndSysDescrBoundaries(t *testing.T) {
	registry, err := snmpmib.DefaultRegistry()
	if err != nil {
		t.Fatalf("DefaultRegistry error: %v", err)
	}

	cases := []struct {
		name        string
		vendor      string
		sysObjectID string
		sysDescr    string
		want        string
	}{
		{
			name:        "explicit_third_party_vendor_not_overridden_by_sysdescr",
			vendor:      "cisco",
			sysObjectID: "",
			sysDescr:    "Linux huawei-cloud-host",
			want:        "cisco",
		},
		{
			name:        "third_party_enterprise_oid_not_overridden_by_sysdescr",
			vendor:      "other",
			sysObjectID: ".1.3.6.1.4.1.8072.3.2.10",
			sysDescr:    "Linux huawei-server",
			want:        "other",
		},
		{
			name:        "generic_linux_hostname_with_huawei_not_misclassified",
			vendor:      "",
			sysObjectID: "",
			sysDescr:    "Linux huawei-node",
			want:        "",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := registry.ResolveVendorByContext(tc.vendor, tc.sysObjectID, tc.sysDescr)
			if got != tc.want {
				t.Fatalf("ResolveVendorByContext(%q, %q, %q) = %q, want %q", tc.vendor, tc.sysObjectID, tc.sysDescr, got, tc.want)
			}
		})
	}
}
