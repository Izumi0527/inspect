package devices_test

import (
	"testing"
	_ "unsafe"

	"github.com/gosnmp/gosnmp"

	"go.uber.org/zap"

	devices "github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/snmpmib"
)

// collectInterfaces 是 SNMPCollector 的未导出方法，按仓库约定经 go:linkname 桥接。
//
//go:linkname collectInterfaces github.com/your-org/inspect-system/backend-go/internal/devices.(*SNMPCollector).collectInterfaces
func collectInterfaces(c *devices.SNMPCollector, target collectorSNMPClient, ipAddress string, metrics *devices.SNMPMetrics, registry *snmpmib.Registry)

// walkPDU 构造一条 bulkwalk 返回的 PDU。
func walkPDU(baseOID string, index int, value interface{}, pduType gosnmp.Asn1BER) gosnmp.SnmpPDU {
	return gosnmp.SnmpPDU{
		Name:  baseOID + "." + itoa(index),
		Type:  pduType,
		Value: value,
	}
}

func itoa(v int) string {
	if v == 0 {
		return "0"
	}
	digits := ""
	for v > 0 {
		digits = string(rune('0'+v%10)) + digits
		v /= 10
	}
	return digits
}

// interfaceHealthRegistry 构造仅含接口健康采集所需 OID 的最小 registry。
func interfaceHealthRegistry() *snmpmib.Registry {
	def := func(oid string) snmpmib.OIDDefinition {
		return snmpmib.OIDDefinition{OID: oid, Method: "bulkwalk", ValueType: "integer"}
	}
	reg := &snmpmib.Registry{}
	reg.Common.Interfaces.IfDescr = def("1.3.6.1.2.1.2.2.1.2")
	reg.Common.Interfaces.IfHighSpeed = def("1.3.6.1.2.1.31.1.1.1.15")
	reg.Common.Interfaces.IfOperStatus = def("1.3.6.1.2.1.2.2.1.8")
	reg.Common.Interfaces.IfHCInOctets = def("1.3.6.1.2.1.31.1.1.1.6")
	reg.Common.Interfaces.IfHCOutOctets = def("1.3.6.1.2.1.31.1.1.1.10")
	reg.Common.Interfaces.IfAdminStatus = def("1.3.6.1.2.1.2.2.1.7")
	reg.Common.Interfaces.IfInErrors = def("1.3.6.1.2.1.2.2.1.14")
	reg.Common.Interfaces.IfOutErrors = def("1.3.6.1.2.1.2.2.1.20")
	reg.Common.Interfaces.IfInDiscards = def("1.3.6.1.2.1.2.2.1.13")
	reg.Common.Interfaces.IfOutDiscards = def("1.3.6.1.2.1.2.2.1.19")
	reg.Common.Interfaces.IfInUcastPkts = def("1.3.6.1.2.1.2.2.1.11")
	reg.Common.Interfaces.IfOutUcastPkts = def("1.3.6.1.2.1.2.2.1.17")
	reg.Common.Ethernet.Dot3DuplexStatus = def("1.3.6.1.2.1.10.7.2.1.19")
	return reg
}

