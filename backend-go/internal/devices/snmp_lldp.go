package devices

import (
	"fmt"
	"net"
	"sort"
	"strconv"
	"strings"

	"github.com/gosnmp/gosnmp"
	"github.com/your-org/inspect-system/backend-go/internal/snmpmib"
)

// NeighborMetrics 保存一条 LLDP 邻居记录：本设备某端口看到的对端设备/端口。
//
// 对端设备与台账的匹配（管理 IP / 系统名 / 机箱 MAC）放在查询时做，这里只保留原始字段，
// 设备改 IP 或改名后下一次查询自动纠正，不留陈旧关联。
type NeighborMetrics struct {
	LocalPortNum     int    `json:"local_port_num"`
	LocalPortID      string `json:"local_port_id,omitempty"`
	LocalPortDesc    string `json:"local_port_desc,omitempty"`
	RemoteChassisID  string `json:"remote_chassis_id"`
	RemotePortID     string `json:"remote_port_id,omitempty"`
	RemotePortDesc   string `json:"remote_port_desc,omitempty"`
	RemoteSysName    string `json:"remote_sys_name,omitempty"`
	RemoteSysDesc    string `json:"remote_sys_desc,omitempty"`
	RemoteMgmtIP     string `json:"remote_mgmt_ip,omitempty"`
	RemoteCapEnabled string `json:"remote_cap_enabled,omitempty"`
}

// LLDP-MIB LldpChassisIdSubtype / LldpPortIdSubtype 取值
const (
	lldpChassisSubtypeMAC     = 4
	lldpChassisSubtypeNetAddr = 5
	lldpPortSubtypeMAC        = 3
	lldpPortSubtypeNetAddr    = 4
)

// lldpRemManAddrTable 索引中管理地址的子类型（LldpManAddrSubtype / IANA AddressFamily）
const (
	lldpManAddrSubtypeIPv4 = 1
	lldpManAddrSubtypeIPv6 = 2
)

// LLDPStatus 是一轮采集对设备 LLDP 可用性的判定，回填 devices.lldp_status 供总览提示精确原因。
type LLDPStatus string

const (
	// LLDPStatusUnknown 本轮没拿到足够证据（SNMP 超时、探针无应答且邻居表为空），写入端不动旧邻居也不更新状态。
	LLDPStatusUnknown LLDPStatus = ""
	// LLDPStatusOK LLDP-MIB 可读，邻居列表（含空）可信。
	LLDPStatusOK LLDPStatus = "ok"
	// LLDPStatusMIBUnreachable 1.0.8802 子树不可读：SNMP 视图未放行（华为缺省 ViewDefault 只含 internet）或设备不支持。
	LLDPStatusMIBUnreachable LLDPStatus = "mib_unreachable"
	// LLDPStatusDisabled 设备全局未启用 LLDP（华为 hwLldpEnable=2）。
	LLDPStatusDisabled LLDPStatus = "disabled"
)

// LLDPCollection 是 LLDP 采集结果：状态、本机机箱 ID 与邻居列表（仅 Status==ok 时非 nil）。
type LLDPCollection struct {
	Status         LLDPStatus
	LocalChassisID string
	Neighbors      []NeighborMetrics
}

// 华为 hwLldpEnable 取值
const hwLLDPEnableDisabled = 2

// collectLLDP 先排除「设备未启用」与「MIB 不可读」两种不可区分于空表的情况，再采集邻居表。
//
// 判定顺序：厂商全局开关（缺省视图内可读）=2 → disabled；lldpLocChassisId 探针返回
// NoSuchObject/NoSuchInstance → mib_unreachable；探针有值或邻居表有行 → ok；否则 unknown。
// 只有 ok 才产出邻居快照（空切片也算），写入端据此决定是否清空旧邻居。
func collectLLDP(client snmpClient, lldp snmpmib.LLDPSection, vendorEnableOID string) LLDPCollection {
	if value, ok := getIntScalar(client, vendorEnableOID); ok && value == hwLLDPEnableDisabled {
		return LLDPCollection{Status: LLDPStatusDisabled}
	}

	localChassisID, probe := probeLocalChassis(client, lldp)
	if probe == lldpProbeUnreachable {
		return LLDPCollection{Status: LLDPStatusMIBUnreachable}
	}

	neighbors, walked := collectLLDPNeighbors(client, lldp)
	if !walked || (len(neighbors) == 0 && probe != lldpProbeReadable) {
		return LLDPCollection{Status: LLDPStatusUnknown, LocalChassisID: localChassisID}
	}
	return LLDPCollection{Status: LLDPStatusOK, LocalChassisID: localChassisID, Neighbors: neighbors}
}

