package alerts

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"gorm.io/gorm"
)

var ErrDependencyCycle = errors.New("dependency cycle detected")

// TopologyRoleRank 返回设备拓扑角色权重：core(4) > distribution(3) > access(2) > endpoint(1)。
func TopologyRoleRank(role string) int {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case "core":
		return 4
	case "distribution":
		return 3
	case "access":
		return 2
	case "endpoint":
		return 1
	default:
		return 2
	}
}

// IsSuppressedByUpstream 判断指定设备的规则是否被上游离线设备抑制。
// - manual_device: 当 rule.DependsOnDeviceID 离线时抑制；
// - lldp_upstream: 查询 device_neighbors 匹配上游设备，仅当 rank(upstream) > rank(deviceRole) 且上游离线时抑制（同级互连绝不互抑）。
func IsSuppressedByUpstream(
	ctx context.Context,
	db *gorm.DB,
	rule AlertRule,
	deviceID int,
	deviceRole string,
	offlineDeviceIDs map[int]bool,
) (bool, int) {
	if db == nil || deviceID <= 0 || len(offlineDeviceIDs) == 0 {
		return false, 0
	}

	mode := strings.ToLower(strings.TrimSpace(rule.DependencyMode))
	switch mode {
	case "", DependencyModeNone:
		return false, 0

	case DependencyModeManualDevice:
		if rule.DependsOnDeviceID != nil && *rule.DependsOnDeviceID > 0 && *rule.DependsOnDeviceID != deviceID {
			if offlineDeviceIDs[*rule.DependsOnDeviceID] {
				return true, *rule.DependsOnDeviceID
			}
		}
		return false, 0

	case DependencyModeLLDPUpstream:
		type neighborRow struct {
			RemoteMgmtIP    *string `gorm:"column:remote_mgmt_ip"`
			RemoteChassisID string  `gorm:"column:remote_chassis_id"`
			RemoteSysName   *string `gorm:"column:remote_sys_name"`
		}
		var neighbors []neighborRow
		if err := db.WithContext(ctx).
			Table("device_neighbors").
			Select("remote_mgmt_ip, remote_chassis_id, remote_sys_name").
			Where("device_id = ?", deviceID).
			Scan(&neighbors).Error; err != nil || len(neighbors) == 0 {
			return false, 0
		}

		mgmtIPs := make([]string, 0, len(neighbors))
		sysNames := make([]string, 0, len(neighbors))
		for _, n := range neighbors {
			if n.RemoteMgmtIP != nil && strings.TrimSpace(*n.RemoteMgmtIP) != "" {
				mgmtIPs = append(mgmtIPs, strings.TrimSpace(*n.RemoteMgmtIP))
			}
			if n.RemoteSysName != nil && strings.TrimSpace(*n.RemoteSysName) != "" {
				sysNames = append(sysNames, strings.TrimSpace(*n.RemoteSysName))
			}
		}
		if len(mgmtIPs) == 0 && len(sysNames) == 0 {
			return false, 0
		}

		type upstreamDev struct {
			ID           int    `gorm:"column:id"`
			TopologyRole string `gorm:"column:topology_role"`
		}
		var candidates []upstreamDev
		q := db.WithContext(ctx).
			Table("devices").
			Select("id, COALESCE(topology_role, 'access') AS topology_role").
			Where("id <> ? AND is_active = ?", deviceID, true)
		switch {
		case len(mgmtIPs) > 0 && len(sysNames) > 0:
			q = q.Where("(ip_address IN ? OR name IN ?)", mgmtIPs, sysNames)
		case len(mgmtIPs) > 0:
			q = q.Where("ip_address IN ?", mgmtIPs)
		default:
			q = q.Where("name IN ?", sysNames)
		}
		if err := q.Scan(&candidates).Error; err != nil {
			return false, 0
		}

		myRank := TopologyRoleRank(deviceRole)
		for _, up := range candidates {
			if TopologyRoleRank(up.TopologyRole) > myRank && offlineDeviceIDs[up.ID] {
				return true, up.ID
			}
		}
		return false, 0

	default:
		return false, 0
	}
}

// ValidateDependencyDAG 对 manual_device 显式依赖构建邻接表并执行 DFS 环路检测（含自环与间接环）。
func ValidateDependencyDAG(ctx context.Context, db *gorm.DB, ruleID int, targetDeviceIDs []int, dependsOnDeviceID int) error {
	if dependsOnDeviceID <= 0 {
		return nil
	}
	for _, tid := range targetDeviceIDs {
		if tid == dependsOnDeviceID {
			return fmt.Errorf("%w: device %d cannot depend on itself", ErrDependencyCycle, tid)
		}
	}

	adj := make(map[int][]int)
	for _, tid := range targetDeviceIDs {
		if tid > 0 {
			adj[tid] = append(adj[tid], dependsOnDeviceID)
		}
	}

	if db != nil {
		type ruleEdgeRow struct {
			ID                int    `gorm:"column:id"`
			SpecificDevices   []byte `gorm:"column:specific_devices"`
			DependsOnDeviceID *int   `gorm:"column:depends_on_device_id"`
		}
		var rows []ruleEdgeRow
		q := db.WithContext(ctx).
			Table("alert_rules").
			Select("id, specific_devices, depends_on_device_id").
			Where("dependency_mode = ? AND depends_on_device_id IS NOT NULL AND COALESCE(is_active, true) = true", DependencyModeManualDevice)
		if ruleID > 0 {
			q = q.Where("id <> ?", ruleID)
		}
		if err := q.Scan(&rows).Error; err != nil {
			return fmt.Errorf("failed to load dependency graph for DAG validation: %w", err)
		}
		for _, r := range rows {
			if r.DependsOnDeviceID == nil || *r.DependsOnDeviceID <= 0 {
				continue
			}
			var devs []int
			if len(r.SpecificDevices) > 0 {
				_ = json.Unmarshal(r.SpecificDevices, &devs)
			}
			for _, d := range devs {
				if d > 0 {
					adj[d] = append(adj[d], *r.DependsOnDeviceID)
				}
			}
		}
	}

	// 标准三色 DFS：0=未访问, 1=访问中(当前栈), 2=已完成
	color := make(map[int]int, len(adj))
	var dfs func(u int) bool
	dfs = func(u int) bool {
		color[u] = 1
		for _, v := range adj[u] {
			if color[v] == 1 {
				return true
			}
			if color[v] == 0 {
				if dfs(v) {
					return true
				}
			}
		}
		color[u] = 2
		return false
	}

	for node := range adj {
		if color[node] == 0 {
			if dfs(node) {
				return fmt.Errorf("%w: manual_device dependency forms a cycle", ErrDependencyCycle)
			}
		}
	}
	return nil
}
