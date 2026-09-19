package devices_test

import (
	"errors"
	"testing"
	_ "unsafe"

	"github.com/gosnmp/gosnmp"

	devices "github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/snmpmib"
)

// collectLLDP 探测 LLDP-MIB 可读性并采集邻居表。
//
//go:linkname collectLLDP github.com/your-org/inspect-system/backend-go/internal/devices.collectLLDP
func collectLLDP(client collectorSNMPClient, lldp snmpmib.LLDPSection, vendorEnableOID string) devices.LLDPCollection

// collectNeighbors 把 LLDP 采集结果与设备自身身份（sysName / 机箱 ID）写入 metrics。
//
//go:linkname collectNeighbors github.com/your-org/inspect-system/backend-go/internal/devices.(*SNMPCollector).collectNeighbors
func collectNeighbors(c *devices.SNMPCollector, target collectorSNMPClient, metrics *devices.SNMPMetrics, registry *snmpmib.Registry, vendor string)

// failingWalkSNMPClient 让指定 OID 的 walk 报错，其余委托给 fake。
type failingWalkSNMPClient struct {
	*fakeCollectorSNMPClient
	failOID string
}

func (f *failingWalkSNMPClient) BulkWalkAll(oid string) ([]gosnmp.SnmpPDU, error) {
	if oid == f.failOID {
		return nil, errors.New("noSuchObject")
	}
	return f.fakeCollectorSNMPClient.BulkWalkAll(oid)
}

const (
	testHwLLDPEnableOID  = "1.3.6.1.4.1.2011.5.25.134.1.1.1.0"
	testLocChassisGetKey = "1.0.8802.1.1.2.1.3.1.0,1.0.8802.1.1.2.1.3.2.0"
)

func lldpTestSection() snmpmib.LLDPSection {
	def := func(oid string) snmpmib.OIDDefinition {
		return snmpmib.OIDDefinition{OID: oid, Method: "bulkwalk"}
	}
	return snmpmib.LLDPSection{
		LocChassisIDSubtype: def("1.0.8802.1.1.2.1.3.1.0"),
		LocChassisID:        def("1.0.8802.1.1.2.1.3.2.0"),
		LocPortID:           def("1.0.8802.1.1.2.1.3.7.1.3"),
		LocPortDesc:         def("1.0.8802.1.1.2.1.3.7.1.4"),
		RemChassisIDSubtype: def("1.0.8802.1.1.2.1.4.1.1.4"),
		RemChassisID:        def("1.0.8802.1.1.2.1.4.1.1.5"),
		RemPortIDSubtype:    def("1.0.8802.1.1.2.1.4.1.1.6"),
		RemPortID:           def("1.0.8802.1.1.2.1.4.1.1.7"),
		RemPortDesc:         def("1.0.8802.1.1.2.1.4.1.1.8"),
		RemSysName:          def("1.0.8802.1.1.2.1.4.1.1.9"),
		RemSysDesc:          def("1.0.8802.1.1.2.1.4.1.1.10"),
		RemSysCapEnabled:    def("1.0.8802.1.1.2.1.4.1.1.12"),
		RemManAddrIfSubtype: def("1.0.8802.1.1.2.1.4.2.1.3"),
	}
}

func lldpPDU(base, index string, value interface{}, pduType gosnmp.Asn1BER) gosnmp.SnmpPDU {
	return gosnmp.SnmpPDU{Name: base + "." + index, Type: pduType, Value: value}
}

// localChassisPacket 模拟 lldpLocChassisIdSubtype.0 + lldpLocChassisId.0 一包 GET 的应答。
func localChassisPacket(subtype int, chassis []byte) *gosnmp.SnmpPacket {
	return &gosnmp.SnmpPacket{Variables: []gosnmp.SnmpPDU{
		{Name: ".1.0.8802.1.1.2.1.3.1.0", Type: gosnmp.Integer, Value: subtype},
		{Name: ".1.0.8802.1.1.2.1.3.2.0", Type: gosnmp.OctetString, Value: chassis},
	}}
}

// noSuchInstancePacket 模拟 OID 不在 SNMP 视图内时代理的应答（实验室 S5700 实测形态）。
func noSuchInstancePacket(oids ...string) *gosnmp.SnmpPacket {
	packet := &gosnmp.SnmpPacket{}
	for _, oid := range oids {
		packet.Variables = append(packet.Variables, gosnmp.SnmpPDU{Name: "." + oid, Type: gosnmp.NoSuchInstance})
	}
	return packet
}

