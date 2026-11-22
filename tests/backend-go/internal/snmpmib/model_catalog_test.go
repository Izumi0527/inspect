package snmpmib_test

import (
	"slices"
	"testing"

	"github.com/your-org/inspect-system/backend-go/internal/snmpmib"
)

func TestDefaultHuaweiModelCatalog_LoadAndValidate(t *testing.T) {
	catalog, err := snmpmib.DefaultHuaweiModelCatalog()
	if err != nil {
		t.Fatalf("DefaultHuaweiModelCatalog() error = %v", err)
	}
	if catalog == nil {
		t.Fatal("DefaultHuaweiModelCatalog() returned nil")
	}
	if err := catalog.Validate(); err != nil {
		t.Fatalf("catalog.Validate() error = %v", err)
	}
	if len(catalog.Models) < 40 {
		t.Fatalf("len(catalog.Models) = %d, want >= 40", len(catalog.Models))
	}
}

func TestHuaweiModelCatalog_LookupModel(t *testing.T) {
	catalog, err := snmpmib.DefaultHuaweiModelCatalog()
	if err != nil {
		t.Fatalf("DefaultHuaweiModelCatalog() error = %v", err)
	}

	tests := []struct {
		name           string
		input          string
		wantFound      bool
		wantSeries     string
		wantLayer      string
		wantFormFactor string
		wantPlatform   string
	}{
		{"S5736-S MultiGE", "S5736-S24UM4XC", true, "S5736-S", "access", "fixed", "V600"},
		{"S5736-S 全光", "S5736-S48S4XC", true, "S5736-S", "access", "fixed", "V200"},
		{"S5736-S 电口", "S5736-S24T4XC", true, "S5736-S", "access", "fixed", "V200"},
		{"S5736-S U口", "S5736-S48U4XC", true, "S5736-S", "access", "fixed", "V600"},
		{"S1720 入门接入", "S1720-28GFR-4TP", true, "S1720", "access", "fixed", "V200"},
		{"S2750 百兆PoE", "S2750-20TP-PWR-EI-AC", true, "S2750", "access", "fixed", "V200"},
		{"S5700 经典接入", "S5700-28P-LI-AC", true, "S5700", "access", "fixed", "V200"},
		{"S5700S 最长前缀优先不被 S5700 抢占", "S5700S-28P-LI-AC", true, "S5700S", "access", "fixed", "V200"},
		{"S5720 敏捷千兆", "S5720-52X-EI-AC", true, "S5720", "access", "fixed", "V200"},
		{"S5720S 最长前缀优先", "S5720S-28P-SI-AC", true, "S5720S", "access", "fixed", "V200"},
		{"S5720I 工业宽温", "S5720I-6X-PWH-SI-AC", true, "S5720I", "access", "fixed", "V200"},
		{"S5730 增强接入", "S5730-48C-HI-24S-AC", true, "S5730", "access", "fixed", "V200"},
		{"S5730S 精简增强", "S5730S-48T4X-A", true, "S5730S", "access", "fixed", "V200"},
		{"S5751 园区接入", "S5751-L24T4X", true, "S5751", "access", "fixed", "V600"},
		{"S6700 万兆汇聚", "S6700-48-EI", true, "S6700", "aggregation", "fixed", "V200"},
		{"S6720 万兆核心", "S6720-30C-EI-24S-AC", true, "S6720", "aggregation", "fixed", "V200"},
		{"S6720S 最长前缀优先", "S6720S-26Q-EI-24S-AC", true, "S6720S", "aggregation", "fixed", "V200"},
		{"S5755 带 CloudEngine 前缀", "CloudEngine S5755-H48T4XC", true, "S5755", "access", "fixed", "V600"},
		{"S5735-V2 后缀匹配", "S5735-S24T4XE-V2", true, "S5735-V2", "access", "fixed", "V600"},
		{"S5735 V1 不误匹配 V2", "S5735-S24T4X", true, "S5735", "access", "fixed", "V200"},
		{"S6730-V2 后缀匹配", "S6730-H24X6C-V2", true, "S6730-V2", "aggregation", "fixed", "V600"},
		{"S6750 盒式核心", "S6750-H24X8C", true, "S6750", "aggregation", "fixed", "V600"},
		{"S8700 框式核心", "S8700-6", true, "S8700", "core", "modular", "V600"},
		{"S12700E 框式核心", "S12700E-8", true, "S12700E", "core", "modular", "V600"},
		{"S16700 框式核心", "S16700-4", true, "S16700", "core", "modular", "V600"},
		{"S310 分销接入", "S310-24T4X", true, "S310", "access", "fixed", "V600"},
		{"S530 分销接入", "S530-48T4XE", true, "S530", "access", "fixed", "V600"},
		{"S300 分销接入", "S300-24T4S", true, "S300", "access", "fixed", "V200"},
		{"S500 分销接入", "S500-48T4X", true, "S500", "access", "fixed", "V200"},
		{"S620 商业高密", "S620-24T16X8Y", true, "S620", "access", "fixed", "V600"},
		{"S1730S 极简接入", "S1730S-S24T4S-A", true, "S1730S", "access", "fixed", "V200"},
		{"S2730S 极简接入", "S2730S-S24FT4S-A", true, "S2730S", "access", "fixed", "V200"},
		{"S5731-H 接入", "S5731-H24T4XC", true, "S5731", "access", "fixed", "V200"},
		{"S5732-H 多速率", "S5732-H24UM2CC", true, "S5732", "access", "fixed", "V200"},
		{"S6735-S 汇聚", "S6735-S48X6C", true, "S6735-S", "aggregation", "fixed", "V200"},
		{"S7700 带 Quidway 前缀", "Quidway S7706", true, "S7700", "core", "modular", "V200"},
		{"边界校验：S5000 不应命中 S500", "S5000-24T", false, "", "", "", ""},
		{"非华为型号不应命中", "WS-C2960-24TT-L", false, "", "", "", ""},
		{"空串不应命中", "   ", false, "", "", "", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			profile, ok := catalog.LookupModel(tt.input)
			if ok != tt.wantFound {
				t.Fatalf("LookupModel(%q) ok = %v, want %v (profile=%+v)", tt.input, ok, tt.wantFound, profile)
			}
			if !tt.wantFound {
				return
			}
			if profile.Series != tt.wantSeries {
				t.Errorf("Series = %q, want %q", profile.Series, tt.wantSeries)
			}
			if profile.Layer != tt.wantLayer {
				t.Errorf("Layer = %q, want %q", profile.Layer, tt.wantLayer)
			}
			if profile.FormFactor != tt.wantFormFactor {
				t.Errorf("FormFactor = %q, want %q", profile.FormFactor, tt.wantFormFactor)
			}
			if !slices.Contains(profile.Platforms, tt.wantPlatform) {
				t.Errorf("Platforms = %v, want contains %q", profile.Platforms, tt.wantPlatform)
			}
			if profile.PrimaryCPUMIB == "" || profile.PrimaryMemoryMIB == "" {
				t.Errorf("PrimaryCPUMIB/PrimaryMemoryMIB should not be empty: %+v", profile)
			}
		})
	}
}

