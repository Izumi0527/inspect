package snmpmib_test

import (
	"testing"

	"github.com/your-org/inspect-system/backend-go/internal/snmpmib"
)

func TestRewriteOIDPrefixAndCanonicalize(t *testing.T) {
	cases := []struct {
		name string
		oid  string
		from string
		to   string
		want string
	}{
		{
			name: "重写2011子分支为56813",
			oid:  ".1.3.6.1.4.1.2011.5.25.31.1.1.1.1.5",
			from: "1.3.6.1.4.1.2011",
			to:   "1.3.6.1.4.1.56813",
			want: "1.3.6.1.4.1.56813.5.25.31.1.1.1.1.5",
		},
		{
			name: "精确相等根OID重写",
			oid:  "1.3.6.1.4.1.2011",
			from: "1.3.6.1.4.1.2011",
			to:   "1.3.6.1.4.1.56813",
			want: "1.3.6.1.4.1.56813",
		},
		{
			name: "边界防护_20110不得误改",
			oid:  "1.3.6.1.4.1.20110.1.1",
			from: "1.3.6.1.4.1.2011",
			to:   "1.3.6.1.4.1.56813",
			want: "1.3.6.1.4.1.20110.1.1",
		},
		{
			name: "标准MIB不得改写",
			oid:  "1.3.6.1.2.1.25.3.3.1.2",
			from: "1.3.6.1.4.1.2011",
			to:   "1.3.6.1.4.1.56813",
			want: "1.3.6.1.2.1.25.3.3.1.2",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := snmpmib.RewriteOIDPrefix(tc.oid, tc.from, tc.to); got != tc.want {
				t.Fatalf("RewriteOIDPrefix(%q, %q, %q) = %q, want %q", tc.oid, tc.from, tc.to, got, tc.want)
			}
		})
	}

	if got := snmpmib.CanonicalizeHuaweiEnterpriseOID(".1.3.6.1.4.1.56813.5.25.31.1.1.1.1.5"); got != "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.5" {
		t.Fatalf("CanonicalizeHuaweiEnterpriseOID(56813) = %q", got)
	}
	if got := snmpmib.CanonicalizeHuaweiEnterpriseOID("1.3.6.1.4.1.568130.1"); got != "1.3.6.1.4.1.568130.1" {
		t.Fatalf("CanonicalizeHuaweiEnterpriseOID(568130) = %q, should not rewrite", got)
	}
}

