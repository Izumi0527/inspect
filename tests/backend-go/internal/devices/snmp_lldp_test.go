package devices_test

import (
	"errors"
	"testing"
	_ "unsafe"

	"github.com/gosnmp/gosnmp"

	devices "github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/snmpmib"
)

// collectLLDPNeighbors 采集 LLDP 邻居表。
//
//go:linkname collectLLDPNeighbors github.com/your-org/inspect-system/backend-go/internal/devices.collectLLDPNeighbors
func collectLLDPNeighbors(client collectorSNMPClient, lldp snmpmib.LLDPSection) ([]devices.NeighborMetrics, bool)

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

func lldpTestSection() snmpmib.LLDPSection {
	def := func(oid string) snmpmib.OIDDefinition {
		return snmpmib.OIDDefinition{OID: oid, Method: "bulkwalk"}
	}
	return snmpmib.LLDPSection{
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

// TestCollectLLDPNeighbors_MergesColumnsAndParsesMgmtAddr 邻居表各列按
// TimeMark.LocalPort.RemIndex 三段索引合并；MAC 型机箱 ID 转十六进制；
// 管理地址从 lldpRemManAddrTable 的索引尾部解析出来。
func TestCollectLLDPNeighbors_MergesColumnsAndParsesMgmtAddr(t *testing.T) {
	sec := lldpTestSection()
	client := &fakeCollectorSNMPClient{
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

	got, ok := collectLLDPNeighbors(client, sec)
	if !ok {
		t.Fatalf("collectLLDPNeighbors() ok = false, want true")
	}
	if len(got) != 2 {
		t.Fatalf("邻居数 = %d, want 2: %+v", len(got), got)
	}

	first := got[0]
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

	second := got[1]
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

// TestCollectLLDPNeighbors_WalkErrorMeansUnavailable 主表 walk 失败表示设备不支持或
// SNMP 视图未放行，必须返回 ok=false——写入端据此保留旧邻居而不是清空。
func TestCollectLLDPNeighbors_WalkErrorMeansUnavailable(t *testing.T) {
	sec := lldpTestSection()
	client := &failingWalkSNMPClient{
		fakeCollectorSNMPClient: &fakeCollectorSNMPClient{},
		failOID:                 sec.RemSysName.OID,
	}

	got, ok := collectLLDPNeighbors(client, sec)
	if ok || got != nil {
		t.Fatalf("walk 失败应返回 (nil,false)，got (%v,%v)", got, ok)
	}
}

// TestCollectLLDPNeighbors_EmptyTableIsAvailable 表可读但没有邻居（设备孤立或对端未开 LLDP）
// 是有效结果：返回空切片 + ok=true，写入端会清空该设备的旧邻居。
func TestCollectLLDPNeighbors_EmptyTableIsAvailable(t *testing.T) {
	sec := lldpTestSection()
	client := &fakeCollectorSNMPClient{
		bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
			sec.RemSysName.OID: {},
		},
	}

	got, ok := collectLLDPNeighbors(client, sec)
	if !ok {
		t.Fatalf("空表应 ok=true")
	}
	if got == nil || len(got) != 0 {
		t.Fatalf("空表应返回非 nil 空切片，got %v", got)
	}
}
