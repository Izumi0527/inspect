package devices_test

import (
	"testing"
	_ "unsafe"

	"github.com/gosnmp/gosnmp"
	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/snmpmib"
	"go.uber.org/zap"
)

//go:linkname collectSwitchExtendedMetrics github.com/your-org/inspect-system/backend-go/internal/devices.(*SNMPCollector).collectSwitchExtendedMetrics
func collectSwitchExtendedMetrics(
	collector *devices.SNMPCollector, target collectorSNMPClient, metrics *devices.SNMPMetrics,
	registry *snmpmib.Registry, vendor, sysObjectID, sysDescr string, diag *devices.SNMPCollectionDiagnostics,
)

//go:linkname enrichComponentsWithFaultLights github.com/your-org/inspect-system/backend-go/internal/devices.enrichComponentsWithFaultLights
func enrichComponentsWithFaultLights(client collectorSNMPClient, items []devices.ComponentStatusMetrics, entries []snmpmib.CatalogOID) []devices.ComponentStatusMetrics

func scalarPacket(oid string, pduType gosnmp.Asn1BER, val interface{}) *gosnmp.SnmpPacket {
	return &gosnmp.SnmpPacket{Variables: []gosnmp.SnmpPDU{{Name: "." + oid, Type: pduType, Value: val}}}
}

func TestRegistry_SwitchCatalogValidationAndFutureMatrixRewrite(t *testing.T) {
	reg, err := snmpmib.DefaultRegistry()
	if err != nil {
		t.Fatalf("DefaultRegistry() error = %v", err)
	}
	if err := reg.Validate(); err != nil {
		t.Fatalf("Validate() error = %v", err)
	}
	if reg.Common.QBridge.Dot1qNumVlans.OID != "1.3.6.1.2.1.17.7.1.1.4.0" {
		t.Fatalf("Dot1qNumVlans.OID = %q", reg.Common.QBridge.Dot1qNumVlans.OID)
	}
	if reg.Common.BridgeSTP.StpDesignatedRoot.OID != "1.3.6.1.2.1.17.2.5.0" {
		t.Fatalf("StpDesignatedRoot.OID = %q", reg.Common.BridgeSTP.StpDesignatedRoot.OID)
	}
	for _, cat := range []string{"poe", "stack", "config_man", "flash", "stp"} {
		hw := reg.CatalogEntriesForDevice("huawei", cat, ".1.3.6.1.4.1.2011.2.23.1", "")
		fm := reg.CatalogEntriesForDevice("huawei", cat, ".1.3.6.1.4.1.56813.2.23.811", "")
		if len(hw) == 0 || len(fm) != len(hw) {
			t.Fatalf("category %s entries hw=%d fm=%d", cat, len(hw), len(fm))
		}
		if fm[0].OID == hw[0].OID || fm[0].OID[:18] != "1.3.6.1.4.1.56813." {
			t.Fatalf("category %s FutureMatrix rewrite failed: hw=%q fm=%q", cat, hw[0].OID, fm[0].OID)
		}
	}
	for _, cat := range []string{"config_man", "stack", "flash"} {
		if len(reg.CatalogEntriesForDevice("h3c", cat, ".1.3.6.1.4.1.25506.1.1", "")) == 0 {
			t.Fatalf("h3c category %s should not be empty", cat)
		}
	}
}

