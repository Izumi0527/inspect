package dashboard

import (
	"context"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"
)

// TopologyDevice 是拓扑组装的设备输入（devices 表投影）。
type TopologyDevice struct {
	ID              int
	Name            string
	Hostname        string
	IP              string
	MAC             string
	DeviceType      string
	DetectedType    string
	Vendor          string
	Model           string
	FirmwareVersion string
	Status          string
}

// TopologyNeighbor 是拓扑组装的邻居输入（device_neighbors 表投影）。
type TopologyNeighbor struct {
	DeviceID        int
	LocalPort       string
	RemoteChassisID string
	RemotePortID    string
	RemoteSysName   string
	RemoteMgmtIP    string
}

// halfLink 是单侧视角的链路：src 在 srcPort 上看见 dst，并声称对端端口是 claimedPort。
type halfLink struct {
	src         int
	srcPort     string
	dst         int
	claimedPort string
}

// BuildNetworkTopology 把台账设备与 LLDP 邻居行组装成拓扑：
//   - 对端按「管理 IP → sysName/hostname（忽略大小写）→ 机箱 MAC（归一化）」三级匹配台账；
//   - 两侧互见的邻居合并为一条 Bidirectional 链路，端口以各自本端上报为准；
//   - 只有一侧看见时保留为单向链路，对端端口取该侧宣告值；
//   - 未匹配到台账的邻居只计入 UnmanagedNeighbors，不入图；自环忽略。
//
// 匹配放在查询时而不是写入时：设备改 IP/改名后下一次查询即自动纠正，不留陈旧外键。
func BuildNetworkTopology(devices []TopologyDevice, neighbors []TopologyNeighbor) NetworkTopology {
	nodes := make([]TopologyNode, 0, len(devices))
	nodeIndex := make(map[int]int, len(devices))
	byIP := make(map[string]int, len(devices))
	byName := make(map[string]int, len(devices)*2)
	byMAC := make(map[string]int, len(devices))

	sorted := append([]TopologyDevice(nil), devices...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].ID < sorted[j].ID })

	for _, d := range sorted {
		nodeIndex[d.ID] = len(nodes)
		nodes = append(nodes, TopologyNode{
			ID:              d.ID,
			Name:            strings.TrimSpace(d.Name),
			IP:              strings.TrimSpace(d.IP),
			DeviceType:      strings.TrimSpace(d.DeviceType),
			DetectedType:    strings.TrimSpace(d.DetectedType),
			Vendor:          strings.TrimSpace(d.Vendor),
			Model:           strings.TrimSpace(d.Model),
			FirmwareVersion: strings.TrimSpace(d.FirmwareVersion),
			Status:          strings.ToLower(strings.TrimSpace(d.Status)),
		})
		if ip := strings.TrimSpace(d.IP); ip != "" {
			byIP[ip] = d.ID
		}
		if name := strings.ToLower(strings.TrimSpace(d.Name)); name != "" {
			byName[name] = d.ID
		}
		if host := strings.ToLower(strings.TrimSpace(d.Hostname)); host != "" {
			if _, exists := byName[host]; !exists {
				byName[host] = d.ID
			}
		}
		if mac := normalizeMAC(d.MAC); mac != "" {
			byMAC[mac] = d.ID
		}
	}

	resolve := func(n TopologyNeighbor) (int, bool) {
		if ip := strings.TrimSpace(n.RemoteMgmtIP); ip != "" {
			if id, ok := byIP[ip]; ok {
				return id, true
			}
		}
		if name := strings.ToLower(strings.TrimSpace(n.RemoteSysName)); name != "" {
			if id, ok := byName[name]; ok {
				return id, true
			}
		}
		if mac := normalizeMAC(n.RemoteChassisID); mac != "" {
			if id, ok := byMAC[mac]; ok {
				return id, true
			}
		}
		return 0, false
	}

	// 按无序设备对分组半链路，组内再按端口配对
	groups := make(map[[2]int][]halfLink)
	groupOrder := make([][2]int, 0)
	for _, n := range neighbors {
		idx, known := nodeIndex[n.DeviceID]
		if !known {
			continue
		}
		peer, ok := resolve(n)
		if !ok {
			nodes[idx].UnmanagedNeighbors++
			continue
		}
		if peer == n.DeviceID {
			continue
		}
		key := [2]int{n.DeviceID, peer}
		if key[0] > key[1] {
			key[0], key[1] = key[1], key[0]
		}
		if _, exists := groups[key]; !exists {
			groupOrder = append(groupOrder, key)
		}
		groups[key] = append(groups[key], halfLink{
			src:         n.DeviceID,
			srcPort:     strings.TrimSpace(n.LocalPort),
			dst:         peer,
			claimedPort: strings.TrimSpace(n.RemotePortID),
		})
	}

	links := make([]TopologyLink, 0, len(groupOrder))
	for _, key := range groupOrder {
		links = append(links, pairHalfLinks(key[0], key[1], groups[key])...)
	}
	sort.Slice(links, func(i, j int) bool {
		if links[i].Source != links[j].Source {
			return links[i].Source < links[j].Source
		}
		if links[i].Target != links[j].Target {
			return links[i].Target < links[j].Target
		}
		return links[i].SourcePort < links[j].SourcePort
	})

	return NetworkTopology{
		Nodes:       nodes,
		Links:       links,
		GeneratedAt: time.Now().UTC(),
	}
}

