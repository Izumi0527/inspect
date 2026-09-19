package snmpmib_test

import (
	"testing"

	"github.com/your-org/inspect-system/backend-go/internal/snmpmib"
)

// LLDP-MIB 与 sysServices 的 OID 必须进 registry：采集端不允许硬编码 OID。
func TestDefaultRegistry_ContainsLLDPAndSysServices(t *testing.T) {
	registry, err := snmpmib.DefaultRegistry()
	if err != nil {
		t.Fatalf("DefaultRegistry() error = %v", err)
	}
	if got := registry.Common.System.SysServices.OID; got != "1.3.6.1.2.1.1.7.0" {
		t.Fatalf("sys_services oid = %q", got)
	}

	lldp := registry.Common.LLDP
	want := map[string]string{
		"loc_sys_cap_enabled":     lldp.LocSysCapEnabled.OID,
		"loc_port_id":             lldp.LocPortID.OID,
		"loc_port_desc":           lldp.LocPortDesc.OID,
		"rem_chassis_id_subtype":  lldp.RemChassisIDSubtype.OID,
		"rem_chassis_id":          lldp.RemChassisID.OID,
		"rem_port_id_subtype":     lldp.RemPortIDSubtype.OID,
		"rem_port_id":             lldp.RemPortID.OID,
		"rem_port_desc":           lldp.RemPortDesc.OID,
		"rem_sys_name":            lldp.RemSysName.OID,
		"rem_sys_desc":            lldp.RemSysDesc.OID,
		"rem_sys_cap_enabled":     lldp.RemSysCapEnabled.OID,
		"rem_man_addr_if_subtype": lldp.RemManAddrIfSubtype.OID,
	}
	for key, oid := range want {
		if oid == "" {
			t.Errorf("common.lldp.%s.oid 为空", key)
		}
	}
	if lldp.RemSysName.OID != "1.0.8802.1.1.2.1.4.1.1.9" {
		t.Fatalf("rem_sys_name oid = %q", lldp.RemSysName.OID)
	}
	if lldp.LocSysCapEnabled.OID != "1.0.8802.1.1.2.1.3.6.0" {
		t.Fatalf("loc_sys_cap_enabled oid = %q", lldp.LocSysCapEnabled.OID)
	}
}

// TestDefaultRegistry_ContainsLLDPReachabilityAndIdentityOIDs 区分「视图未放行」与「无邻居」
// 依赖 LLDP-MIB 标量探针（lldpLocChassisId）与厂商全局开关（华为 hwLldpEnable 在缺省视图内可读）；
// 设备自身身份匹配依赖桥 MAC（dot1dBaseBridgeAddress，华为 LLDP 机箱 ID 即桥 MAC）。
func TestDefaultRegistry_ContainsLLDPReachabilityAndIdentityOIDs(t *testing.T) {
	registry, err := snmpmib.DefaultRegistry()
	if err != nil {
		t.Fatalf("DefaultRegistry() error = %v", err)
	}

	lldp := registry.Common.LLDP
	if lldp.LocChassisIDSubtype.OID != "1.0.8802.1.1.2.1.3.1.0" {
		t.Fatalf("loc_chassis_id_subtype oid = %q", lldp.LocChassisIDSubtype.OID)
	}
	if lldp.LocChassisID.OID != "1.0.8802.1.1.2.1.3.2.0" || lldp.LocChassisID.Method != "get" {
		t.Fatalf("loc_chassis_id = %+v", lldp.LocChassisID)
	}
	if got := registry.Common.System.Dot1dBaseBridgeAddress.OID; got != "1.3.6.1.2.1.17.1.1.0" {
		t.Fatalf("dot1d_base_bridge_address oid = %q", got)
	}
	if got := registry.Vendors["huawei"].LLDPEnable.OID; got != "1.3.6.1.4.1.2011.5.25.134.1.1.1.0" {
		t.Fatalf("vendors.huawei.lldp_enable oid = %q", got)
	}
	if got := registry.Vendors["h3c"].LLDPEnable.OID; got != "" {
		t.Fatalf("h3c 未核实过全局开关 OID，不应配置，got %q", got)
	}
}
