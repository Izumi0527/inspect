package devices_test

import (
	"errors"
	"strings"
	"testing"
	"time"
	"unicode/utf8"
	_ "unsafe"

	"github.com/gosnmp/gosnmp"

	"go.uber.org/zap"
	"golang.org/x/text/encoding/simplifiedchinese"

	devices "github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/snmpmib"
)

// collectInterfaces 是 SNMPCollector 的未导出方法，按仓库约定经 go:linkname 桥接。
//
//go:linkname collectInterfaces github.com/your-org/inspect-system/backend-go/internal/devices.(*SNMPCollector).collectInterfaces
func collectInterfaces(c *devices.SNMPCollector, target collectorSNMPClient, ipAddress string, metrics *devices.SNMPMetrics, registry *snmpmib.Registry)

//go:linkname collectSTP github.com/your-org/inspect-system/backend-go/internal/devices.(*SNMPCollector).collectSTP
func collectSTP(c *devices.SNMPCollector, target collectorSNMPClient, metrics *devices.SNMPMetrics, registry *snmpmib.Registry)

//go:linkname rateSampleUsable github.com/your-org/inspect-system/backend-go/internal/devices.rateSampleUsable
func rateSampleUsable(elapsed time.Duration) bool

// 速率窗口必须容得下「一个采集周期 + 抖动」以及慢轮后的补跑间隔，超过 10 分钟才重建基线。
func TestRateSampleUsable_AcceptsCadenceJitterAndRejectsStaleBaseline(t *testing.T) {
	cases := []struct {
		name    string
		elapsed time.Duration
		want    bool
	}{
		{"零间隔", 0, false},
		{"时钟回拨", -time.Second, false},
		{"3 分钟节奏", 3 * time.Minute, true},
		{"5 分钟节奏 + 50ms 抖动", 5*time.Minute + 50*time.Millisecond, true},
		{"慢轮后补跑", 9*time.Minute + 59*time.Second, true},
		{"恰好 10 分钟", 10 * time.Minute, false},
		{"中断 15 分钟", 15 * time.Minute, false},
	}
	for _, tc := range cases {
		if got := rateSampleUsable(tc.elapsed); got != tc.want {
			t.Errorf("%s：rateSampleUsable(%v) = %v，want %v", tc.name, tc.elapsed, got, tc.want)
		}
	}
}

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
	reg.Common.Interfaces.IfInNUcastPkts = def("1.3.6.1.2.1.2.2.1.12")
	reg.Common.Interfaces.IfOutNUcastPkts = def("1.3.6.1.2.1.2.2.1.18")
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
			"1.3.6.1.2.1.2.2.1.12": {walkPDU("1.3.6.1.2.1.2.2.1.12", 1, 15000, gosnmp.Counter32)},
			"1.3.6.1.2.1.2.2.1.18": {walkPDU("1.3.6.1.2.1.2.2.1.18", 1, 8000, gosnmp.Counter32)},
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
		{"入方向非单播包", iface.InNUcastPkts, 15000},
		{"出方向非单播包", iface.OutNUcastPkts, 8000},
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

