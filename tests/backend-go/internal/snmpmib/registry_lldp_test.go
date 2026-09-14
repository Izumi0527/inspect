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