func TestCollectSwitchExtendedMetrics_HuaweiAndFutureMatrix(t *testing.T) {
	reg, err := snmpmib.DefaultRegistry()
	if err != nil {
		t.Fatalf("DefaultRegistry() error = %v", err)
	}
	c := devices.NewSNMPCollectorWithRegistry(zap.NewNop(), reg)
	fm := "1.3.6.1.4.1.56813."
	client := &fakeCollectorSNMPClient{
		getPackets: map[string]*gosnmp.SnmpPacket{
			"1.3.6.1.2.1.17.2.1.0":     scalarPacket("1.3.6.1.2.1.17.2.1.0", gosnmp.Integer, 3),
			"1.3.6.1.2.1.17.2.2.0":     scalarPacket("1.3.6.1.2.1.17.2.2.0", gosnmp.Integer, 32768),
			"1.3.6.1.2.1.17.2.5.0":     scalarPacket("1.3.6.1.2.1.17.2.5.0", gosnmp.OctetString, []byte{0x80, 0x00, 0x00, 0x11, 0x22, 0x33, 0x44, 0x55}),
			"1.3.6.1.2.1.17.2.6.0":     scalarPacket("1.3.6.1.2.1.17.2.6.0", gosnmp.Integer, 200),
			"1.3.6.1.2.1.17.2.7.0":     scalarPacket("1.3.6.1.2.1.17.2.7.0", gosnmp.Integer, 24),
			"1.3.6.1.2.1.17.1.2.0":     scalarPacket("1.3.6.1.2.1.17.1.2.0", gosnmp.Integer, 28),
			"1.3.6.1.2.1.17.7.1.1.2.0": scalarPacket("1.3.6.1.2.1.17.7.1.1.2.0", gosnmp.Integer, 4094),
			"1.3.6.1.2.1.17.7.1.1.3.0": scalarPacket("1.3.6.1.2.1.17.7.1.1.3.0", gosnmp.Gauge32, 4096),
			"1.3.6.1.2.1.17.7.1.1.4.0": scalarPacket("1.3.6.1.2.1.17.7.1.1.4.0", gosnmp.Gauge32, 16),
			"1.3.6.1.2.1.17.7.1.1.5.0": scalarPacket("1.3.6.1.2.1.17.7.1.1.5.0", gosnmp.Integer, 2),
			fm + "5.25.183.1.1.0":      scalarPacket(fm+"5.25.183.1.1.0", gosnmp.Integer, 1),
			fm + "5.25.183.1.2.0":      scalarPacket(fm+"5.25.183.1.2.0", gosnmp.Integer, 2),
			fm + "5.25.183.1.5.0":      scalarPacket(fm+"5.25.183.1.5.0", gosnmp.Integer, 1),
			fm + "6.10.1.1.1.0":        scalarPacket(fm+"6.10.1.1.1.0", gosnmp.TimeTicks, 10080),
			fm + "6.10.1.1.2.0":        scalarPacket(fm+"6.10.1.1.2.0", gosnmp.TimeTicks, 10050),
			fm + "6.10.1.1.3.0":        scalarPacket(fm+"6.10.1.1.3.0", gosnmp.TimeTicks, 9000),
			fm + "5.25.42.4.1.7.0":     scalarPacket(fm+"5.25.42.4.1.7.0", gosnmp.Integer, 1),
		},
		bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
			"1.3.6.1.2.1.17.7.1.2.1.1.2": {
				walkPDU("1.3.6.1.2.1.17.7.1.2.1.1.2", 1, 120, gosnmp.Counter32),
				walkPDU("1.3.6.1.2.1.17.7.1.2.1.1.2", 10, 45, gosnmp.Counter32),
			},
			fm + "5.25.183.1.20.1.1": {walkPDU(fm+"5.25.183.1.20.1.1", 0, 0, gosnmp.Integer), walkPDU(fm+"5.25.183.1.20.1.1", 1, 1, gosnmp.Integer)},
			fm + "5.25.183.1.20.1.2": {walkPDU(fm+"5.25.183.1.20.1.2", 0, 200, gosnmp.Integer), walkPDU(fm+"5.25.183.1.20.1.2", 1, 100, gosnmp.Integer)},
			fm + "5.25.183.1.20.1.3": {walkPDU(fm+"5.25.183.1.20.1.3", 0, 1, gosnmp.Integer), walkPDU(fm+"5.25.183.1.20.1.3", 1, 2, gosnmp.Integer)},
			fm + "5.25.183.1.20.1.4": {walkPDU(fm+"5.25.183.1.20.1.4", 0, []byte{0x00, 0x11, 0x22, 0x33, 0x44, 0x01}, gosnmp.OctetString)},
			fm + "5.25.183.1.21.1.3": {walkPDU(fm+"5.25.183.1.21.1.3", 1, []byte("stack-port0/1"), gosnmp.OctetString)},
			fm + "5.25.183.1.21.1.5": {walkPDU(fm+"5.25.183.1.21.1.5", 1, 1, gosnmp.Integer)},
			fm + "6.9.1.1.4.1.1.4":   {walkPDU(fm+"6.9.1.1.4.1.1.4", 1, 1000, gosnmp.Integer)},
			fm + "6.9.1.1.4.1.1.5":   {walkPDU(fm+"6.9.1.1.4.1.1.5", 1, 250, gosnmp.Integer)},
			fm + "6.9.1.1.4.1.1.6":   {walkPDU(fm+"6.9.1.1.4.1.1.6", 1, []byte("flash:"), gosnmp.OctetString)},
		},
	}
	m := &devices.SNMPMetrics{}
	collectSTP(c, client, m, reg)
	collectSwitchExtendedMetrics(c, client, m, reg, "huawei", ".1.3.6.1.4.1.56813.2.23.811", "", nil)

	if m.STP.Priority == nil || *m.STP.Priority != 32768 || m.STP.DesignatedRoot != "32768/00:11:22:33:44:55" || *m.STP.BpduGuard != 1 {
		t.Fatalf("unexpected STP: %+v", m.STP)
	}
	if m.VLAN.NumVlans == nil || *m.VLAN.NumVlans != 16 || m.VLAN.FdbDynamicCount == nil || *m.VLAN.FdbDynamicCount != 165 {
		t.Fatalf("unexpected VLAN: %+v", m.VLAN)
	}
	if m.ConfigSave.IsSaved == nil || *m.ConfigSave.IsSaved {
		t.Fatalf("expected IsSaved=false when modTicks(10080) > saveTicks(10050), got %+v", m.ConfigSave)
	}
	if m.Stack.Enabled == nil || !*m.Stack.Enabled || m.Stack.TopoTypeLabel != "ring" || len(m.Stack.Members) != 2 || m.Stack.Members[0].RoleLabel != "master" || m.Stack.Ports[0].Name != "stack-port0/1" {
		t.Fatalf("unexpected Stack: %+v", m.Stack)
	}
	if len(m.FlashPartitions) != 1 || m.FlashPartitions[0].Name != "flash:" || *m.FlashPartitions[0].UsedBytes != 750 || *m.FlashPartitions[0].UsagePercent != 75 {
		t.Fatalf("unexpected FlashPartitions: %+v", m.FlashPartitions)
	}
}