func TestRegistry_FutureMatrixEnterpriseMappingAndCatalog(t *testing.T) {
	registry, err := snmpmib.DefaultRegistry()
	if err != nil {
		t.Fatalf("DefaultRegistry() error = %v", err)
	}

	t.Run("ResolveVendor与ResolveEnterprisePrefix覆盖56813和FutureMatrix别名", func(t *testing.T) {
		if got := registry.ResolveVendor("FutureMatrix"); got != "huawei" {
			t.Fatalf("ResolveVendor(FutureMatrix) = %q, want huawei", got)
		}
		if got := registry.ResolveVendor("huarong"); got != "huawei" {
			t.Fatalf("ResolveVendor(huarong) = %q, want huawei", got)
		}
		if got := registry.ResolveVendorByContext("", ".1.3.6.1.4.1.56813.2.23.811", ""); got != "huawei" {
			t.Fatalf("ResolveVendorByContext(56813) = %q, want huawei", got)
		}
		if got := registry.ResolveVendorByContext("", "", "FutureMatrix S5736-S24T4XC Software V200R025C00"); got != "huawei" {
			t.Fatalf("ResolveVendorByContext(sysDescr FutureMatrix) = %q, want huawei", got)
		}

		canonical, active := registry.ResolveEnterprisePrefix("other", ".1.3.6.1.4.1.56813.2.23.811", "")
		if canonical != "1.3.6.1.4.1.2011" || active != "1.3.6.1.4.1.56813" {
			t.Fatalf("ResolveEnterprisePrefix(56813) = (%q, %q)", canonical, active)
		}

		canonical, active = registry.ResolveEnterprisePrefix("futurematrix", "", "")
		if canonical != "1.3.6.1.4.1.2011" || active != "1.3.6.1.4.1.56813" {
			t.Fatalf("ResolveEnterprisePrefix(futurematrix) = (%q, %q)", canonical, active)
		}

		canonical, active = registry.ResolveEnterprisePrefix("huawei", ".1.3.6.1.4.1.2011.2.23.982", "")
		if canonical != "1.3.6.1.4.1.2011" || active != "1.3.6.1.4.1.2011" {
			t.Fatalf("ResolveEnterprisePrefix(2011) = (%q, %q)", canonical, active)
		}
	})

	t.Run("MetricCandidatesForDevice深拷贝并重写56813前缀", func(t *testing.T) {
		cpuCands := registry.MetricCandidatesForDevice("cpu_usage", "", ".1.3.6.1.4.1.56813.2.23.811", "")
		if len(cpuCands) == 0 || cpuCands[0].OIDs[0] != "1.3.6.1.4.1.56813.5.25.31.1.1.1.1.5" {
			t.Fatalf("cpuCands[0] = %+v", cpuCands)
		}
		// 深拷贝保护：修改返回切片不得污染原始 registry
		cpuCands[0].OIDs[0] = "MUTATED"
		fresh := registry.MetricCandidates("cpu_usage", "huawei")
		if fresh[0].OIDs[0] != "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.5" {
			t.Fatalf("registry OIDs mutated: %v", fresh[0].OIDs)
		}
		// 标准 MIB 候选不得被改写
		foundHostRes := false
		for _, c := range cpuCands {
			if c.ID == "host_resources_processor_load" && c.OIDs[0] == "1.3.6.1.2.1.25.3.3.1.2" {
				foundHostRes = true
			}
		}
		if !foundHostRes {
			t.Fatalf("standard host_resources candidate missing or rewritten: %+v", cpuCands)
		}
	})

	t.Run("CatalogEntriesForDevice与VendorLLDPEnableOIDForDevice重写及新增节点校验", func(t *testing.T) {
		envEntries := registry.CatalogEntriesForDevice("", "environment", ".1.3.6.1.4.1.56813.2.23.811", "")
		hasV2FaultLight := false
		for _, e := range envEntries {
			if e.ID == "huawei_entity_fault_light_v2" && e.OID == "1.3.6.1.4.1.56813.5.25.31.1.1.1.1.42" {
				hasV2FaultLight = true
			}
		}
		if !hasV2FaultLight {
			t.Fatalf("huawei_entity_fault_light_v2 missing or not rewritten: %+v", envEntries)
		}

		idEntries := registry.CatalogEntriesForDevice("", "identity", ".1.3.6.1.4.1.56813.2.23.811", "")
		hasCompatProd, hasESN := false, false
		for _, e := range idEntries {
			if e.ID == "huawei_compatible_product_name" && e.OID == "1.3.6.1.4.1.56813.6.3.11.4" {
				hasCompatProd = true
			}
			if e.ID == "huawei_device_esn" && e.OID == "1.3.6.1.4.1.56813.5.25.188.1.1" {
				hasESN = true
			}
		}
		if !hasCompatProd || !hasESN {
			t.Fatalf("identity FM entries missing: compat=%v esn=%v (%+v)", hasCompatProd, hasESN, idEntries)
		}

		lldpOID := registry.VendorLLDPEnableOIDForDevice("", ".1.3.6.1.4.1.56813.2.23.811", "")
		if lldpOID != "1.3.6.1.4.1.56813.5.25.134.1.1.1.0" {
			t.Fatalf("VendorLLDPEnableOIDForDevice = %q", lldpOID)
		}
	})
}