type lldpProbeResult int

const (
	lldpProbeUnknown lldpProbeResult = iota
	lldpProbeReadable
	lldpProbeUnreachable
)

// probeLocalChassis 一包 GET lldpLocChassisIdSubtype.0 + lldpLocChassisId.0：
// 任一列有值即 MIB 可读并返回格式化机箱 ID；全部 NoSuchObject/NoSuchInstance 即子树不可读；
// GET 出错或空应答无法下结论。
func probeLocalChassis(client snmpClient, lldp snmpmib.LLDPSection) (string, lldpProbeResult) {
	subtypeOID := strings.TrimSpace(lldp.LocChassisIDSubtype.OID)
	chassisOID := strings.TrimSpace(lldp.LocChassisID.OID)
	if chassisOID == "" {
		return "", lldpProbeUnknown
	}
	oids := []string{chassisOID}
	if subtypeOID != "" {
		oids = []string{subtypeOID, chassisOID}
	}
	packet, err := client.Get(oids)
	if err != nil || packet == nil || len(packet.Variables) == 0 {
		return "", lldpProbeUnknown
	}

	subtype := 0
	var chassis interface{}
	readable := false
	for _, pdu := range packet.Variables {
		if isNoSuchPDU(pdu) {
			continue
		}
		readable = true
		switch snmpmib.NormalizeOID(pdu.Name) {
		case subtypeOID:
			if value, ok := numericPDUInt64(pdu); ok {
				subtype = int(value)
			}
		case chassisOID:
			chassis = pdu.Value
		}
	}
	if !readable {
		return "", lldpProbeUnreachable
	}
	if chassis == nil {
		return "", lldpProbeReadable
	}
	return formatLLDPIdentifier(subtype, chassis, lldpChassisSubtypeMAC, lldpChassisSubtypeNetAddr), lldpProbeReadable
}

func isNoSuchPDU(pdu gosnmp.SnmpPDU) bool {
	return pdu.Type == gosnmp.NoSuchObject || pdu.Type == gosnmp.NoSuchInstance || pdu.Type == gosnmp.EndOfMibView
}

// getIntScalar GET 单个整数标量；OID 为空、出错或非数值返回 ok=false。
func getIntScalar(client snmpClient, oid string) (int64, bool) {
	oid = strings.TrimSpace(oid)
	if oid == "" {
		return 0, false
	}
	packet, err := client.Get([]string{oid})
	if err != nil || packet == nil || len(packet.Variables) == 0 || isNoSuchPDU(packet.Variables[0]) {
		return 0, false
	}
	return numericPDUInt64(packet.Variables[0])
}

