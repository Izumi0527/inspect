package devices_test

import (
	"math"
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

type entityCatalogOpaque struct{}

//go:linkname newEntityCatalog github.com/your-org/inspect-system/backend-go/internal/devices.newEntityCatalog
func newEntityCatalog(target collectorSNMPClient, registry *snmpmib.Registry) *entityCatalogOpaque

//go:linkname enrichOpticalTransceivers github.com/your-org/inspect-system/backend-go/internal/devices.enrichOpticalTransceivers
func enrichOpticalTransceivers(items []devices.OpticalTransceiverMetrics, vendor string, catalog *entityCatalogOpaque, ifaceNameByIndex map[int]string) []devices.OpticalTransceiverMetrics

//go:linkname enrichComponents github.com/your-org/inspect-system/backend-go/internal/devices.enrichComponents
func enrichComponents(items []devices.ComponentStatusMetrics, vendor string, catalog *entityCatalogOpaque) []devices.ComponentStatusMetrics

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
			"1.3.6.1.4.1.2011.5.25.31.1.1.18.1.6": {
				walkPDU("1.3.6.1.4.1.2011.5.25.31.1.1.18.1.6", 1, 1, gosnmp.Integer),
			},
		},
	}
	entries := []snmpmib.CatalogOID{
		catalogEntry("hw_entity_fan_state", "1.3.6.1.4.1.2011.5.25.31.1.1.10.1.7", "integer", ""),
		catalogEntry("hw_entity_power_state", "1.3.6.1.4.1.2011.5.25.31.1.1.18.1.6", "integer", ""),
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
			"1.3.6.1.4.1.2011.5.25.195.3.1.10": {
				walkPDU("1.3.6.1.4.1.2011.5.25.195.3.1.10", 1, 15400, gosnmp.Integer),
				walkPDU("1.3.6.1.4.1.2011.5.25.195.3.1.10", 2, 6900, gosnmp.Integer),
			},
			"1.3.6.1.4.1.25506.2.14.2.1.4": {
				walkPDU("1.3.6.1.4.1.25506.2.14.2.1.4", 0, 220, gosnmp.Gauge32),
			},
		},
	}
	entries := []snmpmib.CatalogOID{
		catalogEntry("hw_poe_port_consuming_power", "1.3.6.1.4.1.2011.5.25.195.3.1.10", "integer", "mW"),
		catalogEntry("hh3c_main_guaranteed_power_remaining", "1.3.6.1.4.1.25506.2.14.2.1.4", "gauge32", "W"),
	}

	got := collectPoEFromCatalog(client, entries)

	if len(got.Ports) != 2 {
		t.Errorf("PoE 端口数 = %d，want 2，实际 = %+v", len(got.Ports), got.Ports)
	}
	if got.Ports[0].ConsumingPower == nil || *got.Ports[0].ConsumingPower != 15.4 {
		t.Errorf("端口1消耗功率 = %v，want 15.4 (15400 mW 归一化为 15.4 W)", got.Ports[0].ConsumingPower)
	}
	if got.Ports[0].Unit != "W" {
		t.Errorf("端口1功率单位 = %q，want \"W\"", got.Ports[0].Unit)
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

func TestEnrichOpticalTransceivers_FiltersPlaceholdersAndResolvesNames(t *testing.T) {
	reg, err := snmpmib.DefaultRegistry()
	if err != nil {
		t.Fatalf("DefaultRegistry() error = %v", err)
	}
	nameOID := reg.Common.System.EntPhysicalName.OID
	descrOID := reg.Common.System.EntPhysicalDescr.OID

	client := &fakeCollectorSNMPClient{
		bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
			nameOID: {
				walkPDU(nameOID, 939982849, []byte("GigabitEthernet0/0/25"), gosnmp.OctetString),
				walkPDU(nameOID, 939982850, []byte("GigabitEthernet0/0/26"), gosnmp.OctetString),
			},
			descrOID: {
				walkPDU(descrOID, 939982851, []byte("XGigabitEthernet0/0/1"), gosnmp.OctetString),
			},
		},
	}
	catalog := newEntityCatalog(client, reg)

	f := func(v float64) *float64 { return &v }
	items := []devices.OpticalTransceiverMetrics{
		// 全 0 占位行 -> 必须过滤掉
		{Index: "939982850", Voltage: f(0), VoltageUnit: "mV", BiasCurrent: f(0), BiasCurrentUnit: "uA", TxPower: f(0), TxPowerUnit: "uW", RxPower: f(0), RxPowerUnit: "uW"},
		// 在位但无收光（电压 > 0，rx=0 uW）-> 保留且按 entPhysicalName 赋名，并保留 VendorSN
		{Index: "939982849", VendorSN: "SFP2102312XYZ", Voltage: f(3300), VoltageUnit: "mV", RxPower: f(0), RxPowerUnit: "uW"},
		// dBm 读数为 0 -> 有效强光，保留且回退 entPhysicalDescr
		{Index: "939982851", RxPower: f(0), RxPowerUnit: "dBm"},
		// H3C ifIndex 兼容回退 ifaceNameByIndex
		{Index: "12", TxPower: f(-2.1), TxPowerUnit: "dBm"},
	}

	got := enrichOpticalTransceivers(items, "huawei", catalog, map[int]string{12: "Ten-GigabitEthernet1/0/12"})
	if len(got) != 3 {
		t.Fatalf("len(got) = %d, want 3 (all-zero placeholder must be filtered): %+v", len(got), got)
	}

	byIdx := make(map[string]devices.OpticalTransceiverMetrics, len(got))
	for _, item := range got {
		byIdx[item.Index] = item
	}
	if _, exists := byIdx["939982850"]; exists {
		t.Fatalf("all-zero placeholder 939982850 should be filtered out")
	}
	if byIdx["939982849"].Name != "GigabitEthernet0/0/25" || byIdx["939982849"].VendorSN != "SFP2102312XYZ" {
		t.Fatalf("939982849 Name/VendorSN = %q/%q, want GigabitEthernet0/0/25 / SFP2102312XYZ", byIdx["939982849"].Name, byIdx["939982849"].VendorSN)
	}
	if byIdx["939982851"].Name != "XGigabitEthernet0/0/1" {
		t.Fatalf("939982851 Name = %q, want XGigabitEthernet0/0/1", byIdx["939982851"].Name)
	}
	if byIdx["12"].Name != "Ten-GigabitEthernet1/0/12" {
		t.Fatalf("12 Name = %q, want Ten-GigabitEthernet1/0/12", byIdx["12"].Name)
	}

	t.Run("H3C 优先 ifaceNameByIndex 防 ENTITY-MIB 撞号，非 H3C 拒绝非端口实体类且拦截 NaN/Inf", func(t *testing.T) {
		classOID := reg.Common.System.EntPhysicalClass.OID
		collisionClient := &fakeCollectorSNMPClient{
			bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
				classOID: {
					walkPDU(classOID, 12, 7, gosnmp.Integer), // fan
					walkPDU(classOID, 20, 3, gosnmp.Integer), // chassis
					walkPDU(classOID, 21, 10, gosnmp.Integer),
				},
				nameOID: {
					walkPDU(nameOID, 12, []byte("FAN1"), gosnmp.OctetString),
					walkPDU(nameOID, 20, []byte("Chassis-0"), gosnmp.OctetString),
					walkPDU(nameOID, 21, []byte("GigabitEthernet0/0/21"), gosnmp.OctetString),
				},
			},
		}

		// H3C: idx=12 在 ENTITY-MIB 是 fan("FAN1")，但必须优先取 ifaceNameByIndex[12]
		h3cGot := enrichOpticalTransceivers(
			[]devices.OpticalTransceiverMetrics{{Index: "12", TxPower: f(-2.1), TxPowerUnit: "dBm"}},
			"h3c",
			newEntityCatalog(collisionClient, reg),
			map[int]string{12: "Ten-GigabitEthernet1/0/12"},
		)
		if len(h3cGot) != 1 || h3cGot[0].Name != "Ten-GigabitEthernet1/0/12" {
			t.Fatalf("h3cGot = %+v, want Ten-GigabitEthernet1/0/12", h3cGot)
		}

		// 华为/非 H3C: idx=12(fan)/idx=20(chassis) 拒绝非端口实体名；idx=21(port) 正常赋名；NaN/+Inf 被过滤
		nanVal := math.NaN()
		infVal := math.Inf(1)
		hwGot := enrichOpticalTransceivers(
			[]devices.OpticalTransceiverMetrics{
				{Index: "12", RxPower: f(-3.0), RxPowerUnit: "dBm"},
				{Index: "20", RxPower: f(-4.0), RxPowerUnit: "dBm"},
				{Index: "21", RxPower: f(-5.0), RxPowerUnit: "dBm"},
				{Index: "22", RxPower: &nanVal, RxPowerUnit: "dBm"},
				{Index: "23", TxPower: &infVal, TxPowerUnit: "dBm"},
			},
			"huawei",
			newEntityCatalog(collisionClient, reg),
			nil,
		)
		if len(hwGot) != 3 {
			t.Fatalf("len(hwGot) = %d, want 3 (NaN/+Inf must be filtered): %+v", len(hwGot), hwGot)
		}
		hwByIdx := make(map[string]devices.OpticalTransceiverMetrics, len(hwGot))
		for _, item := range hwGot {
			hwByIdx[item.Index] = item
		}
		if hwByIdx["12"].Name != "" {
			t.Fatalf("idx 12 (fan) Name = %q, want empty", hwByIdx["12"].Name)
		}
		if hwByIdx["20"].Name != "" {
			t.Fatalf("idx 20 (chassis) Name = %q, want empty", hwByIdx["20"].Name)
		}
		if hwByIdx["21"].Name != "GigabitEthernet0/0/21" {
			t.Fatalf("idx 21 (port) Name = %q, want GigabitEthernet0/0/21", hwByIdx["21"].Name)
		}
	})
}