// TestCollectSTP_CollectsMetrics 守护生成树（STP）指标的采集。
func TestCollectSTP_CollectsMetrics(t *testing.T) {
	collector := devices.NewSNMPCollector(zap.NewNop())
	metrics := &devices.SNMPMetrics{}

	def := func(oid, method, valType string) snmpmib.OIDDefinition {
		return snmpmib.OIDDefinition{OID: oid, Method: method, ValueType: valType}
	}
	reg := &snmpmib.Registry{}
	reg.Common.BridgeSTP.StpProtocolSpec = def("1.3.6.1.2.1.17.2.1.0", "get", "integer")
	reg.Common.BridgeSTP.StpTimeSinceTopologyChange = def("1.3.6.1.2.1.17.2.3.0", "get", "timeticks")
	reg.Common.BridgeSTP.StpTopChanges = def("1.3.6.1.2.1.17.2.4.0", "get", "counter32")

	client := &fakeCollectorSNMPClient{
		getPackets: map[string]*gosnmp.SnmpPacket{
			"1.3.6.1.2.1.17.2.1.0": {
				Variables: []gosnmp.SnmpPDU{
					{Name: "1.3.6.1.2.1.17.2.1.0", Type: gosnmp.Integer, Value: 3},
				},
			},
			"1.3.6.1.2.1.17.2.3.0": {
				Variables: []gosnmp.SnmpPDU{
					{Name: "1.3.6.1.2.1.17.2.3.0", Type: gosnmp.TimeTicks, Value: uint32(720000)}, // 7200 秒
				},
			},
			"1.3.6.1.2.1.17.2.4.0": {
				Variables: []gosnmp.SnmpPDU{
					{Name: "1.3.6.1.2.1.17.2.4.0", Type: gosnmp.Counter32, Value: uint32(5)},
				},
			},
		},
	}

	collectSTP(collector, client, metrics, reg)

	if metrics.STP.ProtocolSpec == nil || *metrics.STP.ProtocolSpec != 3 {
		t.Errorf("ProtocolSpec = %v, want 3", metrics.STP.ProtocolSpec)
	}
	if metrics.STP.TimeSinceTopologyChange == nil || *metrics.STP.TimeSinceTopologyChange != 7200 {
		t.Errorf("TimeSinceTopologyChange = %v, want 7200", metrics.STP.TimeSinceTopologyChange)
	}
	if metrics.STP.TopChanges == nil || *metrics.STP.TopChanges != 5 {
		t.Errorf("TopChanges = %v, want 5", metrics.STP.TopChanges)
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

// octetsClient 构造单个在线千兆口的应答，入/出方向 64 位八位组计数器分别为 in / out。
func octetsClient(in, out uint64) *fakeCollectorSNMPClient {
	return &fakeCollectorSNMPClient{
		bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
			"1.3.6.1.2.1.2.2.1.2":     {walkPDU("1.3.6.1.2.1.2.2.1.2", 1, []byte("GigabitEthernet0/0/1"), gosnmp.OctetString)},
			"1.3.6.1.2.1.31.1.1.1.15": {walkPDU("1.3.6.1.2.1.31.1.1.1.15", 1, 1000, gosnmp.Gauge32)},
			"1.3.6.1.2.1.2.2.1.8":     {walkPDU("1.3.6.1.2.1.2.2.1.8", 1, 1, gosnmp.Integer)},
			"1.3.6.1.2.1.31.1.1.1.6":  {walkPDU("1.3.6.1.2.1.31.1.1.1.6", 1, in, gosnmp.Counter64)},
			"1.3.6.1.2.1.31.1.1.1.10": {walkPDU("1.3.6.1.2.1.31.1.1.1.10", 1, out, gosnmp.Counter64)},
		},
	}
}

// 没有任何接口算出速率（重启后首轮、长时间未采集后重建基线、计数器回绕）时，总带宽必须留空：
// 写成 0 会把「本轮没有数据」伪装成「流量为 0」，聚合流量图在这些时间点掉到 0。
func TestCollectInterfaces_FirstSampleLeavesTotalBandwidthUnset(t *testing.T) {
	collector := devices.NewSNMPCollector(zap.NewNop())
	metrics := &devices.SNMPMetrics{}
	collectInterfaces(collector, octetsClient(1_000_000, 500_000), "192.168.9.9", metrics, interfaceHealthRegistry())

	if metrics.BandwidthIn != nil || metrics.BandwidthOut != nil {
		t.Fatalf("首轮只建立基线、算不出速率，总带宽应为空，实际 in=%v out=%v", deref(metrics.BandwidthIn), deref(metrics.BandwidthOut))
	}
}

// 第二轮有了基线，总带宽要按接口速率汇总上报（防止改成「永远不写」）。
func TestCollectInterfaces_SecondSampleReportsTotalBandwidth(t *testing.T) {
	collector := devices.NewSNMPCollector(zap.NewNop())
	registry := interfaceHealthRegistry()
	collectInterfaces(collector, octetsClient(1_000_000, 500_000), "192.168.9.9", &devices.SNMPMetrics{}, registry)
	time.Sleep(50 * time.Millisecond)

	metrics := &devices.SNMPMetrics{}
	collectInterfaces(collector, octetsClient(1_001_000, 500_500), "192.168.9.9", metrics, registry)
	if metrics.BandwidthIn == nil || *metrics.BandwidthIn <= 0 || metrics.BandwidthOut == nil || *metrics.BandwidthOut <= 0 {
		t.Fatalf("第二轮应汇总出正的总带宽，实际 in=%v out=%v", deref(metrics.BandwidthIn), deref(metrics.BandwidthOut))
	}
}

func deref(value *float64) interface{} {
	if value == nil {
		return nil
	}
	return *value
}

type interfaceErrWalkClient struct {
	*fakeCollectorSNMPClient
	bulkWalkErrors map[string]error
}

func (f *interfaceErrWalkClient) BulkWalkAll(oid string) ([]gosnmp.SnmpPDU, error) {
	f.bulkWalkCalls = append(f.bulkWalkCalls, oid)
	if err, ok := f.bulkWalkErrors[oid]; ok {
		return nil, err
	}
	if result, ok := f.bulkWalkPackets[oid]; ok {
		return result, nil
	}
	return nil, nil
}

func TestCollectInterfaces_PortDescriptionAndIfNameFallback(t *testing.T) {
	reg := interfaceHealthRegistry()
	reg.Common.Interfaces.IfName = snmpmib.OIDDefinition{OID: "1.3.6.1.2.1.31.1.1.1.1", Method: "bulkwalk", ValueType: "string"}
	reg.Common.Interfaces.IfAlias = snmpmib.OIDDefinition{OID: "1.3.6.1.2.1.31.1.1.1.18", Method: "bulkwalk", ValueType: "string"}

	gbkDesc, err := simplifiedchinese.GBK.NewEncoder().Bytes([]byte("上联核心交换机"))
	if err != nil {
		t.Fatalf("encode GBK: %v", err)
	}
	longUTF8 := strings.Repeat("中", 90) // 270 bytes -> 截断至 <=255 字节且不拆半字符

	t.Run("ifAlias 英文/UTF8/GBK/空串/控制字符清洗与 UTF-8 截断及 ifName 兜底", func(t *testing.T) {
		collector := devices.NewSNMPCollector(zap.NewNop())
		metrics := &devices.SNMPMetrics{}
		client := &fakeCollectorSNMPClient{
			bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
				reg.Common.Interfaces.IfDescr.OID: {
					walkPDU(reg.Common.Interfaces.IfDescr.OID, 1, []byte("GigabitEthernet0/0/1"), gosnmp.OctetString),
					walkPDU(reg.Common.Interfaces.IfDescr.OID, 2, []byte(""), gosnmp.OctetString),
					walkPDU(reg.Common.Interfaces.IfDescr.OID, 3, []byte("GigabitEthernet0/0/3"), gosnmp.OctetString),
					walkPDU(reg.Common.Interfaces.IfDescr.OID, 4, []byte("GigabitEthernet0/0/4"), gosnmp.OctetString),
					walkPDU(reg.Common.Interfaces.IfDescr.OID, 5, []byte("GigabitEthernet0/0/5"), gosnmp.OctetString),
					walkPDU(reg.Common.Interfaces.IfDescr.OID, 6, []byte("GigabitEthernet0/0/6"), gosnmp.OctetString),
				},
				reg.Common.Interfaces.IfName.OID: {
					walkPDU(reg.Common.Interfaces.IfName.OID, 2, []byte("GigabitEthernet0/0/2"), gosnmp.OctetString),
				},
				reg.Common.Interfaces.IfAlias.OID: {
					walkPDU(reg.Common.Interfaces.IfAlias.OID, 1, []byte("To-Core-SW\r\nUplink\t01"), gosnmp.OctetString),
					walkPDU(reg.Common.Interfaces.IfAlias.OID, 2, gbkDesc, gosnmp.OctetString),
					walkPDU(reg.Common.Interfaces.IfAlias.OID, 3, []byte("接入区-三层上行"), gosnmp.OctetString),
					walkPDU(reg.Common.Interfaces.IfAlias.OID, 4, []byte("Bad\x07Control"), gosnmp.OctetString),
					walkPDU(reg.Common.Interfaces.IfAlias.OID, 5, []byte(longUTF8), gosnmp.OctetString),
					// index 6 未返回，表可读时应置非 nil 空串 ""
				},
			},
		}

		collectInterfaces(collector, client, "192.168.1.10", metrics, reg)

		byName := make(map[string]devices.InterfaceMetrics, len(metrics.Interfaces))
		for _, iface := range metrics.Interfaces {
			byName[iface.Name] = iface
		}

		if byName["if1"].Description != "GigabitEthernet0/0/1" || byName["if1"].PortDescription == nil || *byName["if1"].PortDescription != "To-Core-SW Uplink 01" {
			t.Fatalf("if1 = %+v", byName["if1"])
		}
		if byName["if2"].Description != "GigabitEthernet0/0/2" || byName["if2"].PortDescription == nil || *byName["if2"].PortDescription != "上联核心交换机" {
			t.Fatalf("if2 = %+v (portDesc=%v)", byName["if2"], byName["if2"].PortDescription)
		}
		if byName["if3"].PortDescription == nil || *byName["if3"].PortDescription != "接入区-三层上行" {
			t.Fatalf("if3 PortDescription = %v", byName["if3"].PortDescription)
		}
		if byName["if4"].PortDescription == nil || *byName["if4"].PortDescription != "" {
			t.Fatalf("if4 PortDescription = %v, want empty string for control char rejection", byName["if4"].PortDescription)
		}
		if byName["if5"].PortDescription == nil {
			t.Fatal("if5 PortDescription = nil")
		}
		gotLong := *byName["if5"].PortDescription
		if len(gotLong) > 255 || len(gotLong) != 255 || !utf8.ValidString(gotLong) {
			t.Fatalf("if5 truncated len=%d validUTF8=%v", len(gotLong), utf8.ValidString(gotLong))
		}
		if byName["if6"].PortDescription == nil || *byName["if6"].PortDescription != "" {
			t.Fatalf("if6 PortDescription = %v, want non-nil empty string", byName["if6"].PortDescription)
		}
	})

	t.Run("ifAlias 不可读时 PortDescription 保持 nil 且 ifDescr 完整时不额外 walk ifName", func(t *testing.T) {
		collector := devices.NewSNMPCollector(zap.NewNop())
		metrics := &devices.SNMPMetrics{}
		client := &interfaceErrWalkClient{
			fakeCollectorSNMPClient: &fakeCollectorSNMPClient{
				bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
					reg.Common.Interfaces.IfDescr.OID: {
						walkPDU(reg.Common.Interfaces.IfDescr.OID, 1, []byte("GigabitEthernet0/0/1"), gosnmp.OctetString),
					},
				},
			},
			bulkWalkErrors: map[string]error{
				reg.Common.Interfaces.IfAlias.OID: errors.New("snmp walk timeout"),
			},
		}

		collectInterfaces(collector, client, "192.168.1.11", metrics, reg)

		if len(metrics.Interfaces) != 1 {
			t.Fatalf("len(Interfaces) = %d, want 1", len(metrics.Interfaces))
		}
		if metrics.Interfaces[0].PortDescription != nil {
			t.Fatalf("PortDescription = %q, want nil when ifAlias walk fails", *metrics.Interfaces[0].PortDescription)
		}
		for _, calledOID := range client.bulkWalkCalls {
			if calledOID == reg.Common.Interfaces.IfName.OID {
				t.Fatalf("unexpected BulkWalkAll(%s) when all ifDescr are non-empty", calledOID)
			}
		}
	})
}