func TestHuaweiModelCatalog_LookupBySysObjectID(t *testing.T) {
	catalog, err := snmpmib.DefaultHuaweiModelCatalog()
	if err != nil {
		t.Fatalf("DefaultHuaweiModelCatalog() error = %v", err)
	}

	tests := []struct {
		name       string
		oid        string
		wantFound  bool
		wantSeries string
	}{
		{"S5735 精确匹配（带前导点）", ".1.3.6.1.4.1.2011.2.23.982", true, "S5735"},
		{"S6730 精确匹配", "1.3.6.1.4.1.2011.2.23.781", true, "S6730"},
		{"S6735-S 精确匹配", "1.3.6.1.4.1.2011.2.23.964", true, "S6735-S"},
		{"S310 精确匹配", "1.3.6.1.4.1.2011.2.23.1184", true, "S310"},
		{"S8700 子树前缀匹配", ".1.3.6.1.4.1.2011.2.383.1", true, "S8700"},
		{"S16700 子树前缀匹配", "1.3.6.1.4.1.2011.2.409.2", true, "S16700"},
		{"禁止盲目匹配通用根分支 .2011.2.23", "1.3.6.1.4.1.2011.2.23", false, ""},
		{"禁止盲目匹配企业根 .2011", "1.3.6.1.4.1.2011", false, ""},
		{"边界防护：.9820 不得误匹配 .982", "1.3.6.1.4.1.2011.2.23.9820", false, ""},
		{"边界防护：.3830 不得误匹配 .383", "1.3.6.1.4.1.2011.2.3830", false, ""},
		{"未知 OID 返回 false", "1.3.6.1.4.1.9.1.1208", false, ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			profile, ok := catalog.LookupBySysObjectID(tt.oid)
			if ok != tt.wantFound {
				t.Fatalf("LookupBySysObjectID(%q) ok = %v, want %v (profile=%+v)", tt.oid, ok, tt.wantFound, profile)
			}
			if tt.wantFound && profile.Series != tt.wantSeries {
				t.Errorf("Series = %q, want %q", profile.Series, tt.wantSeries)
			}
		})
	}
}