// pairHalfLinks 在同一设备对内把两侧的半链路配成完整链路。
// 优先按「一侧宣告的对端端口 == 另一侧本端口」配对；剩余若两侧各恰好一条则直接配对
// （两台设备之间只有一根线是绝大多数情况，端口 ID 子类型不一致时仍应合并）；
// 其余保留为单向链路。
func pairHalfLinks(a, b int, halves []halfLink) []TopologyLink {
	aSide := make([]halfLink, 0)
	bSide := make([]halfLink, 0)
	for _, h := range halves {
		if h.src == a {
			aSide = append(aSide, h)
		} else {
			bSide = append(bSide, h)
		}
	}

	links := make([]TopologyLink, 0, len(halves))
	usedB := make([]bool, len(bSide))
	usedA := make([]bool, len(aSide))

	for i, ha := range aSide {
		for j, hb := range bSide {
			if usedB[j] {
				continue
			}
			if portsMatch(ha.claimedPort, hb.srcPort) || portsMatch(hb.claimedPort, ha.srcPort) {
				links = append(links, newTopologyLink(a, b, ha.srcPort, hb.srcPort, true))
				usedA[i], usedB[j] = true, true
				break
			}
		}
	}

	remainingA := unusedHalves(aSide, usedA)
	remainingB := unusedHalves(bSide, usedB)
	if len(remainingA) == 1 && len(remainingB) == 1 {
		links = append(links, newTopologyLink(a, b, remainingA[0].srcPort, remainingB[0].srcPort, true))
		return links
	}
	for _, h := range remainingA {
		links = append(links, newTopologyLink(a, b, h.srcPort, h.claimedPort, false))
	}
	for _, h := range remainingB {
		links = append(links, newTopologyLink(a, b, h.claimedPort, h.srcPort, false))
	}
	return links
}

func unusedHalves(halves []halfLink, used []bool) []halfLink {
	remaining := make([]halfLink, 0)
	for i, h := range halves {
		if !used[i] {
			remaining = append(remaining, h)
		}
	}
	return remaining
}

func portsMatch(claimed, local string) bool {
	claimed = strings.ToLower(strings.TrimSpace(claimed))
	local = strings.ToLower(strings.TrimSpace(local))
	return claimed != "" && local != "" && claimed == local
}

func newTopologyLink(source, target int, sourcePort, targetPort string, bidirectional bool) TopologyLink {
	return TopologyLink{
		ID:            fmt.Sprintf("%d:%s|%d:%s", source, sourcePort, target, targetPort),
		Source:        source,
		Target:        target,
		SourcePort:    sourcePort,
		TargetPort:    targetPort,
		Bidirectional: bidirectional,
	}
}