func intPacket(oid string, value int) *gosnmp.SnmpPacket {
	return &gosnmp.SnmpPacket{Variables: []gosnmp.SnmpPDU{{Name: "." + oid, Type: gosnmp.Integer, Value: value}}}
}

// TestCollectLLDP_MergesColumnsAndParsesMgmtAddr 邻居表各列按
// TimeMark.LocalPort.RemIndex 三段索引合并；MAC 型机箱 ID 转十六进制；
// 管理地址从 lldpRemManAddrTable 的索引尾部解析出来；本机机箱 ID 一并返回。
func TestCollectLLDP_MergesColumnsAndParsesMgmtAddr(t *testing.T) {
	sec := lldpTestSection()
	client := &fakeCollectorSNMPClient{
		getPackets: map[string]*gosnmp.SnmpPacket{
			testLocChassisGetKey: localChassisPacket(4, []byte{0x4c, 0x1f, 0xcc, 0x1a, 0x07, 0x48}),
		},
		bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
			sec.RemSysName.OID: {
				lldpPDU(sec.RemSysName.OID, "0.7.2", []byte("fw-1"), gosnmp.OctetString),
				lldpPDU(sec.RemSysName.OID, "0.5.1", []byte("core-sw"), gosnmp.OctetString),
			},
			sec.RemChassisIDSubtype.OID: {
				lldpPDU(sec.RemChassisIDSubtype.OID, "0.5.1", 4, gosnmp.Integer),
				lldpPDU(sec.RemChassisIDSubtype.OID, "0.7.2", 4, gosnmp.Integer),
			},
			sec.RemChassisID.OID: {
				lldpPDU(sec.RemChassisID.OID, "0.5.1", []byte{0x00, 0x11, 0x22, 0x33, 0x44, 0x55}, gosnmp.OctetString),
				lldpPDU(sec.RemChassisID.OID, "0.7.2", []byte{0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff}, gosnmp.OctetString),
			},
			sec.RemPortIDSubtype.OID: {
				lldpPDU(sec.RemPortIDSubtype.OID, "0.5.1", 5, gosnmp.Integer),
				lldpPDU(sec.RemPortIDSubtype.OID, "0.7.2", 3, gosnmp.Integer),
			},
			sec.RemPortID.OID: {
				lldpPDU(sec.RemPortID.OID, "0.5.1", []byte("GigabitEthernet0/0/1"), gosnmp.OctetString),
				lldpPDU(sec.RemPortID.OID, "0.7.2", []byte{0x00, 0x11, 0x22, 0x33, 0x44, 0x66}, gosnmp.OctetString),
			},
			sec.RemPortDesc.OID: {
				lldpPDU(sec.RemPortDesc.OID, "0.5.1", []byte("to-access"), gosnmp.OctetString),
			},
			sec.RemSysDesc.OID: {
				lldpPDU(sec.RemSysDesc.OID, "0.5.1", []byte("S5700 VRP"), gosnmp.OctetString),
			},
			sec.RemSysCapEnabled.OID: {
				lldpPDU(sec.RemSysCapEnabled.OID, "0.5.1", []byte{0x28}, gosnmp.OctetString),
			},
			sec.RemManAddrIfSubtype.OID: {
				lldpPDU(sec.RemManAddrIfSubtype.OID, "0.5.1.1.4.192.168.20.2", 2, gosnmp.Integer),
			},
			sec.LocPortID.OID: {
				lldpPDU(sec.LocPortID.OID, "5", []byte("GigabitEthernet0/0/24"), gosnmp.OctetString),
			},
			sec.LocPortDesc.OID: {
				lldpPDU(sec.LocPortDesc.OID, "5", []byte("uplink"), gosnmp.OctetString),
			},
		},
	}

	got := collectLLDP(client, sec, "")
	if got.Status != devices.LLDPStatusOK {
		t.Fatalf("Status = %q, want ok", got.Status)
	}
	if got.LocalChassisID != "4c:1f:cc:1a:07:48" {
		t.Fatalf("LocalChassisID = %q", got.LocalChassisID)
	}
	if len(got.Neighbors) != 2 {
		t.Fatalf("邻居数 = %d, want 2: %+v", len(got.Neighbors), got.Neighbors)
	}

	first := got.Neighbors[0]
	want := devices.NeighborMetrics{
		LocalPortNum:     5,
		LocalPortID:      "GigabitEthernet0/0/24",
		LocalPortDesc:    "uplink",
		RemoteChassisID:  "00:11:22:33:44:55",
		RemotePortID:     "GigabitEthernet0/0/1",
		RemotePortDesc:   "to-access",
		RemoteSysName:    "core-sw",
		RemoteSysDesc:    "S5700 VRP",
		RemoteMgmtIP:     "192.168.20.2",
		RemoteCapEnabled: "bridge,router",
	}
	if first != want {
		t.Fatalf("第 1 条邻居 = %+v\nwant %+v", first, want)
	}

	second := got.Neighbors[1]
	if second.LocalPortNum != 7 || second.RemoteSysName != "fw-1" {
		t.Fatalf("第 2 条邻居 = %+v", second)
	}
	if second.RemoteChassisID != "aa:bb:cc:dd:ee:ff" {
		t.Fatalf("第 2 条机箱 ID = %q", second.RemoteChassisID)
	}
	if second.RemotePortID != "00:11:22:33:44:66" {
		t.Fatalf("MAC 型端口 ID 应转十六进制，got %q", second.RemotePortID)
	}
	if second.RemoteMgmtIP != "" {
		t.Fatalf("无管理地址的邻居 RemoteMgmtIP 应为空，got %q", second.RemoteMgmtIP)
	}
}