func TestEnrichComponents_FiltersBoardNoiseAndMapsVendorSemantics(t *testing.T) {
	reg, err := snmpmib.DefaultRegistry()
	if err != nil {
		t.Fatalf("DefaultRegistry() error = %v", err)
	}
	classOID := reg.Common.System.EntPhysicalClass.OID
	nameOID := reg.Common.System.EntPhysicalName.OID

	i64 := func(v int64) *int64 { return &v }

	t.Run("华为 board 按 entPhysicalClass 过滤噪声并映射华为各部件语义", func(t *testing.T) {
		client := &fakeCollectorSNMPClient{
			bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
				classOID: {
					walkPDU(classOID, 201326593, 9, gosnmp.Integer), // module -> keep
					walkPDU(classOID, 201326594, 3, gosnmp.Integer), // chassis -> keep
					walkPDU(classOID, 201326595, 4, gosnmp.Integer), // backplane -> keep
					walkPDU(classOID, 201326596, 11, gosnmp.Integer),
					walkPDU(classOID, 1001, 10, gosnmp.Integer), // port -> drop
					walkPDU(classOID, 1002, 5, gosnmp.Integer),  // container -> drop
					walkPDU(classOID, 1003, 7, gosnmp.Integer),  // fan -> drop
					walkPDU(classOID, 1004, 6, gosnmp.Integer),  // powerSupply -> drop
					walkPDU(classOID, 1005, 8, gosnmp.Integer),  // sensor -> drop
					walkPDU(classOID, 1006, 12, gosnmp.Integer), // cpu -> drop
					walkPDU(classOID, 1007, 1, gosnmp.Integer),  // other -> drop
					walkPDU(classOID, 1008, 2, gosnmp.Integer),  // unknown -> drop
				},
				nameOID: {
					walkPDU(nameOID, 201326593, []byte("MPU Board 0"), gosnmp.OctetString),
				},
			},
		}
		catalog := newEntityCatalog(client, reg)

		items := []devices.ComponentStatusMetrics{
			{Index: "201326593", Kind: "board", State: i64(3)},
			{Index: "201326594", Kind: "board", State: i64(4)},
			{Index: "201326595", Kind: "board", State: i64(1)},
			{Index: "201326596", Kind: "board", State: i64(11)},
			{Index: "1001", Kind: "board", State: i64(3)},
			{Index: "1002", Kind: "board", State: i64(3)},
			{Index: "1003", Kind: "board", State: i64(3)},
			{Index: "1004", Kind: "board", State: i64(3)},
			{Index: "1005", Kind: "board", State: i64(3)},
			{Index: "1006", Kind: "board", State: i64(3)},
			{Index: "1007", Kind: "board", State: i64(3)},
			{Index: "1008", Kind: "board", State: i64(3)},
			{Index: "0.3", Kind: "fan", State: i64(2)},
			{Index: "0.1", Kind: "fan", State: i64(1)},
			{Index: "1", Kind: "power", State: i64(1)},
			{Index: "2", Kind: "power", State: i64(2)},
			{Index: "3", Kind: "power", State: i64(3)},
			{Index: "4", Kind: "power", State: i64(4)},
		}

		got := enrichComponents(items, "huawei", catalog)
		if len(got) != 10 {
			t.Fatalf("len(got) = %d, want 10 (8 non-hardware boards must be filtered): %+v", len(got), got)
		}

		byKindIdx := make(map[string]devices.ComponentStatusMetrics, len(got))
		for _, c := range got {
			byKindIdx[c.Kind+":"+c.Index] = c
		}

		if c := byKindIdx["board:201326593"]; c.Name != "MPU Board 0" || c.StatusLabel != "正常" || c.StatusLevel != "normal" || *c.State != 3 {
			t.Fatalf("board 201326593 = %+v", c)
		}
		if c := byKindIdx["board:201326594"]; c.Name != "" || c.StatusLabel != "异常/离线" || c.StatusLevel != "critical" {
			t.Fatalf("board 201326594 = %+v, want empty Name for unnamed long index", c)
		}
		if c := byKindIdx["board:201326595"]; c.StatusLabel != "未安装/不支持" || c.StatusLevel != "unknown" {
			t.Fatalf("board 201326595 = %+v", c)
		}
		if c := byKindIdx["fan:0.3"]; c.Name != "槽位 0 · 风扇 3" || c.StatusLabel != "异常" || c.StatusLevel != "critical" {
			t.Fatalf("fan 0.3 = %+v", c)
		}
		if c := byKindIdx["power:1"]; c.Name != "电源 1" || c.StatusLabel != "正常供电" || c.StatusLevel != "normal" {
			t.Fatalf("power 1 = %+v", c)
		}
		if c := byKindIdx["power:2"]; c.StatusLabel != "未供电/异常" || c.StatusLevel != "critical" {
			t.Fatalf("power 2 = %+v", c)
		}
		if c := byKindIdx["power:3"]; c.StatusLabel != "休眠/备用" || c.StatusLevel != "warning" {
			t.Fatalf("power 3 = %+v", c)
		}
		if c := byKindIdx["power:4"]; c.StatusLabel != "未知" || c.StatusLevel != "unknown" {
			t.Fatalf("power 4 = %+v", c)
		}
	})

	t.Run("H3C 风扇与电源状态映射", func(t *testing.T) {
		items := []devices.ComponentStatusMetrics{
			{Index: "1", Kind: "fan", State: i64(1)},
			{Index: "2", Kind: "fan", State: i64(2)},
			{Index: "3", Kind: "power", State: i64(3)},
			{Index: "4", Kind: "power", State: i64(4)},
		}
		got := enrichComponents(items, "h3c", nil)
		if len(got) != 4 {
			t.Fatalf("len(got) = %d, want 4", len(got))
		}
		if got[0].StatusLabel != "正常" || got[0].StatusLevel != "normal" {
			t.Fatalf("h3c state=1 got %+v", got[0])
		}
		if got[1].StatusLabel != "故障" || got[1].StatusLevel != "critical" {
			t.Fatalf("h3c state=2 got %+v", got[1])
		}
		if got[2].StatusLabel != "未安装" || got[2].StatusLevel != "unknown" {
			t.Fatalf("h3c state=3 got %+v", got[2])
		}
		if got[3].StatusLabel != "不支持" || got[3].StatusLevel != "unknown" {
			t.Fatalf("h3c state=4 got %+v", got[3])
		}
	})

	t.Run("S5736 内置电源与风扇在专表为空时从 board 智能归位，专表非空时不重复", func(t *testing.T) {
		nameOID := reg.Common.System.EntPhysicalName.OID
		classOID := reg.Common.System.EntPhysicalClass.OID
		client := &fakeCollectorSNMPClient{
			bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
				classOID: {
					walkPDU(classOID, 67108867, 3, gosnmp.Integer), // chassis
					walkPDU(classOID, 67108873, 9, gosnmp.Integer), // module
					walkPDU(classOID, 67190797, 9, gosnmp.Integer), // POWER Card 0/PWR1
					walkPDU(classOID, 67207181, 9, gosnmp.Integer), // POWER Card 0/PWR2
					walkPDU(classOID, 67223565, 9, gosnmp.Integer), // FAN Card 0/FAN1
					walkPDU(classOID, 67239949, 9, gosnmp.Integer), // FAN Card 0/FAN2
				},
				nameOID: {
					walkPDU(nameOID, 67108867, []byte("FutureMatrix S5736 Routing Switch"), gosnmp.OctetString),
					walkPDU(nameOID, 67108873, []byte("MPU Board 0"), gosnmp.OctetString),
					walkPDU(nameOID, 67190797, []byte("POWER Card 0/PWR1"), gosnmp.OctetString),
					walkPDU(nameOID, 67207181, []byte("POWER Card 0/PWR2"), gosnmp.OctetString),
					walkPDU(nameOID, 67223565, []byte("FAN Card 0/FAN1"), gosnmp.OctetString),
					walkPDU(nameOID, 67239949, []byte("FAN Card 0/FAN2"), gosnmp.OctetString),
				},
			},
		}
		catalog := newEntityCatalog(client, reg)

		s5736Boards := []devices.ComponentStatusMetrics{
			{Index: "67108867", Kind: "board", State: i64(3)},
			{Index: "67108873", Kind: "board", State: i64(3)},
			{Index: "67190797", Kind: "board", State: i64(3)},
			{Index: "67207181", Kind: "board", State: i64(2)},
			{Index: "67223565", Kind: "board", State: i64(3)},
			{Index: "67239949", Kind: "board", State: i64(1)},
		}

		// 1. 专表为空：自动产出 2 fan + 2 power + 2 board
		gotEmptyDedicated := enrichComponents(s5736Boards, "huawei", catalog)
		if len(gotEmptyDedicated) != 6 {
			t.Fatalf("len(gotEmptyDedicated) = %d, want 6: %+v", len(gotEmptyDedicated), gotEmptyDedicated)
		}
		byKindIdx := make(map[string]devices.ComponentStatusMetrics, len(gotEmptyDedicated))
		counts := map[string]int{}
		for _, c := range gotEmptyDedicated {
			counts[c.Kind]++
			byKindIdx[c.Kind+":"+c.Index] = c
		}
		if counts["fan"] != 2 || counts["power"] != 2 || counts["board"] != 2 {
			t.Fatalf("counts = %+v, want fan=2 power=2 board=2", counts)
		}
		if c := byKindIdx["power:67190797"]; c.Name != "POWER Card 0/PWR1" || c.StatusLabel != "正常供电" || c.StatusLevel != "normal" {
			t.Fatalf("power 67190797 = %+v", c)
		}
		if c := byKindIdx["power:67207181"]; c.Name != "POWER Card 0/PWR2" || c.StatusLabel != "未供电/异常" || c.StatusLevel != "critical" {
			t.Fatalf("power 67207181 = %+v", c)
		}
		if c := byKindIdx["fan:67223565"]; c.Name != "FAN Card 0/FAN1" || c.StatusLabel != "正常" || c.StatusLevel != "normal" {
			t.Fatalf("fan 67223565 = %+v", c)
		}
		if c := byKindIdx["fan:67239949"]; c.Name != "FAN Card 0/FAN2" || c.StatusLabel != "未安装/不支持" || c.StatusLevel != "unknown" {
			t.Fatalf("fan 67239949 = %+v", c)
		}
		if _, ok := byKindIdx["board:67108867"]; !ok {
			t.Fatalf("missing board:67108867")
		}
		if _, ok := byKindIdx["board:67108873"]; !ok {
			t.Fatalf("missing board:67108873")
		}

		// 2. 专表非空：跳过 board 中的 POWER Card / FAN Card，防止重复
		withDedicated := append([]devices.ComponentStatusMetrics(nil), s5736Boards...)
		withDedicated = append(withDedicated,
			devices.ComponentStatusMetrics{Index: "1", Kind: "power", State: i64(1)},
			devices.ComponentStatusMetrics{Index: "0.1", Kind: "fan", State: i64(1)},
		)
		gotWithDedicated := enrichComponents(withDedicated, "huawei", catalog)
		if len(gotWithDedicated) != 4 {
			t.Fatalf("len(gotWithDedicated) = %d, want 4: %+v", len(gotWithDedicated), gotWithDedicated)
		}
		for _, c := range gotWithDedicated {
			if c.Kind == "board" && (c.Name == "POWER Card 0/PWR1" || c.Name == "FAN Card 0/FAN1") {
				t.Fatalf("unexpected duplicated board subcomponent: %+v", c)
			}
		}
	})
}