// collectLLDPNeighbors 采集 lldpRemTable 与 lldpRemManAddrTable，按
// TimeMark.LocalPortNum.RemIndex 三段索引合并各列，返回按本端口号排序的邻居列表。
//
// 第二个返回值表示主表（lldpRemSysName）walk 是否成功；walk 成功但零行返回 (空切片,true)。
// 零行本身不能证明表可读（视图拒绝时同样零行且无错误），可读性由 collectLLDP 的探针判定。
func collectLLDPNeighbors(client snmpClient, lldp snmpmib.LLDPSection) ([]NeighborMetrics, bool) {
	baseOID := strings.TrimSpace(lldp.RemSysName.OID)
	if baseOID == "" {
		return nil, false
	}
	nameRows, err := client.BulkWalkAll(baseOID)
	if err != nil {
		return nil, false
	}

	neighbors := make(map[string]*NeighborMetrics)
	order := make([]string, 0)
	ensure := func(index string) *NeighborMetrics {
		if item, ok := neighbors[index]; ok {
			return item
		}
		item := &NeighborMetrics{LocalPortNum: lldpLocalPortFromIndex(index)}
		neighbors[index] = item
		order = append(order, index)
		return item
	}

	for _, pdu := range nameRows {
		index := extractOIDIndexSuffix(pdu.Name, baseOID)
		if index == "" {
			continue
		}
		ensure(index).RemoteSysName = formatSNMPValue(pdu.Value)
	}

	chassisSubtypes := walkLLDPIntColumn(client, lldp.RemChassisIDSubtype.OID)
	portSubtypes := walkLLDPIntColumn(client, lldp.RemPortIDSubtype.OID)

	walkLLDPColumn(client, lldp.RemChassisID.OID, func(index string, pdu gosnmp.SnmpPDU) {
		ensure(index).RemoteChassisID = formatLLDPIdentifier(chassisSubtypes[index], pdu.Value, lldpChassisSubtypeMAC, lldpChassisSubtypeNetAddr)
	})
	walkLLDPColumn(client, lldp.RemPortID.OID, func(index string, pdu gosnmp.SnmpPDU) {
		ensure(index).RemotePortID = formatLLDPIdentifier(portSubtypes[index], pdu.Value, lldpPortSubtypeMAC, lldpPortSubtypeNetAddr)
	})
	walkLLDPColumn(client, lldp.RemPortDesc.OID, func(index string, pdu gosnmp.SnmpPDU) {
		ensure(index).RemotePortDesc = formatSNMPValue(pdu.Value)
	})
	walkLLDPColumn(client, lldp.RemSysDesc.OID, func(index string, pdu gosnmp.SnmpPDU) {
		ensure(index).RemoteSysDesc = formatSNMPValue(pdu.Value)
	})
	walkLLDPColumn(client, lldp.RemSysCapEnabled.OID, func(index string, pdu gosnmp.SnmpPDU) {
		if raw, ok := pdu.Value.([]byte); ok {
			ensure(index).RemoteCapEnabled = lldpCapsLabel(raw)
		}
	})

	// 管理地址表的索引是 TimeMark.LocalPort.RemIndex.AddrSubtype.AddrLen.Addr...，
	// 前三段对应邻居，地址在索引尾部；值列本身（IfSubtype）用不上。
	if manOID := strings.TrimSpace(lldp.RemManAddrIfSubtype.OID); manOID != "" {
		rows, _ := client.BulkWalkAll(manOID)
		for _, pdu := range rows {
			neighborIndex, ip := parseLLDPManAddrIndex(extractOIDIndexSuffix(pdu.Name, manOID))
			if neighborIndex == "" || ip == "" {
				continue
			}
			if item, ok := neighbors[neighborIndex]; ok && item.RemoteMgmtIP == "" {
				item.RemoteMgmtIP = ip
			}
		}
	}

	localPortIDs := walkLLDPStringColumn(client, lldp.LocPortID.OID)
	localPortDescs := walkLLDPStringColumn(client, lldp.LocPortDesc.OID)
	for _, item := range neighbors {
		key := strconv.Itoa(item.LocalPortNum)
		item.LocalPortID = localPortIDs[key]
		item.LocalPortDesc = localPortDescs[key]
	}

	result := make([]NeighborMetrics, 0, len(order))
	for _, index := range order {
		result = append(result, *neighbors[index])
	}
	sort.SliceStable(result, func(i, j int) bool {
		if result[i].LocalPortNum != result[j].LocalPortNum {
			return result[i].LocalPortNum < result[j].LocalPortNum
		}
		return result[i].RemoteChassisID < result[j].RemoteChassisID
	})
	return result, true
}

func walkLLDPColumn(client snmpClient, oid string, apply func(index string, pdu gosnmp.SnmpPDU)) {
	oid = strings.TrimSpace(oid)
	if oid == "" {
		return
	}
	rows, err := client.BulkWalkAll(oid)
	if err != nil {
		return
	}
	for _, pdu := range rows {
		index := extractOIDIndexSuffix(pdu.Name, oid)
		if index == "" {
			continue
		}
		apply(index, pdu)
	}
}

func walkLLDPIntColumn(client snmpClient, oid string) map[string]int {
	values := make(map[string]int)
	walkLLDPColumn(client, oid, func(index string, pdu gosnmp.SnmpPDU) {
		if value, ok := numericPDUInt64(pdu); ok {
			values[index] = int(value)
		}
	})
	return values
}