// TestCollectLLDP_WalkErrorMeansUnknown 主表 walk 报错（超时等）时状态未知：
// 既不能判定视图未放行，也不能清空旧邻居。
func TestCollectLLDP_WalkErrorMeansUnknown(t *testing.T) {
	sec := lldpTestSection()
	client := &failingWalkSNMPClient{
		fakeCollectorSNMPClient: &fakeCollectorSNMPClient{
			getPackets: map[string]*gosnmp.SnmpPacket{
				testLocChassisGetKey: localChassisPacket(4, []byte{1, 2, 3, 4, 5, 6}),
			},
		},
		failOID: sec.RemSysName.OID,
	}

	got := collectLLDP(client, sec, "")
	if got.Status != devices.LLDPStatusUnknown || got.Neighbors != nil {
		t.Fatalf("walk 失败应返回未知状态且无邻居，got %+v", got)
	}
}

// TestCollectLLDP_EmptyTableWithReadableMIBIsOK 探针可读、邻居表为空（设备孤立或对端未开 LLDP）
// 是有效结果：ok + 非 nil 空切片，写入端会清空该设备的旧邻居。
func TestCollectLLDP_EmptyTableWithReadableMIBIsOK(t *testing.T) {
	sec := lldpTestSection()
	client := &fakeCollectorSNMPClient{
		getPackets: map[string]*gosnmp.SnmpPacket{
			testLocChassisGetKey: localChassisPacket(4, []byte{1, 2, 3, 4, 5, 6}),
		},
		bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
			sec.RemSysName.OID: {},
		},
	}

	got := collectLLDP(client, sec, "")
	if got.Status != devices.LLDPStatusOK {
		t.Fatalf("Status = %q, want ok", got.Status)
	}
	if got.Neighbors == nil || len(got.Neighbors) != 0 {
		t.Fatalf("空表应返回非 nil 空切片，got %v", got.Neighbors)
	}
}

// TestCollectLLDP_ViewDeniedIsMIBUnreachable 华为缺省视图 ViewDefault 只含 internet(1.3.6.1)，
// 1.0.8802 子树的 GET 返回 NoSuchInstance、walk 返回 0 行且无错误——这是生产环境
// 「明明开了 LLDP 却看不到链路」的真实形态，必须判成 mib_unreachable 而不是「无邻居」。
func TestCollectLLDP_ViewDeniedIsMIBUnreachable(t *testing.T) {
	sec := lldpTestSection()
	client := &fakeCollectorSNMPClient{
		getPackets: map[string]*gosnmp.SnmpPacket{
			testLocChassisGetKey: noSuchInstancePacket(sec.LocChassisIDSubtype.OID, sec.LocChassisID.OID),
			testHwLLDPEnableOID:  intPacket(testHwLLDPEnableOID, 1),
		},
		bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
			sec.RemSysName.OID: {},
		},
	}

	got := collectLLDP(client, sec, testHwLLDPEnableOID)
	if got.Status != devices.LLDPStatusMIBUnreachable {
		t.Fatalf("Status = %q, want mib_unreachable", got.Status)
	}
	if got.Neighbors != nil {
		t.Fatalf("视图未放行时不应产出邻居快照（写入端需保留旧行），got %v", got.Neighbors)
	}
}