// 设备总带宽 BandwidthIn/BandwidthOut 只累加物理口，排除 Vlanif/Eth-Trunk/LoopBack/子接口，
// 同时各接口自身的 InRate/OutRate 仍照常计算供单口明细记录。
func TestCollectInterfaces_TotalBandwidthExcludesLogicalAndSubInterfaces(t *testing.T) {
	makeClient := func(mul uint64) *fakeCollectorSNMPClient {
		return &fakeCollectorSNMPClient{
			bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
				"1.3.6.1.2.1.2.2.1.2": {
					walkPDU("1.3.6.1.2.1.2.2.1.2", 1, []byte("GigabitEthernet0/0/1"), gosnmp.OctetString),
					walkPDU("1.3.6.1.2.1.2.2.1.2", 2, []byte("Vlanif1"), gosnmp.OctetString),
					walkPDU("1.3.6.1.2.1.2.2.1.2", 3, []byte("Eth-Trunk1"), gosnmp.OctetString),
					walkPDU("1.3.6.1.2.1.2.2.1.2", 4, []byte("InLoopBack0"), gosnmp.OctetString),
					walkPDU("1.3.6.1.2.1.2.2.1.2", 5, []byte("GigabitEthernet0/0/1.100"), gosnmp.OctetString),
				},
				"1.3.6.1.2.1.31.1.1.1.15": {
					walkPDU("1.3.6.1.2.1.31.1.1.1.15", 1, 1000, gosnmp.Gauge32),
					walkPDU("1.3.6.1.2.1.31.1.1.1.15", 2, 1000, gosnmp.Gauge32),
					walkPDU("1.3.6.1.2.1.31.1.1.1.15", 3, 1000, gosnmp.Gauge32),
					walkPDU("1.3.6.1.2.1.31.1.1.1.15", 5, 1000, gosnmp.Gauge32),
				},
				"1.3.6.1.2.1.2.2.1.8": {
					walkPDU("1.3.6.1.2.1.2.2.1.8", 1, 1, gosnmp.Integer),
					walkPDU("1.3.6.1.2.1.2.2.1.8", 2, 1, gosnmp.Integer),
					walkPDU("1.3.6.1.2.1.2.2.1.8", 3, 1, gosnmp.Integer),
					walkPDU("1.3.6.1.2.1.2.2.1.8", 4, 1, gosnmp.Integer),
					walkPDU("1.3.6.1.2.1.2.2.1.8", 5, 1, gosnmp.Integer),
				},
				"1.3.6.1.2.1.31.1.1.1.6": {
					walkPDU("1.3.6.1.2.1.31.1.1.1.6", 1, 100_000*mul, gosnmp.Counter64),
					walkPDU("1.3.6.1.2.1.31.1.1.1.6", 2, 100_000*mul, gosnmp.Counter64),
					walkPDU("1.3.6.1.2.1.31.1.1.1.6", 3, 100_000*mul, gosnmp.Counter64),
					walkPDU("1.3.6.1.2.1.31.1.1.1.6", 4, 20_000*mul, gosnmp.Counter64),
					walkPDU("1.3.6.1.2.1.31.1.1.1.6", 5, 100_000*mul, gosnmp.Counter64),
				},
				"1.3.6.1.2.1.31.1.1.1.10": {
					walkPDU("1.3.6.1.2.1.31.1.1.1.10", 1, 50_000*mul, gosnmp.Counter64),
					walkPDU("1.3.6.1.2.1.31.1.1.1.10", 2, 50_000*mul, gosnmp.Counter64),
					walkPDU("1.3.6.1.2.1.31.1.1.1.10", 3, 50_000*mul, gosnmp.Counter64),
					walkPDU("1.3.6.1.2.1.31.1.1.1.10", 4, 10_000*mul, gosnmp.Counter64),
					walkPDU("1.3.6.1.2.1.31.1.1.1.10", 5, 50_000*mul, gosnmp.Counter64),
				},
			},
		}
	}

	collector := devices.NewSNMPCollector(zap.NewNop())
	registry := interfaceHealthRegistry()
	collectInterfaces(collector, makeClient(1), "192.168.9.10", &devices.SNMPMetrics{}, registry)
	time.Sleep(50 * time.Millisecond)

	metrics := &devices.SNMPMetrics{}
	collectInterfaces(collector, makeClient(2), "192.168.9.10", metrics, registry)

	byName := make(map[string]devices.InterfaceMetrics, len(metrics.Interfaces))
	for _, iface := range metrics.Interfaces {
		byName[iface.Name] = iface
	}
	for _, key := range []string{"if1", "if2", "if3", "if4", "if5"} {
		if byName[key].InRate == nil || *byName[key].InRate <= 0 || byName[key].OutRate == nil || *byName[key].OutRate <= 0 {
			t.Fatalf("%s rate should still be computed: in=%v out=%v", key, deref(byName[key].InRate), deref(byName[key].OutRate))
		}
	}
	if metrics.BandwidthIn == nil || metrics.BandwidthOut == nil {
		t.Fatalf("expected non-nil BandwidthIn/BandwidthOut, got in=%v out=%v", metrics.BandwidthIn, metrics.BandwidthOut)
	}
	if *metrics.BandwidthIn != *byName["if1"].InRate || *metrics.BandwidthOut != *byName["if1"].OutRate {
		t.Fatalf("total bandwidth = (%v, %v), want exact physical if1 rate (%v, %v)",
			*metrics.BandwidthIn, *metrics.BandwidthOut, *byName["if1"].InRate, *byName["if1"].OutRate)
	}
}