func walkLLDPStringColumn(client snmpClient, oid string) map[string]string {
	values := make(map[string]string)
	walkLLDPColumn(client, oid, func(index string, pdu gosnmp.SnmpPDU) {
		if text := formatSNMPValue(pdu.Value); text != "" {
			values[index] = text
		}
	})
	return values
}

// lldpLocalPortFromIndex 从 TimeMark.LocalPortNum.RemIndex 取本端口号。
func lldpLocalPortFromIndex(index string) int {
	parts := strings.Split(index, ".")
	if len(parts) < 2 {
		return 0
	}
	port, _ := strconv.Atoi(parts[1])
	return port
}

// parseLLDPManAddrIndex 解析 lldpRemManAddrTable 索引，返回邻居三段索引与管理 IP。
// 索引形态：TimeMark.LocalPort.RemIndex.AddrSubtype.AddrLen.Addr1...AddrN
func parseLLDPManAddrIndex(index string) (string, string) {
	parts := strings.Split(index, ".")
	if len(parts) < 6 {
		return "", ""
	}
	neighborIndex := strings.Join(parts[:3], ".")
	subtype, _ := strconv.Atoi(parts[3])
	length, _ := strconv.Atoi(parts[4])
	octets := parts[5:]
	if length <= 0 || len(octets) < length {
		return neighborIndex, ""
	}
	octets = octets[:length]

	switch {
	case subtype == lldpManAddrSubtypeIPv4 && length == 4:
		return neighborIndex, strings.Join(octets, ".")
	case subtype == lldpManAddrSubtypeIPv6 && length == 16:
		raw := make(net.IP, 0, 16)
		for _, part := range octets {
			value, err := strconv.Atoi(part)
			if err != nil || value < 0 || value > 255 {
				return neighborIndex, ""
			}
			raw = append(raw, byte(value))
		}
		return neighborIndex, raw.String()
	}
	return neighborIndex, ""
}

// formatLLDPIdentifier 按子类型格式化机箱 ID / 端口 ID：MAC 子类型转小写冒号十六进制，
// 网络地址子类型转 IP，其余按可打印字符串处理。不能直接用 formatSNMPValue——它会
// 丢弃 MAC 字节里的不可打印字符，导致机箱 ID 残缺甚至为空。
func formatLLDPIdentifier(subtype int, value interface{}, macSubtype int, netAddrSubtype int) string {
	raw, isBytes := value.([]byte)
	switch {
	case isBytes && subtype == macSubtype && len(raw) == 6:
		return formatMACBytes(raw)
	case isBytes && subtype == netAddrSubtype && len(raw) >= 1:
		// 首字节是地址族（1=IPv4, 2=IPv6），其后是地址
		family := int(raw[0])
		body := raw[1:]
		if family == lldpManAddrSubtypeIPv4 && len(body) == 4 || family == lldpManAddrSubtypeIPv6 && len(body) == 16 {
			return net.IP(body).String()
		}
	}
	text := formatSNMPValue(value)
	if text == "" && isBytes && len(raw) > 0 {
		// 非 MAC 子类型但内容不可打印（个别厂商把 MAC 报成 local 子类型）：退回十六进制
		return formatMACBytes(raw)
	}
	return text
}

func formatMACBytes(raw []byte) string {
	parts := make([]string, 0, len(raw))
	for _, b := range raw {
		parts = append(parts, fmt.Sprintf("%02x", b))
	}
	return strings.Join(parts, ":")
}

// lldpCapsLabel 把 LldpSystemCapabilitiesMap BITS 转成可读能力串（逗号分隔）。
func lldpCapsLabel(raw []byte) string {
	if len(raw) == 0 {
		return ""
	}
	caps := raw[0]
	labels := make([]string, 0, 4)
	if caps&lldpCapBridge != 0 {
		labels = append(labels, "bridge")
	}
	if caps&lldpCapRouter != 0 {
		labels = append(labels, "router")
	}
	if caps&lldpCapWLANAP != 0 {
		labels = append(labels, "ap")
	}
	if caps&0x04 != 0 {
		labels = append(labels, "telephone")
	}
	if caps&0x01 != 0 {
		labels = append(labels, "station")
	}
	return strings.Join(labels, ",")
}
