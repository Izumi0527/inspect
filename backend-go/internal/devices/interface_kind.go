package devices

import "strings"

// logicalInterfacePrefixes 按 ifDescr 前缀（小写）识别逻辑接口：
// 华为 Vlanif/LoopBack/NULL/Console/Eth-Trunk/Tunnel/Vbdif/Vsi、H3C Vlan-interface/
// Bridge-Aggregation/Route-Aggregation、Cisco Vlan/Loopback/Null/Port-channel 等。
// 链路聚合口（Eth-Trunk 等）虽承载流量，但其流量已体现在成员物理口上，同样视为逻辑口。
var logicalInterfacePrefixes = []string{
	"vlanif", "vlan-interface", "vlan",
	"loopback", "inloopback", "lo",
	"null",
	"console", "aux",
	"eth-trunk", "bridge-aggregation", "route-aggregation", "port-channel",
	"tunnel", "virtual-template", "dialer", "vbdif", "vsi",
}

// IsLogicalInterface 判断接口（按 ifDescr 名）是否为逻辑口。
// 无法判定的名字（含采集内部名 if<idx>、空串）一律按物理口处理，避免误删业务口。
func IsLogicalInterface(descr string) bool {
	name := strings.ToLower(strings.TrimSpace(descr))
	if name == "" {
		return false
	}
	for _, prefix := range logicalInterfacePrefixes {
		if !strings.HasPrefix(name, prefix) {
			continue
		}
		rest := name[len(prefix):]
		// 前缀后必须是编号/分隔符或结尾，避免 "lo" 命中 "lo..." 之外的物理口命名（如 "long..."）
		if rest == "" || rest[0] == '-' || rest[0] == '/' || rest[0] == ' ' || (rest[0] >= '0' && rest[0] <= '9') {
			return true
		}
	}
	return false
}
