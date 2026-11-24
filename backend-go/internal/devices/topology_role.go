package devices

import (
	"regexp"
	"sort"
	"strings"
)

const (
	TopologyRoleFirewall    = "firewall"
	TopologyRoleRouter      = "router"
	TopologyRoleCore        = "core"
	TopologyRoleAggregation = "aggregation"
	TopologyRoleAccess      = "access"
	TopologyRoleEdge        = "edge"

	TopologyRoleSourceType     = "type"
	TopologyRoleSourceName     = "name"
	TopologyRoleSourceInferred = "inferred"
)

// TopologyRoleDevice 描述拓扑角色推断所需的设备最小投影。
type TopologyRoleDevice struct {
	ID                                                                                          int
	Name, Hostname, IP, MAC, DetectedSysName, DetectedChassisID, DeviceType, DetectedDeviceType string
}

// TopologyRoleNeighbor 描述拓扑角色推断所需的 LLDP 邻居最小投影。
type TopologyRoleNeighbor struct {
	DeviceID                                     int
	RemoteChassisID, RemoteSysName, RemoteMgmtIP string
}

// TopologyRoleResult 表示单台设备最终生效的拓扑角色及判断来源。
type TopologyRoleResult struct {
	Role, Source string
}

var (
	topologyRoleNameRules = []struct {
		role    string
		pattern *regexp.Regexp
	}{
		{TopologyRoleCore, regexp.MustCompile(`(?i)核心|\bcore\b`)},
		{TopologyRoleAggregation, regexp.MustCompile(`(?i)汇聚|\b(?:aggregation|agg|distribution|dist)\b`)},
		{TopologyRoleAccess, regexp.MustCompile(`(?i)接入|\b(?:access|acc)\b`)},
	}
	topologyRoleFallbackMap = map[string]string{
		TopologyRoleCore: TopologyRoleCore, TopologyRoleAggregation: TopologyRoleAggregation,
		"distribution": TopologyRoleAggregation, TopologyRoleAccess: TopologyRoleAccess,
		TopologyRoleRouter: TopologyRoleRouter, TopologyRoleFirewall: TopologyRoleFirewall,
		TopologyRoleEdge: TopologyRoleEdge, "endpoint": TopologyRoleEdge,
	}
)

type topologyLookupIndices struct {
	known               map[int]bool
	byIP, byName, byMAC map[string]int
}

// RoleFromDeviceName 按「核心 -> 汇聚 -> 接入」顺序匹配设备名中的层级关键字。
func RoleFromDeviceName(name string) (string, bool) {
	for _, rule := range topologyRoleNameRules {
		if rule.pattern.MatchString(name) {
			return rule.role, true
		}
	}
	return "", false
}

// InferTopologyRoles 按与控制台全网拓扑图完全一致的三步规则推断全网设备拓扑角色。
func InferTopologyRoles(devs []TopologyRoleDevice, neighbors []TopologyRoleNeighbor) map[int]TopologyRoleResult {
	results := make(map[int]TopologyRoleResult, len(devs))
	if len(devs) == 0 {
		return results
	}
	sorted := append([]TopologyRoleDevice(nil), devs...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].ID < sorted[j].ID })

	idx := buildTopologyIndices(sorted)
	adj := buildTopologyAdjacency(sorted, neighbors, idx)
	comp := computeTopologyComponents(sorted, adj)

	pending := make([]TopologyRoleDevice, 0, len(sorted))
	for _, d := range sorted {
		if role, ok := roleFromType(effectiveDeviceType(d.DeviceType, d.DetectedDeviceType)); ok {
			results[d.ID] = TopologyRoleResult{Role: role, Source: TopologyRoleSourceType}
		} else if role, ok := RoleFromDeviceName(d.Name); ok {
			results[d.ID] = TopologyRoleResult{Role: role, Source: TopologyRoleSourceName}
		} else {
			pending = append(pending, d)
		}
	}
	assignInferredSwitchRoles(pending, adj, comp, results)
	return results
}

// InferSingleDeviceTopologyRole 在全网拓扑查询降级或缺失目标设备时执行单机角色回退。
func InferSingleDeviceTopologyRole(deviceType, detectedType, name, fallback string) TopologyRoleResult {
	if eff := effectiveDeviceType(deviceType, detectedType); eff != "" {
		if role, ok := roleFromType(eff); ok {
			return TopologyRoleResult{Role: role, Source: TopologyRoleSourceType}
		}
	}
	if role, ok := RoleFromDeviceName(name); ok {
		return TopologyRoleResult{Role: role, Source: TopologyRoleSourceName}
	}
	if role, ok := topologyRoleFallbackMap[strings.ToLower(strings.TrimSpace(fallback))]; ok {
		return TopologyRoleResult{Role: role}
	}
	return TopologyRoleResult{Role: TopologyRoleAccess}
}

func effectiveDeviceType(deviceType, detectedType string) string {
	if dt := strings.ToLower(strings.TrimSpace(detectedType)); dt != "" {
		return dt
	}
	return strings.ToLower(strings.TrimSpace(deviceType))
}