// interfaceHealthClient 构造一台设备的采集应答：索引 1 是一个错包偏高的千兆口，
// 索引 2 是被人为 shutdown 的端口。
func interfaceHealthClient() *fakeCollectorSNMPClient {
	return &fakeCollectorSNMPClient{
		bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
			"1.3.6.1.2.1.2.2.1.2": {
				walkPDU("1.3.6.1.2.1.2.2.1.2", 1, []byte("GigabitEthernet0/0/1"), gosnmp.OctetString),
				walkPDU("1.3.6.1.2.1.2.2.1.2", 2, []byte("GigabitEthernet0/0/2"), gosnmp.OctetString),
			},
			"1.3.6.1.2.1.31.1.1.1.15": {
				walkPDU("1.3.6.1.2.1.31.1.1.1.15", 1, 1000, gosnmp.Gauge32),
				walkPDU("1.3.6.1.2.1.31.1.1.1.15", 2, 1000, gosnmp.Gauge32),
			},
			// 口 1 运行中；口 2 oper down
			"1.3.6.1.2.1.2.2.1.8": {
				walkPDU("1.3.6.1.2.1.2.2.1.8", 1, 1, gosnmp.Integer),
				walkPDU("1.3.6.1.2.1.2.2.1.8", 2, 2, gosnmp.Integer),
			},
			// 口 1 admin up（oper 也 up，正常）；口 2 admin down（人为关闭，不是故障）
			"1.3.6.1.2.1.2.2.1.7": {
				walkPDU("1.3.6.1.2.1.2.2.1.7", 1, 1, gosnmp.Integer),
				walkPDU("1.3.6.1.2.1.2.2.1.7", 2, 2, gosnmp.Integer),
			},
			"1.3.6.1.2.1.2.2.1.14": {walkPDU("1.3.6.1.2.1.2.2.1.14", 1, 1200, gosnmp.Counter32)},
			"1.3.6.1.2.1.2.2.1.20": {walkPDU("1.3.6.1.2.1.2.2.1.20", 1, 34, gosnmp.Counter32)},
			"1.3.6.1.2.1.2.2.1.13": {walkPDU("1.3.6.1.2.1.2.2.1.13", 1, 500, gosnmp.Counter32)},
			"1.3.6.1.2.1.2.2.1.19": {walkPDU("1.3.6.1.2.1.2.2.1.19", 1, 7, gosnmp.Counter32)},
			"1.3.6.1.2.1.2.2.1.11": {walkPDU("1.3.6.1.2.1.2.2.1.11", 1, 998800, gosnmp.Counter32)},
			"1.3.6.1.2.1.2.2.1.17": {walkPDU("1.3.6.1.2.1.2.2.1.17", 1, 999966, gosnmp.Counter32)},
			// 口 1 协商成半双工（2）——千兆口上属异常，会引发大量错包
			"1.3.6.1.2.1.10.7.2.1.19": {walkPDU("1.3.6.1.2.1.10.7.2.1.19", 1, 2, gosnmp.Integer)},
		},
	}
}

func findInterface(metrics *devices.SNMPMetrics, description string) *devices.InterfaceMetrics {
	for i := range metrics.Interfaces {
		if metrics.Interfaces[i].Description == description {
			return &metrics.Interfaces[i]
		}
	}
	return nil
}

// TestCollectInterfaces_CollectsErrorAndDiscardCounters 守护接口错包与丢弃计数的采集。
//
// 这是当前系统最大的采集缺口：错包率是物理层劣化（光衰、跳线老化、接头氧化、
// 电磁干扰）的唯一直接证据，而丢弃率指向的是拥塞或 ACL/QoS 配置——两者语义
// 完全不同，混为一谈会把配置问题当线路问题查。
func TestCollectInterfaces_CollectsErrorAndDiscardCounters(t *testing.T) {
	collector := devices.NewSNMPCollector(zap.NewNop())
	metrics := &devices.SNMPMetrics{}

	collectInterfaces(collector, interfaceHealthClient(), "192.168.1.1", metrics, interfaceHealthRegistry())

	iface := findInterface(metrics, "GigabitEthernet0/0/1")
	if iface == nil {
		t.Fatalf("未采集到 GigabitEthernet0/0/1，实际接口数 %d", len(metrics.Interfaces))
	}

	cases := []struct {
		name string
		got  *uint64
		want uint64
	}{
		{"入方向错包", iface.InErrors, 1200},
		{"出方向错包", iface.OutErrors, 34},
		{"入方向丢弃", iface.InDiscards, 500},
		{"出方向丢弃", iface.OutDiscards, 7},
		{"入方向单播包", iface.InUcastPkts, 998800},
		{"出方向单播包", iface.OutUcastPkts, 999966},
	}
	for _, tc := range cases {
		if tc.got == nil {
			t.Errorf("%s 未采集到", tc.name)
			continue
		}
		if *tc.got != tc.want {
			t.Errorf("%s = %d，want %d", tc.name, *tc.got, tc.want)
		}
	}
}

