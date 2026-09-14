package dashboard_test

import (
	"testing"

	"github.com/your-org/inspect-system/backend-go/internal/dashboard"
)

func topologyFixtureDevices() []dashboard.TopologyDevice {
	return []dashboard.TopologyDevice{
		{ID: 1, Name: "core", IP: "10.0.0.1", MAC: "00-11-22-33-44-55", DeviceType: "switch", DetectedType: "router", Vendor: "huawei", Model: "S12700", FirmwareVersion: "V200R019", Status: "online"},
		{ID: 2, Name: "acc-1", IP: "10.0.0.2", DeviceType: "switch", Status: "online"},
		{ID: 3, Name: "边界防火墙", Hostname: "FW-1", IP: "10.0.0.3", DeviceType: "firewall", Status: "offline"},
	}
}

// TestBuildNetworkTopology_ResolvesPeersAndMergesBidirectionalLinks
// 对端按「管理 IP → sysName/hostname（忽略大小写）→ 机箱 MAC（归一化）」三级匹配；
// 两侧互见的邻居合并为一条 bidirectional 链路；未匹配的邻居只计数不入图。
func TestBuildNetworkTopology_ResolvesPeersAndMergesBidirectionalLinks(t *testing.T) {
	neighbors := []dashboard.TopologyNeighbor{
		// A 看见 B：靠管理 IP
		{DeviceID: 1, LocalPort: "GigabitEthernet0/0/1", RemoteChassisID: "aa:bb:cc:dd:ee:01", RemotePortID: "GigabitEthernet0/0/24", RemoteMgmtIP: "10.0.0.2"},
		// B 看见 A：只有 sysName
		{DeviceID: 2, LocalPort: "GigabitEthernet0/0/24", RemoteChassisID: "00:11:22:33:44:55", RemotePortID: "GigabitEthernet0/0/1", RemoteSysName: "core"},
		// A 看见 C：sysName 与 hostname 大小写不同
		{DeviceID: 1, LocalPort: "GigabitEthernet0/0/2", RemoteChassisID: "aa:bb:cc:dd:ee:03", RemotePortID: "eth1", RemoteSysName: "fw-1"},
		// C 看见 A：只有机箱 MAC（台账里是连字符大写形式）
		{DeviceID: 3, LocalPort: "eth1", RemoteChassisID: "00:11:22:33:44:55", RemotePortID: "GigabitEthernet0/0/2"},
		// B 看见未纳管设备
		{DeviceID: 2, LocalPort: "GigabitEthernet0/0/5", RemoteChassisID: "de:ad:be:ef:00:01", RemoteSysName: "ip-phone"},
	}

	got := dashboard.BuildNetworkTopology(topologyFixtureDevices(), neighbors)

	if len(got.Nodes) != 3 {
		t.Fatalf("nodes = %d, want 3: %+v", len(got.Nodes), got.Nodes)
	}
	if got.Nodes[0].ID != 1 || got.Nodes[1].ID != 2 || got.Nodes[2].ID != 3 {
		t.Fatalf("nodes 应按 ID 升序: %+v", got.Nodes)
	}
	if got.Nodes[0].DetectedType != "router" || got.Nodes[0].DeviceType != "switch" {
		t.Fatalf("节点应同时携带档案类型与识别类型: %+v", got.Nodes[0])
	}
	if got.Nodes[0].Model != "S12700" || got.Nodes[0].FirmwareVersion != "V200R019" {
		t.Fatalf("节点应携带型号与版本: %+v", got.Nodes[0])
	}
	if got.Nodes[1].UnmanagedNeighbors != 1 {
		t.Fatalf("acc-1 未纳管邻居数 = %d, want 1", got.Nodes[1].UnmanagedNeighbors)
	}

	if len(got.Links) != 2 {
		t.Fatalf("links = %d, want 2: %+v", len(got.Links), got.Links)
	}
	ab := got.Links[0]
	if ab.Source != 1 || ab.Target != 2 || !ab.Bidirectional {
		t.Fatalf("A-B 链路 = %+v", ab)
	}
	if ab.SourcePort != "GigabitEthernet0/0/1" || ab.TargetPort != "GigabitEthernet0/0/24" {
		t.Fatalf("A-B 端口 = %q ↔ %q", ab.SourcePort, ab.TargetPort)
	}
	ac := got.Links[1]
	if ac.Source != 1 || ac.Target != 3 || !ac.Bidirectional {
		t.Fatalf("A-C 链路 = %+v", ac)
	}
	if ac.SourcePort != "GigabitEthernet0/0/2" || ac.TargetPort != "eth1" {
		t.Fatalf("A-C 端口 = %q ↔ %q", ac.SourcePort, ac.TargetPort)
	}
}

// TestBuildNetworkTopology_OneSidedLinkAndSelfLoop 只有一侧看见对端时链路保留但标记
// 非双向、对端端口留空；设备看见自己（LLDP 环回/堆叠）忽略。
func TestBuildNetworkTopology_OneSidedLinkAndSelfLoop(t *testing.T) {
	neighbors := []dashboard.TopologyNeighbor{
		{DeviceID: 1, LocalPort: "GigabitEthernet0/0/1", RemoteChassisID: "x", RemotePortID: "GigabitEthernet0/0/24", RemoteMgmtIP: "10.0.0.2"},
		{DeviceID: 1, LocalPort: "GigabitEthernet0/0/9", RemoteChassisID: "y", RemoteMgmtIP: "10.0.0.1"},
	}

	got := dashboard.BuildNetworkTopology(topologyFixtureDevices(), neighbors)

	if len(got.Links) != 1 {
		t.Fatalf("links = %d, want 1: %+v", len(got.Links), got.Links)
	}
	link := got.Links[0]
	if link.Bidirectional {
		t.Fatalf("单侧可见的链路不应标记双向: %+v", link)
	}
	if link.SourcePort != "GigabitEthernet0/0/1" || link.TargetPort != "GigabitEthernet0/0/24" {
		t.Fatalf("单侧链路应保留本端口与对端宣告的端口: %+v", link)
	}
	if got.Nodes[0].UnmanagedNeighbors != 0 {
		t.Fatalf("自环不应计入未纳管邻居: %+v", got.Nodes[0])
	}
}

// TestBuildNetworkTopology_NoNeighborsStillListsAllNodes 没有任何 LLDP 数据时节点仍全部出现——
// 这正是修复「多台设备只显示一个图标」的最低保证。
func TestBuildNetworkTopology_NoNeighborsStillListsAllNodes(t *testing.T) {
	got := dashboard.BuildNetworkTopology(topologyFixtureDevices(), nil)
	if len(got.Nodes) != 3 || len(got.Links) != 0 {
		t.Fatalf("nodes=%d links=%d", len(got.Nodes), len(got.Links))
	}
	if got.Links == nil {
		t.Fatalf("Links 应为非 nil 空切片，JSON 才会输出 [] 而非 null")
	}
}
