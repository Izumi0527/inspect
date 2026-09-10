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