// TestCollectLLDP_VendorSwitchDisabledWins 华为 hwLldpEnable=2 表示设备全局未启用 LLDP，
// 这比「视图未放行」更靠前——先开 LLDP 才谈得上视图。
func TestCollectLLDP_VendorSwitchDisabledWins(t *testing.T) {
	sec := lldpTestSection()
	client := &fakeCollectorSNMPClient{
		getPackets: map[string]*gosnmp.SnmpPacket{
			testLocChassisGetKey: noSuchInstancePacket(sec.LocChassisIDSubtype.OID, sec.LocChassisID.OID),
			testHwLLDPEnableOID:  intPacket(testHwLLDPEnableOID, 2),
		},
	}

	got := collectLLDP(client, sec, testHwLLDPEnableOID)
	if got.Status != devices.LLDPStatusDisabled {
		t.Fatalf("Status = %q, want disabled", got.Status)
	}
	if got.Neighbors != nil {
		t.Fatalf("未启用时不应产出邻居快照，got %v", got.Neighbors)
	}
}

// TestCollectLLDP_ProbeUnknownFallsBackToWalkEvidence 探针 GET 没拿到应答（超时/空包）时，
// walk 有行仍可判 ok；walk 无行则无法证明表可读，保持未知、不清旧行。
func TestCollectLLDP_ProbeUnknownFallsBackToWalkEvidence(t *testing.T) {
	sec := lldpTestSection()

	withRows := &fakeCollectorSNMPClient{
		bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
			sec.RemSysName.OID: {lldpPDU(sec.RemSysName.OID, "0.5.1", []byte("core-sw"), gosnmp.OctetString)},
		},
	}
	if got := collectLLDP(withRows, sec, ""); got.Status != devices.LLDPStatusOK || len(got.Neighbors) != 1 {
		t.Fatalf("探针未知但 walk 有行应判 ok，got %+v", got)
	}

	noRows := &fakeCollectorSNMPClient{
		bulkWalkPackets: map[string][]gosnmp.SnmpPDU{sec.RemSysName.OID: {}},
	}
	if got := collectLLDP(noRows, sec, ""); got.Status != devices.LLDPStatusUnknown || got.Neighbors != nil {
		t.Fatalf("探针未知且 walk 无行应保持未知，got %+v", got)
	}
}

func lldpTestRegistry() *snmpmib.Registry {
	registry := &snmpmib.Registry{
		Vendors: map[string]snmpmib.Vendor{
			"huawei": {
				DisplayName: "Huawei",
				LLDPEnable:  snmpmib.OIDDefinition{OID: testHwLLDPEnableOID, Method: "get"},
			},
		},
	}
	registry.Common.LLDP = lldpTestSection()
	registry.Common.System.SysName = snmpmib.OIDDefinition{OID: "1.3.6.1.2.1.1.5.0", Method: "get"}
	registry.Common.System.Dot1dBaseBridgeAddress = snmpmib.OIDDefinition{OID: "1.3.6.1.2.1.17.1.1.0", Method: "get"}
	return registry
}

func stringPacket(oid string, value string) *gosnmp.SnmpPacket {
	return &gosnmp.SnmpPacket{Variables: []gosnmp.SnmpPDU{{Name: "." + oid, Type: gosnmp.OctetString, Value: []byte(value)}}}
}