// normalizeMAC 把 00-11-22-33-44-55 / 0011.2233.4455 / 00:11:22:33:44:55 归一化为小写冒号形式；
// 非 12 位十六进制返回空串。
func normalizeMAC(raw string) string {
	cleaned := strings.NewReplacer(":", "", "-", "", ".", "", " ", "").Replace(strings.ToLower(strings.TrimSpace(raw)))
	if len(cleaned) != 12 {
		return ""
	}
	for _, r := range cleaned {
		if !strings.ContainsRune("0123456789abcdef", r) {
			return ""
		}
	}
	parts := make([]string, 0, 6)
	for i := 0; i < 12; i += 2 {
		parts = append(parts, cleaned[i:i+2])
	}
	return strings.Join(parts, ":")
}

// getNetworkTopology 读取设备与邻居两张表后组装拓扑。
func (s *Service) getNetworkTopology(ctx context.Context) (NetworkTopology, error) {
	if s == nil || s.db == nil {
		return NetworkTopology{}, fmt.Errorf("database not initialized")
	}

	type deviceRow struct {
		ID                 int     `gorm:"column:id"`
		Name               string  `gorm:"column:name"`
		Hostname           *string `gorm:"column:hostname"`
		IPAddress          string  `gorm:"column:ip_address"`
		MacAddress         *string `gorm:"column:mac_address"`
		DeviceType         string  `gorm:"column:device_type"`
		DetectedDeviceType *string `gorm:"column:detected_device_type"`
		Vendor             string  `gorm:"column:vendor"`
		Model              *string `gorm:"column:model"`
		FirmwareVersion    *string `gorm:"column:firmware_version"`
		Status             string  `gorm:"column:status"`
	}
	deviceRows := make([]deviceRow, 0)
	if err := s.db.WithContext(ctx).
		Table("devices").
		Select("id, name, hostname, ip_address, mac_address, device_type, detected_device_type, vendor, model, firmware_version, status").
		Order("id").
		Scan(&deviceRows).Error; err != nil {
		return NetworkTopology{}, err
	}

	type neighborRow struct {
		DeviceID        int     `gorm:"column:device_id"`
		LocalPortNum    int     `gorm:"column:local_port_num"`
		LocalPortID     *string `gorm:"column:local_port_id"`
		LocalPortDesc   *string `gorm:"column:local_port_desc"`
		RemoteChassisID string  `gorm:"column:remote_chassis_id"`
		RemotePortID    *string `gorm:"column:remote_port_id"`
		RemoteSysName   *string `gorm:"column:remote_sys_name"`
		RemoteMgmtIP    *string `gorm:"column:remote_mgmt_ip"`
	}
	neighborRows := make([]neighborRow, 0)
	if err := s.db.WithContext(ctx).
		Table("device_neighbors").
		Select("device_id, local_port_num, local_port_id, local_port_desc, remote_chassis_id, remote_port_id, remote_sys_name, remote_mgmt_ip").
		Scan(&neighborRows).Error; err != nil {
		return NetworkTopology{}, err
	}

	devices := make([]TopologyDevice, 0, len(deviceRows))
	for _, row := range deviceRows {
		devices = append(devices, TopologyDevice{
			ID:              row.ID,
			Name:            row.Name,
			Hostname:        derefString(row.Hostname),
			IP:              row.IPAddress,
			MAC:             derefString(row.MacAddress),
			DeviceType:      row.DeviceType,
			DetectedType:    derefString(row.DetectedDeviceType),
			Vendor:          row.Vendor,
			Model:           derefString(row.Model),
			FirmwareVersion: derefString(row.FirmwareVersion),
			Status:          row.Status,
		})
	}

	neighbors := make([]TopologyNeighbor, 0, len(neighborRows))
	for _, row := range neighborRows {
		localPort := derefString(row.LocalPortID)
		if localPort == "" {
			localPort = derefString(row.LocalPortDesc)
		}
		if localPort == "" && row.LocalPortNum > 0 {
			localPort = "port " + strconv.Itoa(row.LocalPortNum)
		}
		neighbors = append(neighbors, TopologyNeighbor{
			DeviceID:        row.DeviceID,
			LocalPort:       localPort,
			RemoteChassisID: row.RemoteChassisID,
			RemotePortID:    derefString(row.RemotePortID),
			RemoteSysName:   derefString(row.RemoteSysName),
			RemoteMgmtIP:    derefString(row.RemoteMgmtIP),
		})
	}

	return BuildNetworkTopology(devices, neighbors), nil
}

func derefString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