func TestOpticalTemperature_PoESlotAndPortName_AndFaultLights(t *testing.T) {
	reg, err := snmpmib.DefaultRegistry()
	if err != nil {
		t.Fatalf("DefaultRegistry() error = %v", err)
	}
	t.Run("Optical temperature filtering and retention", func(t *testing.T) {
		tempOID := "1.3.6.1.4.1.2011.5.25.31.1.1.3.1.5"
		client := &fakeCollectorSNMPClient{
			bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
				tempOID: {
					walkPDU(tempOID, 1, 42, gosnmp.Integer),
					walkPDU(tempOID, 2, 255, gosnmp.Integer),
					walkPDU(tempOID, 3, 0, gosnmp.Integer),
					walkPDU(tempOID, 4, -60, gosnmp.Integer),
				},
			},
		}
		got := collectOpticalTransceiversFromCatalog(client, []snmpmib.CatalogOID{
			catalogEntry("hw_entity_optical_temperature", tempOID, "integer", "C"),
		})
		if len(got) != 2 {
			t.Fatalf("len(got) = %d, want 2 (255 and -60 rejected): %+v", len(got), got)
		}
		enriched := enrichOpticalTransceivers(got, "huawei", nil, nil)
		if len(enriched) != 1 || enriched[0].Index != "1" || *enriched[0].Temperature != 42 || enriched[0].TemperatureUnit != "C" {
			t.Fatalf("enriched = %+v, want only idx=1 with temp=42C", enriched)
		}
	})

	t.Run("PoE port name and slot available power fallback", func(t *testing.T) {
		entries := reg.CatalogEntriesForDevice("huawei", "poe", ".1.3.6.1.4.1.2011.2.23.1", "")
		client := &fakeCollectorSNMPClient{
			bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
				"1.3.6.1.4.1.2011.5.25.195.2.1.3":  {walkPDU("1.3.6.1.4.1.2011.5.25.195.2.1.3", 0, 120000, gosnmp.Integer), walkPDU("1.3.6.1.4.1.2011.5.25.195.2.1.3", 1, 80000, gosnmp.Integer)},
				"1.3.6.1.4.1.2011.5.25.195.3.1.2":  {walkPDU("1.3.6.1.4.1.2011.5.25.195.3.1.2", 1, []byte("GE0/0/1"), gosnmp.OctetString)},
				"1.3.6.1.4.1.2011.5.25.195.3.1.10": {walkPDU("1.3.6.1.4.1.2011.5.25.195.3.1.10", 1, 15000, gosnmp.Integer)},
			},
		}
		poe := collectPoEFromCatalog(client, entries)
		if poe.RemainingPower == nil || *poe.RemainingPower != 200 || poe.RemainingUnit != "W" {
			t.Fatalf("RemainingPower = %v (%s), want 200 W", poe.RemainingPower, poe.RemainingUnit)
		}
		if len(poe.Ports) != 1 || poe.Ports[0].Name != "GE0/0/1" || *poe.Ports[0].ConsumingPower != 15 {
			t.Fatalf("Ports = %+v", poe.Ports)
		}
	})

	t.Run("FaultLight enrichment", func(t *testing.T) {
		entries := reg.CatalogEntriesForDevice("huawei", "environment", ".1.3.6.1.4.1.2011.2.23.1", "")
		client := &fakeCollectorSNMPClient{
			bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
				"1.3.6.1.4.1.2011.5.25.31.1.1.1.1.21": {
					walkPDU("1.3.6.1.4.1.2011.5.25.31.1.1.1.1.21", 1, 3, gosnmp.Integer),
					walkPDU("1.3.6.1.4.1.2011.5.25.31.1.1.1.1.21", 2, 6, gosnmp.Integer),
				},
			},
		}
		items := enrichComponentsWithFaultLights(client, []devices.ComponentStatusMetrics{
			{Index: "1", Kind: "board", StatusLevel: "normal", StatusLabel: "正常"},
			{Index: "2", Kind: "board", StatusLevel: "normal", StatusLabel: "正常"},
		}, entries)
		if items[0].StatusLevel != "critical" || items[0].StatusLabel != "故障灯告警" {
			t.Fatalf("item[0] = %+v", items[0])
		}
		if items[1].StatusLevel != "warning" {
			t.Fatalf("item[1] = %+v", items[1])
		}
	})

	t.Run("H3C IRF stack, saved config, and PoE device-level remaining power precedence", func(t *testing.T) {
		client := &fakeCollectorSNMPClient{
			getPackets: map[string]*gosnmp.SnmpPacket{
				"1.3.6.1.4.1.25506.2.4.1.1.1.0": scalarPacket("1.3.6.1.4.1.25506.2.4.1.1.1.0", gosnmp.TimeTicks, 5000),
				"1.3.6.1.4.1.25506.2.4.1.1.2.0": scalarPacket("1.3.6.1.4.1.25506.2.4.1.1.2.0", gosnmp.TimeTicks, 5200),
			},
			bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
				"1.3.6.1.4.1.25506.2.91.2.1.2": {walkPDU("1.3.6.1.4.1.25506.2.91.2.1.2", 1, 1, gosnmp.Integer)},
				"1.3.6.1.4.1.25506.2.91.5.1.2": {walkPDU("1.3.6.1.4.1.25506.2.91.5.1.2", 1, 3, gosnmp.Integer), walkPDU("1.3.6.1.4.1.25506.2.91.5.1.2", 2, 5, gosnmp.Integer)},
			},
		}
		m := &devices.SNMPMetrics{}
		collectSwitchExtendedMetrics(devices.NewSNMPCollectorWithRegistry(zap.NewNop(), reg), client, m, reg, "h3c", ".1.3.6.1.4.1.25506.1.1", "", nil)
		if m.ConfigSave.IsSaved == nil || !*m.ConfigSave.IsSaved {
			t.Fatalf("expected IsSaved=true, got %+v", m.ConfigSave)
		}
		if len(m.Stack.Members) != 1 || m.Stack.Members[0].RoleLabel != "master" || m.Stack.Ports[0].StatusLabel != "up" || m.Stack.Ports[1].StatusLabel != "absent" {
			t.Fatalf("unexpected H3C IRF stack: %+v", m.Stack)
		}
		// RemainingPower present should NOT be overwritten by slot_available_power
		poeEntries := reg.CatalogEntriesForDevice("huawei", "poe", ".1.3.6.1.4.1.2011.2.23.1", "")
		poeClient := &fakeCollectorSNMPClient{
			bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
				"1.3.6.1.4.1.2011.5.25.195.5.1.7": {walkPDU("1.3.6.1.4.1.2011.5.25.195.5.1.7", 0, 370000, gosnmp.Integer)},
				"1.3.6.1.4.1.2011.5.25.195.2.1.3": {walkPDU("1.3.6.1.4.1.2011.5.25.195.2.1.3", 0, 120000, gosnmp.Integer)},
			},
		}
		poe := collectPoEFromCatalog(poeClient, poeEntries)
		if poe.RemainingPower == nil || *poe.RemainingPower != 370 {
			t.Fatalf("RemainingPower = %v, want 370 (device level precedence)", poe.RemainingPower)
		}

		// TimeTicks 32 位回绕：saved=4294967000, mod=1000 => IsSaved=false
		wrapClient := &fakeCollectorSNMPClient{
			getPackets: map[string]*gosnmp.SnmpPacket{
				"1.3.6.1.4.1.25506.2.4.1.1.1.0": scalarPacket("1.3.6.1.4.1.25506.2.4.1.1.1.0", gosnmp.TimeTicks, 1000),
				"1.3.6.1.4.1.25506.2.4.1.1.2.0": scalarPacket("1.3.6.1.4.1.25506.2.4.1.1.2.0", gosnmp.TimeTicks, 4294967000),
			},
		}
		wrapMetrics := &devices.SNMPMetrics{}
		collectSwitchExtendedMetrics(devices.NewSNMPCollectorWithRegistry(zap.NewNop(), reg), wrapClient, wrapMetrics, reg, "h3c", ".1.3.6.1.4.1.25506.1.1", "", nil)
		if wrapMetrics.ConfigSave.IsSaved == nil || *wrapMetrics.ConfigSave.IsSaved {
			t.Fatalf("expected IsSaved=false across 32-bit TimeTicks rollover, got %+v", wrapMetrics.ConfigSave)
		}
	})
}