// TestCollectNeighbors_ViewDeniedKeepsOldRowsAndFallsBackToBridgeMAC 视图未放行时：
// LLDPAvailable=false（保留旧邻居）、LLDPStatus=mib_unreachable；设备身份退回缺省视图内可读的
// sysName 与桥 MAC——别的设备上报的邻居靠它们匹配回本机。厂商开关按 vendor 解析。
func TestCollectNeighbors_ViewDeniedKeepsOldRowsAndFallsBackToBridgeMAC(t *testing.T) {
	registry := lldpTestRegistry()
	sec := registry.Common.LLDP
	client := &fakeCollectorSNMPClient{
		getPackets: map[string]*gosnmp.SnmpPacket{
			testLocChassisGetKey:   noSuchInstancePacket(sec.LocChassisIDSubtype.OID, sec.LocChassisID.OID),
			testHwLLDPEnableOID:    intPacket(testHwLLDPEnableOID, 1),
			"1.3.6.1.2.1.1.5.0":    stringPacket("1.3.6.1.2.1.1.5.0", "16F-HJ-SW"),
			"1.3.6.1.2.1.17.1.1.0": {Variables: []gosnmp.SnmpPDU{{Name: ".1.3.6.1.2.1.17.1.1.0", Type: gosnmp.OctetString, Value: []byte{0x4c, 0x1f, 0xcc, 0x1a, 0x07, 0x48}}}},
		},
		bulkWalkPackets: map[string][]gosnmp.SnmpPDU{sec.RemSysName.OID: {}},
	}
	metrics := &devices.SNMPMetrics{}

	collectNeighbors(devices.NewSNMPCollectorWithRegistry(nil, registry), client, metrics, registry, "Huawei")

	if metrics.LLDPAvailable {
		t.Fatalf("视图未放行时 LLDPAvailable 应为 false")
	}
	if metrics.LLDPStatus != devices.LLDPStatusMIBUnreachable {
		t.Fatalf("LLDPStatus = %q", metrics.LLDPStatus)
	}
	if metrics.SysName == nil || *metrics.SysName != "16F-HJ-SW" {
		t.Fatalf("SysName = %v", metrics.SysName)
	}
	if metrics.ChassisID == nil || *metrics.ChassisID != "4c:1f:cc:1a:07:48" {
		t.Fatalf("ChassisID 应退回桥 MAC，got %v", metrics.ChassisID)
	}
	if len(client.getCalls) == 0 || !containsOID(client.getCalls, testHwLLDPEnableOID) {
		t.Fatalf("华为设备应查询 hwLldpEnable，getCalls=%v", client.getCalls)
	}
}

// TestCollectNeighbors_ReadableMIBPrefersLLDPChassisID LLDP-MIB 可读时机箱 ID 取 lldpLocChassisId，
// 不再访问桥 MAC；非华为设备不发厂商开关 GET。
func TestCollectNeighbors_ReadableMIBPrefersLLDPChassisID(t *testing.T) {
	registry := lldpTestRegistry()
	sec := registry.Common.LLDP
	client := &fakeCollectorSNMPClient{
		getPackets: map[string]*gosnmp.SnmpPacket{
			testLocChassisGetKey: localChassisPacket(4, []byte{0xaa, 0xbb, 0xcc, 0x00, 0x11, 0x22}),
			"1.3.6.1.2.1.1.5.0":  stringPacket("1.3.6.1.2.1.1.5.0", "acc-1"),
		},
		bulkWalkPackets: map[string][]gosnmp.SnmpPDU{sec.RemSysName.OID: {}},
	}
	metrics := &devices.SNMPMetrics{}

	collectNeighbors(devices.NewSNMPCollectorWithRegistry(nil, registry), client, metrics, registry, "cisco")

	if !metrics.LLDPAvailable || metrics.LLDPStatus != devices.LLDPStatusOK {
		t.Fatalf("可读空表应 ok：available=%v status=%q", metrics.LLDPAvailable, metrics.LLDPStatus)
	}
	if metrics.Neighbors == nil || len(metrics.Neighbors) != 0 {
		t.Fatalf("Neighbors 应为非 nil 空切片，got %v", metrics.Neighbors)
	}
	if metrics.ChassisID == nil || *metrics.ChassisID != "aa:bb:cc:00:11:22" {
		t.Fatalf("ChassisID = %v", metrics.ChassisID)
	}
	if containsOID(client.getCalls, testHwLLDPEnableOID) {
		t.Fatalf("非华为设备不应查询 hwLldpEnable，getCalls=%v", client.getCalls)
	}
	if containsOID(client.getCalls, "1.3.6.1.2.1.17.1.1.0") {
		t.Fatalf("lldpLocChassisId 可读时不应再读桥 MAC，getCalls=%v", client.getCalls)
	}
}

func containsOID(calls [][]string, oid string) bool {
	for _, call := range calls {
		for _, item := range call {
			if item == oid {
				return true
			}
		}
	}
	return false
}
