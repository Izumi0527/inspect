package devices_test

import (
	"testing"
	_ "unsafe"

	"github.com/gosnmp/gosnmp"

	devices "github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/snmpmib"
)

// collectComponentsFromCatalog 采集风扇、电源、单板等部件的原始状态码。
//
//go:linkname collectComponentsFromCatalog github.com/your-org/inspect-system/backend-go/internal/devices.collectComponentsFromCatalog
func collectComponentsFromCatalog(client collectorSNMPClient, entries []snmpmib.CatalogOID) []devices.ComponentStatusMetrics

// collectPoEFromCatalog 采集 PoE 端口功率与 PSE 剩余保障功率。
//
//go:linkname collectPoEFromCatalog github.com/your-org/inspect-system/backend-go/internal/devices.collectPoEFromCatalog
func collectPoEFromCatalog(client collectorSNMPClient, entries []snmpmib.CatalogOID) devices.PoEMetrics

func catalogEntry(id, oid, valueType, unit string) snmpmib.CatalogOID {
	return snmpmib.CatalogOID{ID: id, Name: id, OID: oid, Method: "bulkwalk", ValueType: valueType, Unit: unit}
}

// TestCollectComponents_SeparatesFanAndPower 风扇与电源必须分别归类。
//
// 两者的运维含义不同：风扇故障导致散热余量不足（渐进劣化），电源故障导致
// 冗余失效（一次市电抖动即宕机）。混在一起统计会让报告说不清该先处理哪个。
func TestCollectComponents_SeparatesFanAndPower(t *testing.T) {
	client := &fakeCollectorSNMPClient{
		bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
			"1.3.6.1.4.1.2011.5.25.31.1.1.10.1.7": {
				walkPDU("1.3.6.1.4.1.2011.5.25.31.1.1.10.1.7", 1, 1, gosnmp.Integer),
				walkPDU("1.3.6.1.4.1.2011.5.25.31.1.1.10.1.7", 2, 2, gosnmp.Integer),
			},
			"1.3.6.1.4.1.2011.5.25.31.1.1.11.1.3": {
				walkPDU("1.3.6.1.4.1.2011.5.25.31.1.1.11.1.3", 1, 1, gosnmp.Integer),
			},
		},
	}
	entries := []snmpmib.CatalogOID{
		catalogEntry("hw_entity_fan_state", "1.3.6.1.4.1.2011.5.25.31.1.1.10.1.7", "integer", ""),
		catalogEntry("hw_entity_power_state", "1.3.6.1.4.1.2011.5.25.31.1.1.11.1.3", "integer", ""),
	}

	got := collectComponentsFromCatalog(client, entries)

	fans, powers := 0, 0
	for _, c := range got {
		switch c.Kind {
		case "fan":
			fans++
		case "power":
			powers++
		}
	}
	if fans != 2 {
		t.Errorf("风扇部件数 = %d，want 2，实际 = %+v", fans, got)
	}
	if powers != 1 {
		t.Errorf("电源部件数 = %d，want 1，实际 = %+v", powers, got)
	}
}

// TestCollectComponents_KeepsRawStateCode 采集端必须保留厂商原始状态码，
// 不做正常/异常判定。
//
// 状态码语义因厂商甚至型号而异（华为 hwEntityFanState 与 H3C hh3cFanState
// 的取值含义并不一致），在采集端硬编码判定等于把一个未经实测确认的假设
// 埋进最底层。判定留给检查项层，那里可以按模板配置覆盖映射表。
func TestCollectComponents_KeepsRawStateCode(t *testing.T) {
	client := &fakeCollectorSNMPClient{
		bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
			"1.3.6.1.4.1.25506.8.35.9.1.2.1.2": {
				walkPDU("1.3.6.1.4.1.25506.8.35.9.1.2.1.2", 3, 7, gosnmp.Integer),
			},
		},
	}
	entries := []snmpmib.CatalogOID{
		catalogEntry("hh3c_fan_state", "1.3.6.1.4.1.25506.8.35.9.1.2.1.2", "integer", ""),
	}

	got := collectComponentsFromCatalog(client, entries)

	if len(got) != 1 {
		t.Fatalf("部件数 = %d，want 1", len(got))
	}
	if got[0].State == nil {
		t.Fatal("未保留原始状态码")
	}
	if *got[0].State != 7 {
		t.Errorf("原始状态码 = %d，want 7（即便是未知取值也须原样保留）", *got[0].State)
	}
	if got[0].Index != "3" {
		t.Errorf("部件索引 = %q，want \"3\"", got[0].Index)
	}
}

// TestCollectComponents_EmptyEntriesReturnsNil 厂商无对应 catalog 条目时返回空，
// 由检查项判 skip——非华为/H3C 设备采不到属预期，不是故障。
func TestCollectComponents_EmptyEntriesReturnsNil(t *testing.T) {
	if got := collectComponentsFromCatalog(&fakeCollectorSNMPClient{}, nil); got != nil {
		t.Errorf("无 catalog 条目时应返回 nil，实际 %+v", got)
	}
}

// TestCollectPoE_PortPowerAndRemaining PoE 两类数据都要采到：
// 端口级消耗功率（华为）与 PSE 剩余保障功率（H3C）。
//
// 两者不可互相替代：只有剩余功率能回答「还能再接几个 AP」，而端口功率
// 回答的是「哪个口在吃电」。
func TestCollectPoE_PortPowerAndRemaining(t *testing.T) {
	client := &fakeCollectorSNMPClient{
		bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
			"1.3.6.1.4.1.2011.6.3.18.1.4.1.6": {
				walkPDU("1.3.6.1.4.1.2011.6.3.18.1.4.1.6", 1, 15400, gosnmp.Integer),
				walkPDU("1.3.6.1.4.1.2011.6.3.18.1.4.1.6", 2, 6900, gosnmp.Integer),
			},
			"1.3.6.1.4.1.25506.2.14.2.1.4": {
				walkPDU("1.3.6.1.4.1.25506.2.14.2.1.4", 0, 220, gosnmp.Gauge32),
			},
		},
	}
	entries := []snmpmib.CatalogOID{
		catalogEntry("hw_poe_port_consuming_power", "1.3.6.1.4.1.2011.6.3.18.1.4.1.6", "integer", ""),
		catalogEntry("hh3c_main_guaranteed_power_remaining", "1.3.6.1.4.1.25506.2.14.2.1.4", "gauge32", "W"),
	}

	got := collectPoEFromCatalog(client, entries)

	if len(got.Ports) != 2 {
		t.Errorf("PoE 端口数 = %d，want 2，实际 = %+v", len(got.Ports), got.Ports)
	}
	if got.RemainingPower == nil {
		t.Fatal("未采集到 PSE 剩余保障功率")
	}
	if *got.RemainingPower != 220 {
		t.Errorf("剩余保障功率 = %v，want 220", *got.RemainingPower)
	}
}

// TestCollectPoE_NoEntriesReturnsZeroValue 非 PoE 设备返回零值，检查项据此判不适用。
func TestCollectPoE_NoEntriesReturnsZeroValue(t *testing.T) {
	got := collectPoEFromCatalog(&fakeCollectorSNMPClient{}, nil)
	if len(got.Ports) != 0 || got.RemainingPower != nil {
		t.Errorf("无 catalog 条目时应返回零值，实际 %+v", got)
	}
}