// TestCollectInterfaces_CollectsAdminStatus 守护管理状态采集。
//
// 现有「接口状态」检查项只看 ifOperStatus，对人为 shutdown 的端口一样报警告。
// 有了 ifAdminStatus 才能区分「运维意图关闭」与「链路真的断了」。
func TestCollectInterfaces_CollectsAdminStatus(t *testing.T) {
	collector := devices.NewSNMPCollector(zap.NewNop())
	metrics := &devices.SNMPMetrics{}

	collectInterfaces(collector, interfaceHealthClient(), "192.168.1.1", metrics, interfaceHealthRegistry())

	up := findInterface(metrics, "GigabitEthernet0/0/1")
	down := findInterface(metrics, "GigabitEthernet0/0/2")
	if up == nil || down == nil {
		t.Fatalf("接口采集不完整，实际接口数 %d", len(metrics.Interfaces))
	}

	if up.AdminUp == nil || !*up.AdminUp {
		t.Errorf("口 1 应为 admin up，实际 %v", up.AdminUp)
	}
	if down.AdminUp == nil || *down.AdminUp {
		t.Errorf("口 2 应为 admin down（人为关闭），实际 %v", down.AdminUp)
	}
}

// TestCollectInterfaces_CollectsDuplexStatus 守护双工模式采集。
// 千兆口协商成半双工会同时引发大量错包与性能腰斩，是经典故障。
func TestCollectInterfaces_CollectsDuplexStatus(t *testing.T) {
	collector := devices.NewSNMPCollector(zap.NewNop())
	metrics := &devices.SNMPMetrics{}

	collectInterfaces(collector, interfaceHealthClient(), "192.168.1.1", metrics, interfaceHealthRegistry())

	iface := findInterface(metrics, "GigabitEthernet0/0/1")
	if iface == nil {
		t.Fatal("未采集到目标接口")
	}
	if iface.DuplexStatus == nil {
		t.Fatal("未采集到双工状态")
	}
	if *iface.DuplexStatus != 2 {
		t.Errorf("双工状态 = %d，want 2（halfDuplex）", *iface.DuplexStatus)
	}
}

// TestCollectInterfaces_TolerantToMissingOIDs registry 未定义这些 OID 时（老配置、
// 精简 agent）必须安静跳过，既不 panic 也不影响既有字段的采集。
func TestCollectInterfaces_TolerantToMissingOIDs(t *testing.T) {
	reg := interfaceHealthRegistry()
	reg.Common.Interfaces.IfAdminStatus = snmpmib.OIDDefinition{}
	reg.Common.Interfaces.IfInErrors = snmpmib.OIDDefinition{}
	reg.Common.Ethernet.Dot3DuplexStatus = snmpmib.OIDDefinition{}

	collector := devices.NewSNMPCollector(zap.NewNop())
	metrics := &devices.SNMPMetrics{}

	collectInterfaces(collector, interfaceHealthClient(), "192.168.1.1", metrics, reg)

	iface := findInterface(metrics, "GigabitEthernet0/0/1")
	if iface == nil {
		t.Fatal("OID 缺失不应影响基础接口采集")
	}
	if iface.AdminUp != nil || iface.InErrors != nil || iface.DuplexStatus != nil {
		t.Errorf("OID 未定义时不应产生值，实际 admin=%v inErrors=%v duplex=%v",
			iface.AdminUp, iface.InErrors, iface.DuplexStatus)
	}
	// 未受影响的字段仍应采到
	if iface.OutErrors == nil || *iface.OutErrors != 34 {
		t.Errorf("其余 OID 的采集不应被牵连，出方向错包 = %v", iface.OutErrors)
	}
}
