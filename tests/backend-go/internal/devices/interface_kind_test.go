package devices_test

import (
	"testing"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
)

// 逻辑口按 ifDescr 前缀判定（华为/H3C/Cisco 常见命名），物理口与无法判定的名字都按物理口处理。
func TestIsLogicalInterface(t *testing.T) {
	logical := []string{
		"Vlanif1", "vlanif100", "Vlan-interface10", "Vlan20",
		"LoopBack0", "InLoopBack0", "Loopback1", "lo",
		"NULL0", "Null0",
		"Console9/0/0", "Aux0/0/1",
		"Eth-Trunk1", "Bridge-Aggregation2", "Route-Aggregation3", "Port-channel4",
		"Tunnel0/0/1", "Virtual-Template0", "Dialer1", "Vbdif10", "Vsi1",
	}
	for _, name := range logical {
		if !devices.IsLogicalInterface(name) {
			t.Errorf("IsLogicalInterface(%q) = false, want true", name)
		}
	}

	physical := []string{
		"GigabitEthernet0/0/1", "GE0/0/2", "XGigabitEthernet0/0/1", "Ten-GigabitEthernet1/0/1",
		"MEth0/0/1", "Ethernet0/0/1", "FastEthernet0/1", "40GE1/0/1", "100GE1/0/1",
		"if6", "",
	}
	for _, name := range physical {
		if devices.IsLogicalInterface(name) {
			t.Errorf("IsLogicalInterface(%q) = true, want false", name)
		}
	}
}

// 巡检统计与报告中应忽略的非业务逻辑端口（NULL0、Console、LoopBack 等），而业务逻辑口（Vlanif、Eth-Trunk）与物理口保留。
func TestIsIgnoredInspectionInterface(t *testing.T) {
	ignored := []string{
		"NULL0", "Null0",
		"Console9/0/0", "Aux0/0/1",
		"InLoopBack0", "LoopBack0", "Loopback1", "lo",
	}
	for _, name := range ignored {
		if !devices.IsIgnoredInspectionInterface(name) {
			t.Errorf("IsIgnoredInspectionInterface(%q) = false, want true", name)
		}
	}

	retained := []string{
		"Vlanif1", "vlanif100", "Vlan-interface10", "Vlan20",
		"Eth-Trunk1", "Bridge-Aggregation2", "Route-Aggregation3", "Port-channel4",
		"GigabitEthernet0/0/1", "MEth0/0/1",
	}
	for _, name := range retained {
		if devices.IsIgnoredInspectionInterface(name) {
			t.Errorf("IsIgnoredInspectionInterface(%q) = true, want false", name)
		}
	}
}

func TestIsNonPhysicalInterface(t *testing.T) {
	nonPhysical := []string{
		"InLoopBack0", "LoopBack0", "lo", "lo0",
		"NULL0", "Null0",
		"Vlanif1", "Vlan-interface10", "Vlan20",
		"MEth0/0/1", "M-GigabitEthernet0/0/0", "M-Ethernet0/0/1", "M-Eth0", "Mgmt0", "Management0/0",
		"Eth-Trunk1", "Bridge-Aggregation2", "Route-Aggregation3", "Port-channel4",
		"Stack-Port0/1", "Css-Port1/1",
		"Console9/0/0", "Aux0/0/1",
		"Tunnel0/0/1", "Virtual-Template0", "Dialer1", "Vbdif10", "Vsi1",
		"BVI10", "IRB100", "Nve1", "Bridge-if1", "Cellular0/0/0", "Async1", "Serial0/0/0",
		"GigabitEthernet0/0/1.100", "Eth-Trunk1.20", "2.5GE0/0/1.10",
	}
	for _, name := range nonPhysical {
		if !devices.IsNonPhysicalInterface(name) {
			t.Errorf("IsNonPhysicalInterface(%q) = false, want true", name)
		}
	}

	physicalOrUnknown := []string{
		"GigabitEthernet0/0/1", "GE0/0/2", "XGigabitEthernet0/0/1", "Ten-GigabitEthernet1/0/1",
		"2.5GE0/0/1", "10GE1/0/1", "25GE1/0/1", "40GE1/0/1", "100GE1/0/1",
		"Ethernet0/0/1", "FastEthernet0/1",
		"if10", "  ", "",
	}
	for _, name := range physicalOrUnknown {
		if devices.IsNonPhysicalInterface(name) {
			t.Errorf("IsNonPhysicalInterface(%q) = true, want false", name)
		}
	}
}
