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

// ignoredInspectionInterfacePrefixes 识别巡检统计与报告中应直接剔除的内部/控制口前缀：
// 黑洞口（NULL0）、环回口（LoopBack0/InLoopBack0/lo）、串口控制台（Console9/0/0/Aux）。
// Vlanif、Eth-Trunk 等业务逻辑接口不在此列，保留在巡检统计与报告中。
var ignoredInspectionInterfacePrefixes = []string{
	"loopback", "inloopback", "lo",
	"null",
	"console", "aux",
}

func hasInterfacePrefix(descr string, prefixes []string) bool {
	name := strings.ToLower(strings.TrimSpace(descr))
	if name == "" {
		return false
	}
	for _, prefix := range prefixes {
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

// IsLogicalInterface 判断接口（按 ifDescr 名）是否为逻辑口。
// 无法判定的名字（含采集内部名 if<idx>、空串）一律按物理口处理，避免误删业务口。
func IsLogicalInterface(descr string) bool {
	return hasInterfacePrefix(descr, logicalInterfacePrefixes)
}

// IsIgnoredInspectionInterface 判断接口是否属于不纳入巡检报告统计的非业务逻辑端口。
func IsIgnoredInspectionInterface(descr string) bool {
	return hasInterfacePrefix(descr, ignoredInspectionInterfacePrefixes)
}
