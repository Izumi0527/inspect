package devices_test

import (
	"reflect"
	"testing"
	_ "unsafe"

	"github.com/gosnmp/gosnmp"

	devices "github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/snmpmib"
)

//go:linkname parseHostStorageDisks github.com/your-org/inspect-system/backend-go/internal/devices.parseHostStorageDisks
func parseHostStorageDisks(pdus []gosnmp.SnmpPDU) []devices.DiskMetrics

//go:linkname collectUptime github.com/your-org/inspect-system/backend-go/internal/devices.(*SNMPCollector).collectUptime
func collectUptime(collector *devices.SNMPCollector, target collectorSNMPClient, metrics *devices.SNMPMetrics, registry *snmpmib.Registry)

const (
	hrStorageEntry   = "1.3.6.1.2.1.25.2.3.1"
	hrStorageRAMType = ".1.3.6.1.2.1.25.2.1.2"
	hrStorageFixed   = ".1.3.6.1.2.1.25.2.1.4"
	hrStorageNetwork = ".1.3.6.1.2.1.25.2.1.10"
)

// storageRow 生成 hrStorageEntry 一行的四列：类型(.2)、描述(.3)、分配单元(.4)、容量(.5)、已用(.6)。
func storageRow(index string, typeOID string, descr string, units, size, used int) []gosnmp.SnmpPDU {
	return []gosnmp.SnmpPDU{
		{Name: "." + hrStorageEntry + ".2." + index, Type: gosnmp.ObjectIdentifier, Value: typeOID},
		{Name: "." + hrStorageEntry + ".3." + index, Type: gosnmp.OctetString, Value: []byte(descr)},
		{Name: "." + hrStorageEntry + ".4." + index, Type: gosnmp.Integer, Value: units},
		{Name: "." + hrStorageEntry + ".5." + index, Type: gosnmp.Integer, Value: size},
		{Name: "." + hrStorageEntry + ".6." + index, Type: gosnmp.Integer, Value: used},
	}
}