func roleFromType(effective string) (string, bool) {
	switch effective {
	case TopologyRoleFirewall:
		return TopologyRoleFirewall, true
	case TopologyRoleRouter:
		return TopologyRoleRouter, true
	case "switch":
		return "", false
	default:
		return TopologyRoleEdge, true
	}
}

func buildTopologyIndices(sorted []TopologyRoleDevice) topologyLookupIndices {
	idx := topologyLookupIndices{
		known: make(map[int]bool, len(sorted)), byIP: make(map[string]int, len(sorted)),
		byName: make(map[string]int, len(sorted)*2), byMAC: make(map[string]int, len(sorted)),
	}
	for _, d := range sorted {
		idx.known[d.ID] = true
		if ip := strings.TrimSpace(d.IP); ip != "" {
			idx.byIP[ip] = d.ID
		}
	}
	registerTieredIndex(sorted, idx.byName, []func(TopologyRoleDevice) string{
		func(d TopologyRoleDevice) string { return d.Name },
		func(d TopologyRoleDevice) string { return d.Hostname },
		func(d TopologyRoleDevice) string { return d.DetectedSysName },
	}, func(s string) string { return strings.ToLower(strings.TrimSpace(s)) })
	registerTieredIndex(sorted, idx.byMAC, []func(TopologyRoleDevice) string{
		func(d TopologyRoleDevice) string { return d.MAC },
		func(d TopologyRoleDevice) string { return d.DetectedChassisID },
	}, normalizeTopologyMAC)
	return idx
}

func registerTieredIndex(sorted []TopologyRoleDevice, target map[string]int, tiers []func(TopologyRoleDevice) string, norm func(string) string) {
	for _, tier := range tiers {
		for _, d := range sorted {
			if key := norm(tier(d)); key != "" {
				if _, exists := target[key]; !exists {
					target[key] = d.ID
				}
			}
		}
	}
}

func buildTopologyAdjacency(sorted []TopologyRoleDevice, neighbors []TopologyRoleNeighbor, idx topologyLookupIndices) map[int]map[int]struct{} {
	adj := make(map[int]map[int]struct{}, len(sorted))
	for _, d := range sorted {
		adj[d.ID] = make(map[int]struct{})
	}
	resolvePeer := func(n TopologyRoleNeighbor) (int, bool) {
		if id, ok := idx.byIP[strings.TrimSpace(n.RemoteMgmtIP)]; ok {
			return id, true
		}
		if id, ok := idx.byName[strings.ToLower(strings.TrimSpace(n.RemoteSysName))]; ok {
			return id, true
		}
		if mac := normalizeTopologyMAC(n.RemoteChassisID); mac != "" {
			id, ok := idx.byMAC[mac]
			return id, ok
		}
		return 0, false
	}
	for _, n := range neighbors {
		if !idx.known[n.DeviceID] {
			continue
		}
		if peer, ok := resolvePeer(n); ok && peer != n.DeviceID {
			adj[n.DeviceID][peer], adj[peer][n.DeviceID] = struct{}{}, struct{}{}
		}
	}
	return adj
}

func computeTopologyComponents(sorted []TopologyRoleDevice, adj map[int]map[int]struct{}) map[int]int {
	comp := make(map[int]int, len(sorted))
	nextComp := 0
	for _, d := range sorted {
		if _, seen := comp[d.ID]; seen {
			continue
		}
		stack := []int{d.ID}
		comp[d.ID] = nextComp
		for len(stack) > 0 {
			curr := stack[len(stack)-1]
			stack = stack[:len(stack)-1]
			for peer := range adj[curr] {
				if _, seen := comp[peer]; !seen {
					comp[peer] = nextComp
					stack = append(stack, peer)
				}
			}
		}
		nextComp++
	}
	return comp
}

func assignInferredSwitchRoles(pending []TopologyRoleDevice, adj map[int]map[int]struct{}, comp map[int]int, results map[int]TopologyRoleResult) {
	coreComps, maxDeg := make(map[int]bool), make(map[int]int)
	for id, res := range results {
		if res.Role == TopologyRoleCore {
			coreComps[comp[id]] = true
		}
	}
	for _, d := range pending {
		if deg := len(adj[d.ID]); deg > maxDeg[comp[d.ID]] {
			maxDeg[comp[d.ID]] = deg
		}
	}
	for _, d := range pending {
		deg, c := len(adj[d.ID]), comp[d.ID]
		role := TopologyRoleAggregation
		if deg <= 1 {
			role = TopologyRoleAccess
		} else if !coreComps[c] && deg == maxDeg[c] {
			role = TopologyRoleCore
		}
		results[d.ID] = TopologyRoleResult{Role: role, Source: TopologyRoleSourceInferred}
	}
}

func normalizeTopologyMAC(raw string) string {
	cleaned := strings.NewReplacer(":", "", "-", "", ".", "", " ", "").Replace(strings.ToLower(strings.TrimSpace(raw)))
	if len(cleaned) != 12 {
		return ""
	}
	for _, r := range cleaned {
		if !strings.ContainsRune("0123456789abcdef", r) {
			return ""
		}
	}
	return cleaned[0:2] + ":" + cleaned[2:4] + ":" + cleaned[4:6] + ":" + cleaned[6:8] + ":" + cleaned[8:10] + ":" + cleaned[10:12]
}