func TestModelCatalogAndKnowledge_FutureMatrixSupport(t *testing.T) {
	modelCat, err := snmpmib.DefaultHuaweiModelCatalog()
	if err != nil {
		t.Fatalf("DefaultHuaweiModelCatalog() error = %v", err)
	}

	for _, tc := range []struct {
		model      string
		wantSeries string
	}{
		{"S600-24T4X", "S600"},
		{"FutureMatrix S5736-S24T4XC", "S5736-S"},
		{"S300-2-24T4S", "S300"},
		{"S5735-L24T4X-A", "S5735"},
		{"S5735-L2-24T4X", "S5735"},
		{"S5735S-L1-24T", "S5735"},
		{"S5735S-L2-24T", "S5735"},
		{"S5735-S-X24T4XE", "S5735"},
		{"S5735S-S-X24T4XE", "S5735"},
		{"S6720S-S26Q", "S6720S"},
	} {
		p, ok := modelCat.LookupModel(tc.model)
		if !ok || p.Series != tc.wantSeries {
			t.Fatalf("LookupModel(%q) = (%q, %v), want %q", tc.model, p.Series, ok, tc.wantSeries)
		}
	}

	if p, ok := modelCat.LookupBySysObjectID(".1.3.6.1.4.1.56813.2.23.811"); !ok || p.Series != "S5736-S" {
		t.Fatalf("LookupBySysObjectID(56813.2.23.811) = (%q, %v), want S5736-S", p.Series, ok)
	}
	if p, ok := modelCat.LookupBySysObjectID("1.3.6.1.4.1.2011.2.23.811"); !ok || p.Series != "S5736-S" {
		t.Fatalf("LookupBySysObjectID(2011.2.23.811) = (%q, %v), want S5736-S", p.Series, ok)
	}
	if p, ok := modelCat.LookupBySysObjectID("1.3.6.1.4.1.56813.2.23.781"); !ok || p.Series != "S6730" {
		t.Fatalf("LookupBySysObjectID(56813.2.23.781 canonical fallback) = (%q, %v), want S6730", p.Series, ok)
	}
	if _, ok := modelCat.LookupBySysObjectID("1.3.6.1.4.1.56813.2.23"); ok {
		t.Fatal("generic 56813.2.23 root OID must not match")
	}

	alarmCat, err := snmpmib.DefaultAlarmCatalog()
	if err != nil {
		t.Fatalf("DefaultAlarmCatalog() error = %v", err)
	}
	if def, ok := alarmCat.LookupTrap(".1.3.6.1.4.1.56813.5.25.219.2.5.3"); !ok || def.Name == "" {
		t.Fatalf("LookupTrap(56813 powerFail) = (%+v, %v)", def, ok)
	}
	if node, suffix, ok := alarmCat.LookupNode(".1.3.6.1.4.1.56813.5.25.129.1.1.0"); !ok || node.Name == "" || suffix != "0" {
		t.Fatalf("LookupNode(56813 severity.0) = (%+v, %q, %v)", node, suffix, ok)
	}
	if sev, ok := alarmCat.SeverityFromVarbinds(map[string]string{".1.3.6.1.4.1.56813.5.25.129.1.1.0": "3"}); !ok || sev != "critical" {
		t.Fatalf("SeverityFromVarbinds(56813) = (%q, %v), want (critical, true)", sev, ok)
	}

	kb, err := snmpmib.DefaultHuaweiKnowledgeCatalog()
	if err != nil {
		t.Fatalf("DefaultHuaweiKnowledgeCatalog() error = %v", err)
	}
	if node, suffix, ok := kb.LookupMIB("1.3.6.1.4.1.56813.5.25.31.1.1.3.1.4.101"); !ok || node.Name == "" || suffix != "101" {
		t.Fatalf("LookupMIB(56813) = (%+v, %q, %v)", node, suffix, ok)
	}
	if entry, ok := kb.LookupAlarm("1.3.6.1.4.1.56813.5.25.219.2.4.5", "136193"); !ok || entry.AlarmName == "" {
		t.Fatalf("LookupAlarm(56813) = (%+v, %v)", entry, ok)
	}
	if logEntry, ok := kb.LookupLogFromMessage("2026-11-22 10:00:00 FutureMatrix %% 01 VOSCPU/4/CPU_USAGE_HIGH(l)[1]:CPU usage exceeded."); !ok || logEntry.Mnemonic != "CPU_USAGE_HIGH" {
		t.Fatalf("LookupLogFromMessage(spaced %%) = (%+v, %v)", logEntry, ok)
	}
}