// 只取固定磁盘：内存、网络盘（NFS 等）不是本机磁盘，不参与磁盘使用率判定；
// Windows 描述带卷标与序列号，只留盘符；分配单元非法或计数为负的行无法换算，丢弃。
func TestParseHostStorageDisks_FixedDisksOnly(t *testing.T) {
	var pdus []gosnmp.SnmpPDU
	pdus = append(pdus, storageRow("1", hrStorageRAMType, "Physical memory", 1024, 8000000, 6000000)...)
	pdus = append(pdus, storageRow("31", hrStorageFixed, "/", 4096, 1000000, 500000)...)
	pdus = append(pdus, storageRow("35", hrStorageFixed[1:], `C:\ Label:System  Serial Number 5a3c9f10`, 4096, 100, 50)...)
	pdus = append(pdus, storageRow("40", hrStorageNetwork, "/mnt/nfs", 4096, 100, 50)...)
	pdus = append(pdus, storageRow("41", hrStorageFixed, "/broken-units", 0, 100, 50)...)
	pdus = append(pdus, storageRow("42", hrStorageFixed, "/overflow", 4096, -5, 50)...)
	pdus = append(pdus, storageRow("43", hrStorageFixed, "/boot", 1024, 0, 0)...)

	got := parseHostStorageDisks(pdus)
	want := []devices.DiskMetrics{
		{Mount: "/", TotalBytes: 4096 * 1000000, UsedBytes: 4096 * 500000},
		{Mount: `C:\`, TotalBytes: 4096 * 100, UsedBytes: 4096 * 50},
		{Mount: "/boot", TotalBytes: 0, UsedBytes: 0},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("disks = %+v\nwant %+v", got, want)
	}
}

func TestParseHostStorageDisks_EmptyWhenTableMissing(t *testing.T) {
	if got := parseHostStorageDisks(nil); len(got) != 0 {
		t.Fatalf("网络设备不实现 hrStorage 时应返回空，实际 %+v", got)
	}
}

func uptimeRegistry() *snmpmib.Registry {
	return &snmpmib.Registry{
		Common: snmpmib.CommonSection{
			System:        snmpmib.SystemSection{SysUptime: snmpmib.OIDDefinition{OID: "1.3.6.1.2.1.1.3.0", Method: "get"}},
			HostResources: snmpmib.HostResourcesSection{SystemUptime: snmpmib.OIDDefinition{OID: "1.3.6.1.2.1.25.1.1.0", Method: "get"}},
		},
	}
}

func timeticksPacket(oid string, ticks uint32) *gosnmp.SnmpPacket {
	return &gosnmp.SnmpPacket{Variables: []gosnmp.SnmpPDU{{Name: "." + oid, Type: gosnmp.TimeTicks, Value: ticks}}}
}

// 服务器上 sysUpTime 只是 snmpd 进程的运行时长，重启 snmpd 就清零；
// 主机真正的开机时长在 hrSystemUptime，读得到时以它为准。
func TestCollectUptime_PrefersHostUptime(t *testing.T) {
	client := &fakeCollectorSNMPClient{getPackets: map[string]*gosnmp.SnmpPacket{
		"1.3.6.1.2.1.1.3.0":    timeticksPacket("1.3.6.1.2.1.1.3.0", 600*100),
		"1.3.6.1.2.1.25.1.1.0": timeticksPacket("1.3.6.1.2.1.25.1.1.0", 5*86400*100),
	}}
	metrics := &devices.SNMPMetrics{}

	collectUptime(devices.NewSNMPCollector(nil), client, metrics, uptimeRegistry())

	if metrics.Uptime == nil || *metrics.Uptime != 5*86400 {
		t.Fatalf("uptime = %v, want %d（主机开机时长）", metrics.Uptime, 5*86400)
	}
}

// 网络设备不实现 HOST-RESOURCES-MIB，沿用 sysUpTime。
func TestCollectUptime_FallsBackToSysUptime(t *testing.T) {
	client := &fakeCollectorSNMPClient{getPackets: map[string]*gosnmp.SnmpPacket{
		"1.3.6.1.2.1.1.3.0": timeticksPacket("1.3.6.1.2.1.1.3.0", 3*86400*100),
		"1.3.6.1.2.1.25.1.1.0": {Variables: []gosnmp.SnmpPDU{
			{Name: ".1.3.6.1.2.1.25.1.1.0", Type: gosnmp.NoSuchObject, Value: nil},
		}},
	}}
	metrics := &devices.SNMPMetrics{}

	collectUptime(devices.NewSNMPCollector(nil), client, metrics, uptimeRegistry())

	if metrics.Uptime == nil || *metrics.Uptime != 3*86400 {
		t.Fatalf("uptime = %v, want %d（sysUpTime）", metrics.Uptime, 3*86400)
	}
}

func hostMemoryCandidate() []snmpmib.MetricCandidate {
	return []snmpmib.MetricCandidate{{
		ID:       "host_resources_storage",
		Method:   "composite",
		OIDs:     []string{"1.3.6.1.2.1.25.2.3.1.3", "1.3.6.1.2.1.25.2.3.1.4", "1.3.6.1.2.1.25.2.3.1.5", "1.3.6.1.2.1.25.2.3.1.6"},
		Strategy: "host_resources_ram_storage",
	}}
}

func descrPDU(index string, descr string) gosnmp.SnmpPDU {
	return gosnmp.SnmpPDU{Name: ".1.3.6.1.2.1.25.2.3.1.3." + index, Type: gosnmp.OctetString, Value: []byte(descr)}
}

func intValuesPacket(values ...int) *gosnmp.SnmpPacket {
	vars := make([]gosnmp.SnmpPDU, 0, len(values))
	for _, v := range values {
		vars = append(vars, gosnmp.SnmpPDU{Type: gosnmp.Integer, Value: v})
	}
	return &gosnmp.SnmpPacket{Variables: vars}
}

// Linux net-snmp 的 Physical memory 已用量包含 buffers 与 page cache，
// 不扣除的话每台 Linux 服务器都会显示 90% 以上并误报。
func TestCollectMemory_HostResourcesExcludesBuffersAndCache(t *testing.T) {
	client := &fakeCollectorSNMPClient{
		bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
			"1.3.6.1.2.1.25.2.3.1.3": {
				descrPDU("1", "Physical memory"),
				descrPDU("3", "Virtual memory"),
				descrPDU("6", "Memory buffers"),
				descrPDU("7", "Cached memory"),
				descrPDU("31", "/"),
			},
		},
		getPackets: map[string]*gosnmp.SnmpPacket{
			// RAM 行：分配单元 1024，容量 8,000,000，已用 7,000,000
			"1.3.6.1.2.1.25.2.3.1.4.1,1.3.6.1.2.1.25.2.3.1.5.1,1.3.6.1.2.1.25.2.3.1.6.1": intValuesPacket(1024, 8000000, 7000000),
			// buffers / cached 行：分配单元与已用
			"1.3.6.1.2.1.25.2.3.1.4.6,1.3.6.1.2.1.25.2.3.1.6.6,1.3.6.1.2.1.25.2.3.1.4.7,1.3.6.1.2.1.25.2.3.1.6.7": intValuesPacket(1024, 500000, 1024, 3500000),
		},
	}

	usage, total, used := collectMemoryFromCandidates(client, hostMemoryCandidate(), nil)

	if usage == nil || total == nil || used == nil {
		t.Fatalf("usage/total/used 不应为空: %v %v %v", usage, total, used)
	}
	if *usage != 37.5 {
		t.Fatalf("usage = %v, want 37.5（(7,000,000-500,000-3,500,000)/8,000,000）", *usage)
	}
	if *used != 3000000*1024 || *total != 8000000*1024 {
		t.Fatalf("used/total = %d/%d, want %d/%d", *used, *total, 3000000*1024, 8000000*1024)
	}
}

// Windows 没有 buffers / cached 行，按 RAM 行原值计算。
func TestCollectMemory_HostResourcesWithoutCacheRows(t *testing.T) {
	client := &fakeCollectorSNMPClient{
		bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
			"1.3.6.1.2.1.25.2.3.1.3": {descrPDU("1", `C:\ Label:System`), descrPDU("4", "Physical Memory")},
		},
		getPackets: map[string]*gosnmp.SnmpPacket{
			"1.3.6.1.2.1.25.2.3.1.4.4,1.3.6.1.2.1.25.2.3.1.5.4,1.3.6.1.2.1.25.2.3.1.6.4": intValuesPacket(65536, 1000, 250),
		},
	}

	usage, _, _ := collectMemoryFromCandidates(client, hostMemoryCandidate(), nil)

	if usage == nil || *usage != 25 {
		t.Fatalf("usage = %v, want 25", usage)
	}
}

// RAM 行按描述识别时优先精确的 Physical/Real memory：Windows 的盘符行排在
// 内存行之前，卷标里的 "Programs" 含子串 "ram"，宽松匹配会把磁盘当成内存。
func TestCollectMemory_HostResourcesPrefersExactPhysicalMemoryRow(t *testing.T) {
	client := &fakeCollectorSNMPClient{
		bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
			"1.3.6.1.2.1.25.2.3.1.3": {descrPDU("2", `D:\ Label:Programs`), descrPDU("5", "Physical Memory")},
		},
		getPackets: map[string]*gosnmp.SnmpPacket{
			"1.3.6.1.2.1.25.2.3.1.4.2,1.3.6.1.2.1.25.2.3.1.5.2,1.3.6.1.2.1.25.2.3.1.6.2": intValuesPacket(4096, 1000, 990),
			"1.3.6.1.2.1.25.2.3.1.4.5,1.3.6.1.2.1.25.2.3.1.5.5,1.3.6.1.2.1.25.2.3.1.6.5": intValuesPacket(65536, 1000, 400),
		},
	}

	usage, _, _ := collectMemoryFromCandidates(client, hostMemoryCandidate(), nil)

	if usage == nil || *usage != 40 {
		t.Fatalf("usage = %v, want 40（应取 Physical Memory 行而非 D: 盘）", usage)
	}
}
