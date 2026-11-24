package monitoring

import (
	"context"
	"errors"
	"fmt"
	"math"
	"regexp"
	"sort"
	"strings"
	"time"

	"gorm.io/gorm"
)

const (
	DefaultHostsPageSize = 20
	MaxHostsPageSize     = 100
	SparklinePointLimit  = 12
	DefaultTopNLimit     = 5
	MaxTopNLimit         = 20
	MaxTopNDeviceIDs     = 200

	topNActiveDeviceClause         = `d.is_active = ? AND COALESCE(d.is_monitored, true) = true AND LOWER(COALESCE(d.status, '')) <> 'offline'`
	topNInterfaceTrafficOnlyClause = `NOT (LOWER(BTRIM(COALESCE(NULLIF(BTRIM(di.alias), ''), di.name))) ~ '` + nonTrafficInterfaceNamePattern + `')`
)

// ModulePermissionStatus 描述跨模块聚合区块的权限状态。
type ModulePermissionStatus struct {
	Allowed             bool   `json:"allowed"`
	LimitedByPermission bool   `json:"limitedByPermission,omitempty"`
	RequiredPermission  string `json:"requiredPermission,omitempty"`
}

// CrossModulePermissions 描述监控中心聚合外部模块数据的独立门控状态。
type CrossModulePermissions struct {
	Alerts      ModulePermissionStatus `json:"alerts"`
	Inspections ModulePermissionStatus `json:"inspections"`
	Logs        ModulePermissionStatus `json:"logs"`
}

// HostCollectionStateView 表示单机采集诊断状态与退避熔断摘要（仅含白名单安全文案）。
type HostCollectionStateView struct {
	LastErrorCode       string     `json:"last_error_code"`
	LastErrorMessage    string     `json:"last_error_message"`
	ConsecutiveFailures int        `json:"consecutive_failures"`
	BackoffUntil        *time.Time `json:"backoff_until,omitempty"`
	InBackoff           bool       `json:"in_backoff"`
	LastSuccessAt       *time.Time `json:"last_success_at,omitempty"`
	LastDurationMS      int        `json:"last_duration_ms"`
}

// HostProtocolSummary 表示三协议连通性摘要。
type HostProtocolSummary struct {
	ICMPStatus    string `json:"icmp_status"`
	SNMPStatus    string `json:"snmp_status"`
	CLIProtocol   string `json:"cli_protocol"`
	ICMPHealthy   bool   `json:"icmp_healthy"`
	SNMPHealthy   bool   `json:"snmp_healthy"`
	CLIConfigured bool   `json:"cli_configured"`
}

// HostSparklinePoint 表示主机矩阵最近 12 点迷你趋势点。
type HostSparklinePoint struct {
	Timestamp time.Time `json:"timestamp"`
	CPU       *float64  `json:"cpu,omitempty"`
	Memory    *float64  `json:"memory,omitempty"`
}

// HostsMatrixFilter 定义分页主机监控矩阵查询条件。
type HostsMatrixFilter struct {
	UserID             string
	Status             string
	GroupID            *int
	PinnedOnly         bool
	ProblemOnly        bool
	Protocol           string
	Search             string
	SortBy             string
	SortOrder          string
	Page               int
	PageSize           int
	CanReadAlerts      bool
	CanReadInspections bool
	CanReadLogs        bool
}

// HostMatrixItem 表示设备监控矩阵中的单行设备摘要。
type HostMatrixItem struct {
	ID                    int                     `json:"id"`
	Name                  string                  `json:"name"`
	IPAddress             string                  `json:"ip_address"`
	Hostname              *string                 `json:"hostname,omitempty"`
	DeviceType            string                  `json:"device_type"`
	Vendor                string                  `json:"vendor"`
	Model                 *string                 `json:"model,omitempty"`
	GroupID               *int                    `json:"group_id,omitempty"`
	GroupName             string                  `json:"group_name,omitempty"`
	Status                string                  `json:"status"`
	IsMonitored           bool                    `json:"is_monitored"`
	IsPinned              bool                    `json:"is_pinned"`
	InMaintenance         bool                    `json:"in_maintenance"`
	Maintenance           *ActiveMaintenance      `json:"maintenance,omitempty"`
	CPUUsage              *float64                `json:"cpu_usage,omitempty"`
	MemoryUsage           *float64                `json:"memory_usage,omitempty"`
	Temperature           *float64                `json:"temperature,omitempty"`
	Uptime                *int64                  `json:"uptime,omitempty"`
	ResponseTime          *float64                `json:"response_time,omitempty"`
	LastSeen              *time.Time              `json:"last_seen,omitempty"`
	Protocols             HostProtocolSummary     `json:"protocols"`
	CollectionState       HostCollectionStateView `json:"collection_state"`
	InterfacesUp          int                     `json:"interfaces_up"`
	InterfacesTotal       int                     `json:"interfaces_total"`
	HardwareFaultCount    int                     `json:"hardware_fault_count"`
	ActiveAlertCount      *int                    `json:"active_alert_count,omitempty"`
	CriticalAlertCount    *int                    `json:"critical_alert_count,omitempty"`
	WarningAlertCount     *int                    `json:"warning_alert_count,omitempty"`
	LatestInspectionScore *float64                `json:"latest_inspection_score,omitempty"`
	LatestInspectionAt    *time.Time              `json:"latest_inspection_at,omitempty"`
	ErrorLogCount24h      *int                    `json:"error_log_count_24h,omitempty"`
	TrapLogCount24h       *int                    `json:"trap_log_count_24h,omitempty"`
	Sparkline             []HostSparklinePoint    `json:"sparkline"`
}

// HostsMatrixResponse 表示分页主机监控矩阵响应。
type HostsMatrixResponse struct {
	Items               []HostMatrixItem       `json:"items"`
	Total               int64                  `json:"total"`
	Page                int                    `json:"page"`
	PageSize            int                    `json:"page_size"`
	TotalPages          int                    `json:"total_pages"`
	LimitedByPermission bool                   `json:"limitedByPermission"`
	Permissions         CrossModulePermissions `json:"permissions"`
}

// HostInterfaceDetail 表示单机下钻抽屉中的接口行。
type HostInterfaceDetail struct {
	ID                 int        `json:"id"`
	Name               string     `json:"name"`
	DisplayName        string     `gorm:"-" json:"display_name,omitempty"`
	Alias              *string    `json:"alias,omitempty"`
	Description        *string    `gorm:"column:description" json:"description,omitempty"`
	Speed              *int64     `json:"speed,omitempty"`
	InOctets           *int64     `json:"in_octets,omitempty"`
	OutOctets          *int64     `json:"out_octets,omitempty"`
	IsUp               *bool      `json:"is_up,omitempty"`
	AdminUp            bool       `json:"admin_up"`
	DuplexStatus       string     `json:"duplex_status"`
	InErrors           int64      `json:"in_errors"`
	OutErrors          int64      `json:"out_errors"`
	InDiscards         int64      `json:"in_discards"`
	OutDiscards        int64      `json:"out_discards"`
	InErrorRate        float64    `json:"in_error_rate"`
	OutErrorRate       float64    `json:"out_error_rate"`
	UtilizationIn      float64    `json:"utilization_in"`
	UtilizationOut     float64    `json:"utilization_out"`
	SpeedUnknown       bool       `json:"speed_unknown"`
	FlapCount1h        int        `json:"flap_count_1h"`
	LastStatusChangeAt *time.Time `json:"last_status_change_at,omitempty"`
	LLDMonitored       bool       `json:"lld_monitored"`
	LLDLostSince       *time.Time `json:"lld_lost_since,omitempty"`
	LastUpdated        *time.Time `json:"last_updated,omitempty"`
}

// HostInspectionSummary 表示最近一次巡检评分摘要。
type HostInspectionSummary struct {
	InspectionID  int        `json:"inspection_id"`
	Status        string     `json:"status"`
	Score         float64    `json:"score"`
	TotalChecks   int        `json:"total_checks"`
	PassedChecks  int        `json:"passed_checks"`
	FailedChecks  int        `json:"failed_checks"`
	WarningChecks int        `json:"warning_checks"`
	CompletedAt   *time.Time `json:"completed_at,omitempty"`
}

// HostNeighborSummary 表示上下游直连 LLDP 邻居摘要。
type HostNeighborSummary struct {
	LocalPort      string    `json:"local_port"`
	RemoteDeviceID *int      `json:"remote_device_id,omitempty"`
	RemoteName     string    `json:"remote_name"`
	RemotePort     string    `json:"remote_port,omitempty"`
	RemoteMgmtIP   *string   `json:"remote_mgmt_ip,omitempty"`
	RemoteRole     string    `json:"remote_role,omitempty"`
	CollectedAt    time.Time `json:"collected_at"`
}

// HostLogSummary 表示近 24h 异常日志与 Trap 摘要。
type HostLogSummary struct {
	ID           int       `json:"id"`
	Level        string    `json:"level"`
	Source       string    `json:"source"`
	Message      string    `json:"message"`
	LogTimestamp time.Time `json:"log_timestamp"`
}

// HostActiveAlertSummary 表示单机活跃告警摘要（预留 snoozed_until）。
type HostActiveAlertSummary struct {
	ID             int        `json:"id"`
	Title          string     `json:"title"`
	Severity       string     `json:"severity"`
	Status         string     `json:"status"`
	MetricName     *string    `json:"metric_name,omitempty"`
	CurrentValue   *float64   `json:"current_value,omitempty"`
	ThresholdValue *float64   `json:"threshold_value,omitempty"`
	FirstOccurred  *time.Time `json:"first_occurred,omitempty"`
	LastOccurred   *time.Time `json:"last_occurred,omitempty"`
	SnoozedUntil   *time.Time `json:"snoozed_until,omitempty"`
}

// HostDetailResponse 表示单机全景下钻响应。
type HostDetailResponse struct {
	Device              HostMatrixItem           `json:"device"`
	FirmwareVersion     *string                  `json:"firmware_version,omitempty"`
	SerialNumber        *string                  `json:"serial_number,omitempty"`
	Location            *string                  `json:"location,omitempty"`
	TopologyRole        string                   `json:"topology_role"`
	Interfaces          []HostInterfaceDetail    `json:"interfaces"`
	SNMPExtensions      SNMPExtensionsResponse   `json:"snmp_extensions"`
	LatestInspection    *HostInspectionSummary   `json:"latest_inspection,omitempty"`
	Neighbors           []HostNeighborSummary    `json:"neighbors"`
	RecentLogs          []HostLogSummary         `json:"recent_logs"`
	ErrorLogCount24h    *int                     `json:"error_log_count_24h,omitempty"`
	TrapLogCount24h     *int                     `json:"trap_log_count_24h,omitempty"`
	ActiveAlerts        []HostActiveAlertSummary `json:"active_alerts"`
	Thresholds          ThresholdSummary         `json:"thresholds"`
	LimitedByPermission bool                     `json:"limitedByPermission"`
	Permissions         CrossModulePermissions   `json:"permissions"`
}

// TopNItem 表示 TopN 排行单项。
type TopNItem struct {
	DeviceID             int     `json:"device_id"`
	DeviceName           string  `json:"device_name"`
	IPAddress            string  `json:"ip_address"`
	Status               string  `json:"status"`
	InterfaceName        string  `json:"interface_name,omitempty"`
	InterfaceDisplayName string  `json:"interface_display_name,omitempty"`
	Value                float64 `json:"value"`
	Unit                 string  `json:"unit"`
	DisplayValue         string  `json:"display_value,omitempty"`
}

// TopNResponse 表示全网 TopN 排行响应。
type TopNResponse struct {
	Metric string     `json:"metric"`
	Unit   string     `json:"unit"`
	Items  []TopNItem `json:"items"`
}

// GetEngineHealth 返回采集引擎健康快照，并结合 device_collection_states 刷新实时退避设备列表。
func (w *MetricsWriter) GetEngineHealth(ctx context.Context) (EngineHealthSnapshot, error) {
	snap := w.EngineHealthSnapshot()
	if w == nil || w.db == nil {
		return snap, nil
	}

	type backoffRow struct {
		DeviceID            int        `gorm:"column:device_id"`
		DeviceName          string     `gorm:"column:device_name"`
		LastErrorCode       string     `gorm:"column:last_error_code"`
		ConsecutiveFailures int        `gorm:"column:consecutive_failures"`
		BackoffUntil        *time.Time `gorm:"column:backoff_until"`
	}
	now := time.Now().UTC()
	var rows []backoffRow
	if err := w.db.WithContext(ctx).
		Table("device_collection_states AS cs").
		Select("cs.device_id, d.name AS device_name, cs.last_error_code, cs.consecutive_failures, cs.backoff_until").
		Joins("JOIN devices AS d ON d.id = cs.device_id").
		Where("d.is_active = ? AND cs.backoff_until IS NOT NULL AND cs.backoff_until > ?", true, now).
		Order("cs.consecutive_failures DESC, cs.device_id ASC").
		Scan(&rows).Error; err == nil {
		list := make([]BackoffDeviceSummary, 0, len(rows))
		for _, r := range rows {
			list = append(list, BackoffDeviceSummary{
				DeviceID:            r.DeviceID,
				DeviceName:          r.DeviceName,
				LastErrorCode:       r.LastErrorCode,
				LastErrorMessage:    SafeCollectionErrorMessage(r.LastErrorCode),
				ConsecutiveFailures: r.ConsecutiveFailures,
				BackoffUntil:        r.BackoffUntil,
			})
		}
		snap.BackoffDevices = len(list)
		snap.BackoffDeviceList = list
	}
	return snap, nil
}

// resolveDescendantGroupIDs 递归解析指定分组及其全部子孙分组 ID。
func (w *MetricsWriter) resolveDescendantGroupIDs(ctx context.Context, rootGroupID int) ([]int, error) {
	if w == nil || w.db == nil || rootGroupID <= 0 {
		return nil, nil
	}
	type groupRow struct {
		ID       int  `gorm:"column:id"`
		ParentID *int `gorm:"column:parent_id"`
	}
	var allGroups []groupRow
	if err := w.db.WithContext(ctx).Table("device_groups").Select("id, parent_id").Scan(&allGroups).Error; err != nil {
		return nil, err
	}

	childrenMap := make(map[int][]int, len(allGroups))
	exists := false
	for _, g := range allGroups {
		if g.ID == rootGroupID {
			exists = true
		}
		if g.ParentID != nil && *g.ParentID > 0 {
			childrenMap[*g.ParentID] = append(childrenMap[*g.ParentID], g.ID)
		}
	}
	if !exists {
		return nil, nil
	}

	visited := map[int]bool{rootGroupID: true}
	queue := []int{rootGroupID}
	result := []int{rootGroupID}
	for len(queue) > 0 {
		curr := queue[0]
		queue = queue[1:]
		for _, childID := range childrenMap[curr] {
			if !visited[childID] {
				visited[childID] = true
				result = append(result, childID)
				queue = append(queue, childID)
			}
		}
	}
	return result, nil
}

// QueryHostsMatrix 分页检索设备监控矩阵，仅对当前页设备查询最近 12 点 Sparkline。
func (w *MetricsWriter) QueryHostsMatrix(ctx context.Context, filter HostsMatrixFilter) (HostsMatrixResponse, error) {
	page := filter.Page
	if page < 1 {
		page = 1
	}
	pageSize := filter.PageSize
	if pageSize <= 0 {
		pageSize = DefaultHostsPageSize
	}
	if pageSize > MaxHostsPageSize {
		pageSize = MaxHostsPageSize
	}

	perms := buildCrossModulePermissions(filter.CanReadAlerts, filter.CanReadInspections, filter.CanReadLogs)
	resp := HostsMatrixResponse{
		Items:               []HostMatrixItem{},
		Page:                page,
		PageSize:            pageSize,
		LimitedByPermission: !filter.CanReadAlerts || !filter.CanReadInspections || !filter.CanReadLogs,
		Permissions:         perms,
	}
	if w == nil || w.db == nil {
		return resp, fmt.Errorf("database not initialized")
	}

	query := w.db.WithContext(ctx).
		Table("devices AS d").
		Joins("LEFT JOIN device_groups AS dg ON dg.id = d.group_id").
		Joins("LEFT JOIN device_collection_states AS cs ON cs.device_id = d.id").
		Where("d.is_active = ?", true)

	if status := strings.ToLower(strings.TrimSpace(filter.Status)); status != "" {
		if status == "maintenance" {
			maintMap, _ := w.GetActiveMaintenanceMapForDevices(ctx, time.Now().UTC())
			if len(maintMap) > 0 {
				maintIDs := make([]int, 0, len(maintMap))
				for id := range maintMap {
					maintIDs = append(maintIDs, id)
				}
				sort.Ints(maintIDs)
				query = query.Where("(LOWER(d.status) = 'maintenance' OR d.id IN ?)", maintIDs)
			} else {
				query = query.Where("LOWER(d.status) = 'maintenance'")
			}
		} else {
			query = query.Where("LOWER(d.status) = ?", status)
		}
	}
	if filter.GroupID != nil && *filter.GroupID > 0 {
		groupIDs, err := w.resolveDescendantGroupIDs(ctx, *filter.GroupID)
		if err != nil {
			return resp, err
		}
		if len(groupIDs) == 0 {
			return resp, nil
		}
		query = query.Where("d.group_id IN ?", groupIDs)
	}
	if filter.PinnedOnly {
		if strings.TrimSpace(filter.UserID) == "" {
			return resp, nil
		}
		query = query.Where("EXISTS (SELECT 1 FROM user_pinned_devices AS up WHERE up.device_id = d.id AND up.user_id = ?)", filter.UserID)
	}
	if filter.ProblemOnly {
		if filter.CanReadAlerts {
			query = query.Where(`(
				LOWER(d.status) IN ('offline', 'warning', 'critical') OR
				COALESCE(cs.consecutive_failures, 0) > 0 OR
				COALESCE(d.cpu_usage, 0) >= 80 OR
				COALESCE(d.memory_usage, 0) >= 80 OR
				COALESCE(d.temperature, 0) >= 75 OR
				EXISTS (SELECT 1 FROM alerts AS a WHERE a.device_id = d.id AND ` + activeAlertAliasStatusClause + `)
			)`)
		} else {
			query = query.Where(`(
				LOWER(d.status) IN ('offline', 'warning', 'critical') OR
				COALESCE(cs.consecutive_failures, 0) > 0 OR
				COALESCE(d.cpu_usage, 0) >= 80 OR
				COALESCE(d.memory_usage, 0) >= 80 OR
				COALESCE(d.temperature, 0) >= 75
			)`)
		}
	}
	if proto := strings.ToLower(strings.TrimSpace(filter.Protocol)); proto != "" {
		switch proto {
		case "icmp":
			query = query.Where("LOWER(COALESCE(d.icmp_status, '')) = 'online'")
		case "snmp":
			query = query.Where("LOWER(COALESCE(d.snmp_status, '')) = 'success'")
		case "cli":
			query = query.Where("COALESCE(d.cli_protocol, '') <> ''")
		}
	}
	if search := strings.TrimSpace(filter.Search); search != "" {
		pattern := "%" + search + "%"
		query = query.Where(
			"(d.name ILIKE ? OR d.ip_address ILIKE ? OR COALESCE(d.hostname, '') ILIKE ? OR COALESCE(d.detected_sys_name, '') ILIKE ? OR COALESCE(d.model, '') ILIKE ? OR d.vendor ILIKE ?)",
			pattern, pattern, pattern, pattern, pattern, pattern,
		)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return resp, err
	}
	resp.Total = total
	if total > 0 {
		resp.TotalPages = int((total + int64(pageSize) - 1) / int64(pageSize))
	}
	if total == 0 {
		return resp, nil
	}

	orderClause := resolveHostsOrderClause(filter.SortBy, filter.SortOrder, filter.CanReadAlerts)

	type hostRow struct {
		ID                  int        `gorm:"column:id"`
		Name                string     `gorm:"column:name"`
		IPAddress           string     `gorm:"column:ip_address"`
		Hostname            *string    `gorm:"column:hostname"`
		DetectedSysName     *string    `gorm:"column:detected_sys_name"`
		DeviceType          string     `gorm:"column:device_type"`
		Vendor              string     `gorm:"column:vendor"`
		Model               *string    `gorm:"column:model"`
		GroupID             *int       `gorm:"column:group_id"`
		GroupName           string     `gorm:"column:group_name"`
		Status              string     `gorm:"column:status"`
		IsMonitored         bool       `gorm:"column:is_monitored"`
		CPUUsage            *float64   `gorm:"column:cpu_usage"`
		MemoryUsage         *float64   `gorm:"column:memory_usage"`
		Temperature         *float64   `gorm:"column:temperature"`
		Uptime              *int64     `gorm:"column:uptime"`
		ResponseTime        *float64   `gorm:"column:response_time"`
		LastSeen            *time.Time `gorm:"column:last_seen"`
		ICMPStatus          *string    `gorm:"column:icmp_status"`
		SNMPStatus          *string    `gorm:"column:snmp_status"`
		CLIProtocol         *string    `gorm:"column:cli_protocol"`
		LastErrorCode       string     `gorm:"column:last_error_code"`
		ConsecutiveFailures int        `gorm:"column:consecutive_failures"`
		BackoffUntil        *time.Time `gorm:"column:backoff_until"`
		LastSuccessAt       *time.Time `gorm:"column:last_success_at"`
		LastDurationMS      int        `gorm:"column:last_duration_ms"`
	}

	rows := make([]hostRow, 0, pageSize)
	offset := (page - 1) * pageSize
	if err := query.Select(`
		d.id, d.name, d.ip_address, d.hostname, d.detected_sys_name, d.device_type, d.vendor, d.model,
		d.group_id, COALESCE(dg.name, '') AS group_name, d.status, d.is_monitored,
		d.cpu_usage, d.memory_usage, d.temperature, d.uptime, d.response_time, d.last_seen,
		d.icmp_status, d.snmp_status, d.cli_protocol,
		COALESCE(cs.last_error_code, '') AS last_error_code,
		COALESCE(cs.consecutive_failures, 0) AS consecutive_failures,
		cs.backoff_until, cs.last_success_at, COALESCE(cs.last_duration_ms, 0) AS last_duration_ms
	`).
		Order(orderClause).
		Limit(pageSize).
		Offset(offset).
		Scan(&rows).Error; err != nil {
		return resp, err
	}

	pageDeviceIDs := make([]int, 0, len(rows))
	for _, r := range rows {
		pageDeviceIDs = append(pageDeviceIDs, r.ID)
	}

	now := time.Now().UTC()
	pinnedMap := w.queryPinnedSet(ctx, filter.UserID, pageDeviceIDs)
	maintMap, _ := w.GetActiveMaintenanceMapForDevices(ctx, now)
	ifaceStatsMap := w.queryInterfaceCounts(ctx, pageDeviceIDs)
	hwFaultMap := w.queryHardwareFaultCounts(ctx, pageDeviceIDs)
	sparklineMap := w.queryPageSparklines(ctx, pageDeviceIDs)

	var alertCountsMap map[int][3]int
	if filter.CanReadAlerts {
		alertCountsMap = w.queryActiveAlertCounts(ctx, pageDeviceIDs)
	}
	var inspMap map[int]HostInspectionSummary
	if filter.CanReadInspections {
		inspMap = w.queryLatestInspections(ctx, pageDeviceIDs)
	}
	var logCountsMap map[int][2]int
	if filter.CanReadLogs {
		logCountsMap = w.query24hLogCounts(ctx, pageDeviceIDs)
	}

	items := make([]HostMatrixItem, 0, len(rows))
	for _, r := range rows {
		icmpStr := derefStr(r.ICMPStatus, "unknown")
		snmpStr := derefStr(r.SNMPStatus, "unknown")
		cliStr := derefStr(r.CLIProtocol, "")
		inBackoff := r.BackoffUntil != nil && r.BackoffUntil.After(now)
		ifaceStat := ifaceStatsMap[r.ID]
		sp := sparklineMap[r.ID]
		if sp == nil {
			sp = []HostSparklinePoint{}
		}

		item := HostMatrixItem{
			ID:          r.ID,
			Name:        r.Name,
			IPAddress:   r.IPAddress,
			Hostname:    resolveEffectiveHostname(r.Hostname, r.DetectedSysName),
			DeviceType:  r.DeviceType,
			Vendor:      r.Vendor,
			Model:       r.Model,
			GroupID:     r.GroupID,
			GroupName:   r.GroupName,
			Status:      r.Status,
			IsMonitored: r.IsMonitored,
			IsPinned:    pinnedMap[r.ID],
			InMaintenance: func() bool {
				_, ok := maintMap[r.ID]
				return ok
			}(),
			Maintenance: func() *ActiveMaintenance {
				if am, ok := maintMap[r.ID]; ok {
					copyAM := am
					return &copyAM
				}
				return nil
			}(),
			CPUUsage:     r.CPUUsage,
			MemoryUsage:  r.MemoryUsage,
			Temperature:  r.Temperature,
			Uptime:       r.Uptime,
			ResponseTime: r.ResponseTime,
			LastSeen:     r.LastSeen,
			Protocols: HostProtocolSummary{
				ICMPStatus:    icmpStr,
				SNMPStatus:    snmpStr,
				CLIProtocol:   cliStr,
				ICMPHealthy:   strings.EqualFold(icmpStr, "online"),
				SNMPHealthy:   strings.EqualFold(snmpStr, "success"),
				CLIConfigured: cliStr != "",
			},
			CollectionState: HostCollectionStateView{
				LastErrorCode:       r.LastErrorCode,
				LastErrorMessage:    SafeCollectionErrorMessage(r.LastErrorCode),
				ConsecutiveFailures: r.ConsecutiveFailures,
				BackoffUntil:        r.BackoffUntil,
				InBackoff:           inBackoff,
				LastSuccessAt:       r.LastSuccessAt,
				LastDurationMS:      r.LastDurationMS,
			},
			InterfacesUp:       ifaceStat[0],
			InterfacesTotal:    ifaceStat[1],
			HardwareFaultCount: hwFaultMap[r.ID],
			Sparkline:          sp,
		}

		if filter.CanReadAlerts {
			counts := alertCountsMap[r.ID]
			totalA, critA, warnA := counts[0], counts[1], counts[2]
			item.ActiveAlertCount = &totalA
			item.CriticalAlertCount = &critA
			item.WarningAlertCount = &warnA
		}
		if filter.CanReadInspections {
			if insp, ok := inspMap[r.ID]; ok {
				s := insp.Score
				item.LatestInspectionScore = &s
				item.LatestInspectionAt = insp.CompletedAt
			}
		}
		if filter.CanReadLogs {
			lc := logCountsMap[r.ID]
			errCnt, trapCnt := lc[0], lc[1]
			item.ErrorLogCount24h = &errCnt
			item.TrapLogCount24h = &trapCnt
		}

		items = append(items, item)
	}
	resp.Items = items
	return resp, nil
}

// resolveHostsOrderClause 严格白名单映射排序字段，杜绝 SQL 注入。
func resolveHostsOrderClause(sortBy, sortOrder string, canReadAlerts bool) string {
	orderDir := "ASC"
	if strings.EqualFold(strings.TrimSpace(sortOrder), "desc") {
		orderDir = "DESC"
	}

	key := strings.ToLower(strings.TrimSpace(sortBy))
	whitelist := map[string]string{
		"name":          "d.name",
		"ip_address":    "d.ip_address",
		"status":        "d.status",
		"cpu_usage":     "COALESCE(d.cpu_usage, -1)",
		"memory_usage":  "COALESCE(d.memory_usage, -1)",
		"temperature":   "COALESCE(d.temperature, -999)",
		"response_time": "COALESCE(d.response_time, 999999)",
		"uptime":        "COALESCE(d.uptime, -1)",
		"last_seen":     "COALESCE(d.last_seen, '1970-01-01T00:00:00Z'::timestamptz)",
	}
	if col, ok := whitelist[key]; ok {
		return fmt.Sprintf("%s %s, d.id ASC", col, orderDir)
	}
	if key == "alert_count" && canReadAlerts {
		return fmt.Sprintf("COALESCE(d.alert_count, 0) %s, d.id ASC", orderDir)
	}

	// 默认异常优先权重：离线(1) -> 严重告警/高负载(2) -> 警告/采集失败(3) -> 维护中(4) -> 正常(5)
	if canReadAlerts {
		return `CASE
			WHEN LOWER(d.status) = 'offline' THEN 1
			WHEN LOWER(d.status) = 'critical' OR COALESCE(d.cpu_usage, 0) >= 90 OR COALESCE(d.memory_usage, 0) >= 90 OR EXISTS (SELECT 1 FROM alerts AS a WHERE a.device_id = d.id AND ` + activeAlertAliasStatusClause + ` AND LOWER(a.severity) = 'critical') THEN 2
			WHEN LOWER(d.status) = 'warning' OR COALESCE(cs.consecutive_failures, 0) > 0 OR COALESCE(d.cpu_usage, 0) >= 80 OR COALESCE(d.memory_usage, 0) >= 80 OR EXISTS (SELECT 1 FROM alerts AS a WHERE a.device_id = d.id AND ` + activeAlertAliasStatusClause + `) THEN 3
			WHEN LOWER(d.status) = 'maintenance' THEN 4
			ELSE 5
		END ASC, COALESCE(d.cpu_usage, 0) DESC, d.id ASC`
	}
	return `CASE
		WHEN LOWER(d.status) = 'offline' THEN 1
		WHEN LOWER(d.status) = 'critical' OR COALESCE(d.cpu_usage, 0) >= 90 OR COALESCE(d.memory_usage, 0) >= 90 THEN 2
		WHEN LOWER(d.status) = 'warning' OR COALESCE(cs.consecutive_failures, 0) > 0 OR COALESCE(d.cpu_usage, 0) >= 80 OR COALESCE(d.memory_usage, 0) >= 80 THEN 3
		WHEN LOWER(d.status) = 'maintenance' THEN 4
		ELSE 5
	END ASC, COALESCE(d.cpu_usage, 0) DESC, d.id ASC`
}

// GetHostDetail 返回单机全景下钻详情，严格执行跨模块独立 RBAC 门控。
func (w *MetricsWriter) GetHostDetail(
	ctx context.Context,
	deviceID int,
	userID string,
	canReadAlerts bool,
	canReadInspections bool,
	canReadLogs bool,
) (HostDetailResponse, error) {
	perms := buildCrossModulePermissions(canReadAlerts, canReadInspections, canReadLogs)
	resp := HostDetailResponse{
		Interfaces:          []HostInterfaceDetail{},
		SNMPExtensions:      newSNMPExtensionsResponse(deviceID),
		Neighbors:           []HostNeighborSummary{},
		RecentLogs:          []HostLogSummary{},
		ActiveAlerts:        []HostActiveAlertSummary{},
		Thresholds:          defaultThresholdSummary(),
		LimitedByPermission: !canReadAlerts || !canReadInspections || !canReadLogs,
		Permissions:         perms,
	}
	if w == nil || w.db == nil {
		return resp, fmt.Errorf("database not initialized")
	}

	type devRow struct {
		ID                  int        `gorm:"column:id"`
		Name                string     `gorm:"column:name"`
		IPAddress           string     `gorm:"column:ip_address"`
		Hostname            *string    `gorm:"column:hostname"`
		DetectedSysName     *string    `gorm:"column:detected_sys_name"`
		DeviceType          string     `gorm:"column:device_type"`
		Vendor              string     `gorm:"column:vendor"`
		Model               *string    `gorm:"column:model"`
		SerialNumber        *string    `gorm:"column:serial_number"`
		FirmwareVersion     *string    `gorm:"column:firmware_version"`
		Location            *string    `gorm:"column:location"`
		TopologyRole        string     `gorm:"column:topology_role"`
		GroupID             *int       `gorm:"column:group_id"`
		GroupName           string     `gorm:"column:group_name"`
		Status              string     `gorm:"column:status"`
		IsMonitored         bool       `gorm:"column:is_monitored"`
		CPUUsage            *float64   `gorm:"column:cpu_usage"`
		MemoryUsage         *float64   `gorm:"column:memory_usage"`
		Temperature         *float64   `gorm:"column:temperature"`
		Uptime              *int64     `gorm:"column:uptime"`
		ResponseTime        *float64   `gorm:"column:response_time"`
		LastSeen            *time.Time `gorm:"column:last_seen"`
		ICMPStatus          *string    `gorm:"column:icmp_status"`
		SNMPStatus          *string    `gorm:"column:snmp_status"`
		CLIProtocol         *string    `gorm:"column:cli_protocol"`
		LastErrorCode       string     `gorm:"column:last_error_code"`
		ConsecutiveFailures int        `gorm:"column:consecutive_failures"`
		BackoffUntil        *time.Time `gorm:"column:backoff_until"`
		LastSuccessAt       *time.Time `gorm:"column:last_success_at"`
		LastDurationMS      int        `gorm:"column:last_duration_ms"`
	}

	var dev devRow
	err := w.db.WithContext(ctx).
		Table("devices AS d").
		Select(`
			d.id, d.name, d.ip_address, d.hostname, d.detected_sys_name, d.device_type, d.vendor, d.model,
			d.serial_number, d.firmware_version, d.location, COALESCE(d.topology_role, 'access') AS topology_role,
			d.group_id, COALESCE(dg.name, '') AS group_name, d.status, d.is_monitored,
			d.cpu_usage, d.memory_usage, d.temperature, d.uptime, d.response_time, d.last_seen,
			d.icmp_status, d.snmp_status, d.cli_protocol,
			COALESCE(cs.last_error_code, '') AS last_error_code,
			COALESCE(cs.consecutive_failures, 0) AS consecutive_failures,
			cs.backoff_until, cs.last_success_at, COALESCE(cs.last_duration_ms, 0) AS last_duration_ms
		`).
		Joins("LEFT JOIN device_groups AS dg ON dg.id = d.group_id").
		Joins("LEFT JOIN device_collection_states AS cs ON cs.device_id = d.id").
		Where("d.id = ?", deviceID).
		Take(&dev).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return resp, ErrDeviceNotFound
		}
		return resp, err
	}

	now := time.Now().UTC()
	pinnedMap := w.queryPinnedSet(ctx, userID, []int{deviceID})
	activeMaint, _ := w.GetActiveWindowForDevice(ctx, deviceID, dev.GroupID, now)
	ifaceStatsMap := w.queryInterfaceCounts(ctx, []int{deviceID})
	hwFaultMap := w.queryHardwareFaultCounts(ctx, []int{deviceID})
	icmpStr := derefStr(dev.ICMPStatus, "unknown")
	snmpStr := derefStr(dev.SNMPStatus, "unknown")
	cliStr := derefStr(dev.CLIProtocol, "")

	resp.Device = HostMatrixItem{
		ID:            dev.ID,
		Name:          dev.Name,
		IPAddress:     dev.IPAddress,
		Hostname:      resolveEffectiveHostname(dev.Hostname, dev.DetectedSysName),
		DeviceType:    dev.DeviceType,
		Vendor:        dev.Vendor,
		Model:         dev.Model,
		GroupID:       dev.GroupID,
		GroupName:     dev.GroupName,
		Status:        dev.Status,
		IsMonitored:   dev.IsMonitored,
		IsPinned:      pinnedMap[deviceID],
		InMaintenance: activeMaint != nil,
		Maintenance:   activeMaint,
		CPUUsage:      dev.CPUUsage,
		MemoryUsage:   dev.MemoryUsage,
		Temperature:   dev.Temperature,
		Uptime:        dev.Uptime,
		ResponseTime:  dev.ResponseTime,
		LastSeen:      dev.LastSeen,
		Protocols: HostProtocolSummary{
			ICMPStatus:    icmpStr,
			SNMPStatus:    snmpStr,
			CLIProtocol:   cliStr,
			ICMPHealthy:   strings.EqualFold(icmpStr, "online"),
			SNMPHealthy:   strings.EqualFold(snmpStr, "success"),
			CLIConfigured: cliStr != "",
		},
		CollectionState: HostCollectionStateView{
			LastErrorCode:       dev.LastErrorCode,
			LastErrorMessage:    SafeCollectionErrorMessage(dev.LastErrorCode),
			ConsecutiveFailures: dev.ConsecutiveFailures,
			BackoffUntil:        dev.BackoffUntil,
			InBackoff:           dev.BackoffUntil != nil && dev.BackoffUntil.After(now),
			LastSuccessAt:       dev.LastSuccessAt,
			LastDurationMS:      dev.LastDurationMS,
		},
		InterfacesUp:       ifaceStatsMap[deviceID][0],
		InterfacesTotal:    ifaceStatsMap[deviceID][1],
		HardwareFaultCount: hwFaultMap[deviceID],
		Sparkline:          []HostSparklinePoint{},
	}
	resp.FirmwareVersion = dev.FirmwareVersion
	resp.SerialNumber = normalizeOptionalString(dev.SerialNumber)
	resp.Location = dev.Location
	resp.TopologyRole = dev.TopologyRole

	// 全量接口矩阵
	var ifaces []HostInterfaceDetail
	if err := w.db.WithContext(ctx).
		Table("device_interfaces").
		Where("device_id = ?", deviceID).
		Order("COALESCE(is_up, false) DESC, name ASC").
		Scan(&ifaces).Error; err == nil && ifaces != nil {
		for i := range ifaces {
			ifaces[i].Alias = normalizeOptionalString(ifaces[i].Alias)
			ifaces[i].Description = normalizeOptionalString(ifaces[i].Description)
			ifaces[i].DisplayName = resolveInterfaceDisplayName(ifaces[i].Name, ifaces[i].Alias)
		}
		resp.Interfaces = ifaces
	}

	// SNMP 扩展（光模块/风扇电源/BGP/PoE/STP/磁盘）
	if ext, err := w.GetLatestSNMPExtensions(ctx, deviceID); err == nil {
		resp.SNMPExtensions = ext
	}

	// 直连 LLDP 邻居
	resp.Neighbors = w.queryDeviceNeighbors(ctx, deviceID)

	// 生效阈值摘要
	resp.Thresholds = w.loadEffectiveThresholds(ctx)

	// 门控 1：最近巡检评分
	if canReadInspections {
		inspMap := w.queryLatestInspections(ctx, []int{deviceID})
		if insp, ok := inspMap[deviceID]; ok {
			resp.LatestInspection = &insp
			s := insp.Score
			resp.Device.LatestInspectionScore = &s
			resp.Device.LatestInspectionAt = insp.CompletedAt
		}
	}

	// 门控 2：近 24h Error/Critical 与 Trap 日志摘要
	if canReadLogs {
		logCounts := w.query24hLogCounts(ctx, []int{deviceID})
		lc := logCounts[deviceID]
		errCnt, trapCnt := lc[0], lc[1]
		resp.ErrorLogCount24h = &errCnt
		resp.TrapLogCount24h = &trapCnt
		resp.Device.ErrorLogCount24h = &errCnt
		resp.Device.TrapLogCount24h = &trapCnt
		resp.RecentLogs = w.queryRecentAbnormalLogs(ctx, deviceID, 5)
	}

	// 门控 3：活跃告警
	if canReadAlerts {
		resp.ActiveAlerts = w.queryDeviceActiveAlerts(ctx, deviceID)
		cnt := len(resp.ActiveAlerts)
		resp.Device.ActiveAlertCount = &cnt
	}

	return resp, nil
}

type topNQueryRow struct {
	DeviceID       int     `gorm:"column:device_id"`
	DeviceName     string  `gorm:"column:device_name"`
	IPAddress      string  `gorm:"column:ip_address"`
	Status         string  `gorm:"column:status"`
	InterfaceName  string  `gorm:"column:interface_name"`
	InterfaceAlias *string `gorm:"column:interface_alias"`
	Val            float64 `gorm:"column:val"`
}

type topNDeviceMetricSpec struct {
	column      string
	whereClause string
	orderClause string
}

var topNUnitMap = map[string]string{
	"cpu":         "%",
	"memory":      "%",
	"temperature": "°C",
	"if_util":     "%",
	"if_errors":   "count",
	"ping_rtt":    "ms",
}

var topNDeviceMetricSpecs = map[string]topNDeviceMetricSpec{
	"cpu": {
		column:      "d.cpu_usage",
		whereClause: "d.cpu_usage IS NOT NULL AND d.cpu_usage >= 0 AND d.cpu_usage <= 100",
		orderClause: "d.cpu_usage DESC NULLS LAST, d.id ASC",
	},
	"memory": {
		column:      "d.memory_usage",
		whereClause: "d.memory_usage IS NOT NULL AND d.memory_usage >= 0 AND d.memory_usage <= 100",
		orderClause: "d.memory_usage DESC NULLS LAST, d.id ASC",
	},
	"temperature": {
		column:      "d.temperature",
		whereClause: "d.temperature IS NOT NULL AND d.temperature > -50 AND d.temperature <= 200",
		orderClause: "d.temperature DESC NULLS LAST, d.id ASC",
	},
	"ping_rtt": {
		column:      "d.response_time",
		whereClause: "LOWER(COALESCE(d.icmp_status, '')) <> 'offline' AND d.response_time IS NOT NULL AND d.response_time >= 0 AND d.response_time <= 60000",
		orderClause: "d.response_time DESC NULLS LAST, d.id ASC",
	},
}

type topNInterfaceMetricSpec struct {
	selectExpr  string
	whereClause string
}

var topNInterfaceMetricSpecs = map[string]topNInterfaceMetricSpec{
	"if_util": {
		selectExpr:  "GREATEST(COALESCE(di.utilization_in, 0), COALESCE(di.utilization_out, 0)) AS val",
		whereClause: "COALESCE(di.speed_unknown, false) = false AND " + topNInterfaceTrafficOnlyClause + " AND GREATEST(COALESCE(di.utilization_in, 0), COALESCE(di.utilization_out, 0)) > 0 AND GREATEST(COALESCE(di.utilization_in, 0), COALESCE(di.utilization_out, 0)) <= 100",
	},
	"if_errors": {
		selectExpr:  "(COALESCE(di.in_errors, 0) + COALESCE(di.out_errors, 0))::float8 AS val",
		whereClause: topNInterfaceTrafficOnlyClause + " AND (COALESCE(di.in_errors, 0) + COALESCE(di.out_errors, 0)) > 0",
	},
}

// QueryTopN 返回全网 TopN 排行（cpu|memory|temperature|if_util|if_errors|ping_rtt）。
func (w *MetricsWriter) QueryTopN(ctx context.Context, metric string, limit int, groupID *int, deviceIDs ...int) (TopNResponse, error) {
	m, unit, normalizedLimit, err := normalizeTopNMetricAndLimit(metric, limit)
	if err != nil {
		return TopNResponse{}, err
	}
	cleanDeviceIDs, err := sanitizeTopNDeviceIDs(deviceIDs)
	if err != nil {
		return TopNResponse{}, err
	}

	resp := TopNResponse{Metric: m, Unit: unit, Items: []TopNItem{}}
	if w == nil || w.db == nil {
		return resp, fmt.Errorf("database not initialized")
	}

	var groupIDs []int
	if groupID != nil && *groupID > 0 {
		groupIDs, err = w.resolveDescendantGroupIDs(ctx, *groupID)
		if err != nil {
			return resp, err
		}
		if len(groupIDs) == 0 {
			return resp, nil
		}
	}

	rows, err := w.fetchTopNRows(ctx, m, normalizedLimit, groupIDs, cleanDeviceIDs)
	if err != nil {
		return resp, err
	}
	resp.Items = buildTopNItems(m, unit, rows)
	return resp, nil
}

func normalizeTopNMetricAndLimit(metric string, limit int) (string, string, int, error) {
	m := strings.ToLower(strings.TrimSpace(metric))
	if m == "" {
		m = "cpu"
	}
	unit, ok := topNUnitMap[m]
	if !ok {
		return "", "", 0, fmt.Errorf("unsupported topn metric: %s", metric)
	}
	if limit <= 0 {
		limit = DefaultTopNLimit
	}
	if limit > MaxTopNLimit {
		limit = MaxTopNLimit
	}
	return m, unit, limit, nil
}

func sanitizeTopNDeviceIDs(raw []int) ([]int, error) {
	if len(raw) == 0 {
		return nil, nil
	}
	seen := make(map[int]struct{}, len(raw))
	out := make([]int, 0, len(raw))
	for _, id := range raw {
		if id <= 0 {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
		if len(out) > MaxTopNDeviceIDs {
			return nil, fmt.Errorf("device_ids count exceeds max %d", MaxTopNDeviceIDs)
		}
	}
	if len(out) == 0 {
		return nil, nil
	}
	return out, nil
}

func applyTopNDeviceScope(q *gorm.DB, groupIDs, deviceIDs []int) *gorm.DB {
	if len(groupIDs) > 0 {
		q = q.Where("d.group_id IN ?", groupIDs)
	}
	if len(deviceIDs) > 0 {
		q = q.Where("d.id IN ?", deviceIDs)
	}
	return q
}

func (w *MetricsWriter) fetchTopNRows(ctx context.Context, metric string, limit int, groupIDs, deviceIDs []int) ([]topNQueryRow, error) {
	if spec, ok := topNDeviceMetricSpecs[metric]; ok {
		q := w.db.WithContext(ctx).
			Table("devices AS d").
			Select(fmt.Sprintf("d.id AS device_id, d.name AS device_name, d.ip_address, d.status, '' AS interface_name, %s AS val", spec.column)).
			Where(topNActiveDeviceClause, true).
			Where(spec.whereClause)
		q = applyTopNDeviceScope(q, groupIDs, deviceIDs)
		var rows []topNQueryRow
		if err := q.Order(spec.orderClause).Limit(limit).Scan(&rows).Error; err != nil {
			return nil, err
		}
		return rows, nil
	}

	if spec, ok := topNInterfaceMetricSpecs[metric]; ok {
		q := w.db.WithContext(ctx).
			Table("device_interfaces AS di").
			Select("d.id AS device_id, d.name AS device_name, d.ip_address, d.status, di.name AS interface_name, di.alias AS interface_alias, "+spec.selectExpr).
			Joins("JOIN devices AS d ON d.id = di.device_id").
			Where(topNActiveDeviceClause, true).
			Where("di.lld_monitored = ? AND COALESCE(di.is_up, false) = true", true).
			Where(spec.whereClause)
		q = applyTopNDeviceScope(q, groupIDs, deviceIDs)
		var rows []topNQueryRow
		if err := q.Order("val DESC NULLS LAST, d.id ASC, di.id ASC").Limit(limit).Scan(&rows).Error; err != nil {
			return nil, err
		}
		return rows, nil
	}

	return nil, fmt.Errorf("unsupported topn metric: %s", metric)
}

func buildTopNItems(metric, unit string, rows []topNQueryRow) []TopNItem {
	items := make([]TopNItem, 0, len(rows))
	isInterfaceMetric := metric == "if_util" || metric == "if_errors"
	for _, r := range rows {
		normalized, ok := normalizeTopNValue(metric, r.Val)
		if !ok {
			continue
		}
		item := TopNItem{
			DeviceID:      r.DeviceID,
			DeviceName:    r.DeviceName,
			IPAddress:     r.IPAddress,
			Status:        r.Status,
			InterfaceName: r.InterfaceName,
			Value:         normalized,
			Unit:          unit,
			DisplayValue:  formatTopNDisplayValue(metric, normalized),
		}
		if isInterfaceMetric {
			item.InterfaceDisplayName = resolveInterfaceDisplayName(r.InterfaceName, r.InterfaceAlias)
		}
		items = append(items, item)
	}
	return items
}

func normalizeTopNValue(metric string, val float64) (float64, bool) {
	if math.IsNaN(val) || math.IsInf(val, 0) {
		return 0, false
	}
	switch metric {
	case "cpu", "memory":
		clamped := clampFloat(val, 0, 100)
		return normalizeSignedZero(math.Round(clamped*100) / 100), true
	case "if_util":
		clamped := clampFloat(val, 0, 100)
		if clamped > 0 && clamped < 0.01 {
			rounded := math.Round(clamped*10000) / 10000
			if rounded == 0 {
				return 0.0001, true
			}
			return rounded, true
		}
		return normalizeSignedZero(math.Round(clamped*100) / 100), true
	case "if_errors":
		return normalizeSignedZero(math.Round(val)), true
	default:
		return normalizeSignedZero(math.Round(val*100) / 100), true
	}
}

func formatTopNDisplayValue(metric string, val float64) string {
	switch metric {
	case "cpu", "memory":
		return formatCompactFloat(clampFloat(val, 0, 100), 2) + "%"
	case "if_util":
		clamped := clampFloat(val, 0, 100)
		if clamped > 0 && clamped < 0.01 {
			return "< 0.01%"
		}
		return formatCompactFloat(clamped, 2) + "%"
	case "temperature":
		return formatCompactFloat(val, 1) + "°C"
	case "ping_rtt":
		if val > 0 && val < 0.1 {
			return "< 0.1 ms"
		}
		return formatCompactFloat(val, 1) + " ms"
	case "if_errors":
		return fmt.Sprintf("%d 个", int64(math.Round(val)))
	default:
		return formatCompactFloat(val, 2)
	}
}

func clampFloat(v, minVal, maxVal float64) float64 {
	if v < minVal {
		return minVal
	}
	if v > maxVal {
		return maxVal
	}
	return v
}

func normalizeSignedZero(v float64) float64 {
	if v == 0 {
		return 0
	}
	return v
}

func buildCrossModulePermissions(canAlerts, canInspections, canLogs bool) CrossModulePermissions {
	return CrossModulePermissions{
		Alerts: ModulePermissionStatus{
			Allowed:             canAlerts,
			LimitedByPermission: !canAlerts,
			RequiredPermission:  conditionalPerm(canAlerts, "alerts:read"),
		},
		Inspections: ModulePermissionStatus{
			Allowed:             canInspections,
			LimitedByPermission: !canInspections,
			RequiredPermission:  conditionalPerm(canInspections, "inspections:read"),
		},
		Logs: ModulePermissionStatus{
			Allowed:             canLogs,
			LimitedByPermission: !canLogs,
			RequiredPermission:  conditionalPerm(canLogs, "system:logs"),
		},
	}
}

func conditionalPerm(allowed bool, key string) string {
	if allowed {
		return ""
	}
	return key
}

var syntheticInterfaceNameRe = regexp.MustCompile(`(?i)^if\d+$`)

func isSyntheticInterfaceName(name string) bool {
	return syntheticInterfaceNameRe.MatchString(strings.TrimSpace(name))
}

func resolveInterfaceDisplayName(name string, alias *string) string {
	if normalized := normalizeOptionalString(alias); normalized != nil {
		return *normalized
	}
	trimmed := strings.TrimSpace(name)
	if trimmed != "" && !isSyntheticInterfaceName(trimmed) {
		return trimmed
	}
	return ""
}

func normalizeOptionalString(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func resolveEffectiveHostname(hostname, detectedSysName *string) *string {
	if normalized := normalizeOptionalString(hostname); normalized != nil {
		return normalized
	}
	return normalizeOptionalString(detectedSysName)
}

func derefStr(ptr *string, fallback string) string {
	if ptr == nil || strings.TrimSpace(*ptr) == "" {
		return fallback
	}
	return strings.TrimSpace(*ptr)
}

func (w *MetricsWriter) queryPinnedSet(ctx context.Context, userID string, deviceIDs []int) map[int]bool {
	res := make(map[int]bool)
	if strings.TrimSpace(userID) == "" || len(deviceIDs) == 0 {
		return res
	}
	var ids []int
	if err := w.db.WithContext(ctx).
		Table("user_pinned_devices").
		Where("user_id = ? AND device_id IN ?", userID, deviceIDs).
		Pluck("device_id", &ids).Error; err == nil {
		for _, id := range ids {
			res[id] = true
		}
	}
	return res
}

func (w *MetricsWriter) queryInterfaceCounts(ctx context.Context, deviceIDs []int) map[int][2]int {
	res := make(map[int][2]int)
	if len(deviceIDs) == 0 {
		return res
	}
	type row struct {
		DeviceID int `gorm:"column:device_id"`
		UpCnt    int `gorm:"column:up_cnt"`
		TotalCnt int `gorm:"column:total_cnt"`
	}
	var rows []row
	if err := w.db.WithContext(ctx).
		Table("device_interfaces").
		Select("device_id, SUM(CASE WHEN COALESCE(is_up, false) THEN 1 ELSE 0 END) AS up_cnt, COUNT(*) AS total_cnt").
		Where("device_id IN ? AND lld_monitored = ?", deviceIDs, true).
		Group("device_id").
		Scan(&rows).Error; err == nil {
		for _, r := range rows {
			res[r.DeviceID] = [2]int{r.UpCnt, r.TotalCnt}
		}
	}
	return res
}

func (w *MetricsWriter) queryHardwareFaultCounts(ctx context.Context, deviceIDs []int) map[int]int {
	res := make(map[int]int)
	if len(deviceIDs) == 0 {
		return res
	}
	type row struct {
		DeviceID int      `gorm:"column:device_id"`
		Val      *float64 `gorm:"column:metric_value"`
	}
	var rows []row
	if err := w.db.WithContext(ctx).
		Table("device_latest_metrics").
		Select("device_id, metric_value").
		Where("device_id IN ? AND metric_name = 'hardware_fault_count'", deviceIDs).
		Scan(&rows).Error; err == nil {
		for _, r := range rows {
			if r.Val != nil && *r.Val > 0 {
				res[r.DeviceID] = int(*r.Val)
			}
		}
	}
	return res
}

// queryPageSparklines 仅对当前页设备查询最近 12 点 CPU Sparkline 摘要（绝不全库拉历史）。
func (w *MetricsWriter) queryPageSparklines(ctx context.Context, deviceIDs []int) map[int][]HostSparklinePoint {
	res := make(map[int][]HostSparklinePoint)
	if len(deviceIDs) == 0 {
		return res
	}
	type row struct {
		DeviceID    int       `gorm:"column:device_id"`
		CollectedAt time.Time `gorm:"column:collected_at"`
		MetricValue *float64  `gorm:"column:metric_value"`
	}
	var rows []row
	err := w.db.WithContext(ctx).Raw(`
		SELECT device_id, collected_at, metric_value
		FROM (
			SELECT device_id, collected_at, metric_value,
				ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY collected_at DESC) AS rn
			FROM device_metrics
			WHERE device_id IN ? AND metric_name = 'cpu_usage'
		) ranked
		WHERE rn <= ?
		ORDER BY device_id ASC, collected_at ASC
	`, deviceIDs, SparklinePointLimit).Scan(&rows).Error
	if err != nil {
		return res
	}
	for _, r := range rows {
		res[r.DeviceID] = append(res[r.DeviceID], HostSparklinePoint{
			Timestamp: r.CollectedAt.UTC(),
			CPU:       r.MetricValue,
		})
	}
	return res
}

func (w *MetricsWriter) queryActiveAlertCounts(ctx context.Context, deviceIDs []int) map[int][3]int {
	res := make(map[int][3]int)
	if len(deviceIDs) == 0 {
		return res
	}
	type row struct {
		DeviceID int `gorm:"column:device_id"`
		Total    int `gorm:"column:total_cnt"`
		Critical int `gorm:"column:crit_cnt"`
		Warning  int `gorm:"column:warn_cnt"`
	}
	var rows []row
	if err := w.db.WithContext(ctx).
		Table("alerts").
		Select(`device_id,
			COUNT(*) AS total_cnt,
			SUM(CASE WHEN LOWER(severity) = 'critical' THEN 1 ELSE 0 END) AS crit_cnt,
			SUM(CASE WHEN LOWER(severity) IN ('warning', 'high', 'medium') THEN 1 ELSE 0 END) AS warn_cnt`).
		Where("device_id IN ? AND "+activeAlertStatusClause, deviceIDs).
		Group("device_id").
		Scan(&rows).Error; err == nil {
		for _, r := range rows {
			res[r.DeviceID] = [3]int{r.Total, r.Critical, r.Warning}
		}
	}
	return res
}

func (w *MetricsWriter) queryLatestInspections(ctx context.Context, deviceIDs []int) map[int]HostInspectionSummary {
	res := make(map[int]HostInspectionSummary)
	if len(deviceIDs) == 0 {
		return res
	}
	type row struct {
		ID            int        `gorm:"column:id"`
		DeviceID      int        `gorm:"column:device_id"`
		Status        string     `gorm:"column:status"`
		TotalChecks   int        `gorm:"column:total_checks"`
		PassedChecks  int        `gorm:"column:passed_checks"`
		FailedChecks  int        `gorm:"column:failed_checks"`
		WarningChecks int        `gorm:"column:warning_checks"`
		CompletedAt   *time.Time `gorm:"column:completed_at"`
	}
	var rows []row
	if err := w.db.WithContext(ctx).Raw(`
		SELECT DISTINCT ON (device_id)
			id, device_id, status, total_checks, passed_checks, failed_checks, warning_checks, completed_at
		FROM inspections
		WHERE device_id IN ?
		ORDER BY device_id, COALESCE(completed_at, created_at) DESC, id DESC
	`, deviceIDs).Scan(&rows).Error; err == nil {
		for _, r := range rows {
			score := 0.0
			if r.TotalChecks > 0 {
				score = math.Round((float64(r.PassedChecks)/float64(r.TotalChecks))*1000) / 10
			}
			res[r.DeviceID] = HostInspectionSummary{
				InspectionID:  r.ID,
				Status:        r.Status,
				Score:         score,
				TotalChecks:   r.TotalChecks,
				PassedChecks:  r.PassedChecks,
				FailedChecks:  r.FailedChecks,
				WarningChecks: r.WarningChecks,
				CompletedAt:   r.CompletedAt,
			}
		}
	}
	return res
}

func (w *MetricsWriter) query24hLogCounts(ctx context.Context, deviceIDs []int) map[int][2]int {
	res := make(map[int][2]int)
	if len(deviceIDs) == 0 {
		return res
	}
	since := time.Now().UTC().Add(-24 * time.Hour)
	type row struct {
		DeviceID int `gorm:"column:device_id"`
		ErrCnt   int `gorm:"column:err_cnt"`
		TrapCnt  int `gorm:"column:trap_cnt"`
	}
	var rows []row
	if err := w.db.WithContext(ctx).
		Table("device_logs").
		Select(`device_id,
			SUM(CASE WHEN LOWER(level) IN ('error', 'critical') THEN 1 ELSE 0 END) AS err_cnt,
			SUM(CASE WHEN LOWER(source) = 'trap' THEN 1 ELSE 0 END) AS trap_cnt`).
		Where("device_id IN ? AND self_generated = ? AND log_timestamp >= ?", deviceIDs, false, since).
		Group("device_id").
		Scan(&rows).Error; err == nil {
		for _, r := range rows {
			res[r.DeviceID] = [2]int{r.ErrCnt, r.TrapCnt}
		}
	}
	return res
}

func (w *MetricsWriter) queryRecentAbnormalLogs(ctx context.Context, deviceID int, limit int) []HostLogSummary {
	since := time.Now().UTC().Add(-24 * time.Hour)
	var rows []HostLogSummary
	if err := w.db.WithContext(ctx).
		Table("device_logs").
		Select("id, level, source, message, log_timestamp").
		Where("device_id = ? AND self_generated = ? AND log_timestamp >= ? AND (LOWER(level) IN ('error', 'critical') OR LOWER(source) = 'trap')", deviceID, false, since).
		Order("log_timestamp DESC, id DESC").
		Limit(limit).
		Scan(&rows).Error; err != nil || rows == nil {
		return []HostLogSummary{}
	}
	return rows
}

func (w *MetricsWriter) queryDeviceNeighbors(ctx context.Context, deviceID int) []HostNeighborSummary {
	type row struct {
		LocalPortID   *string   `gorm:"column:local_port_id"`
		LocalPortDesc *string   `gorm:"column:local_port_desc"`
		RemoteSysName *string   `gorm:"column:remote_sys_name"`
		RemoteChassis string    `gorm:"column:remote_chassis_id"`
		RemotePortID  *string   `gorm:"column:remote_port_id"`
		RemoteMgmtIP  *string   `gorm:"column:remote_mgmt_ip"`
		CollectedAt   time.Time `gorm:"column:collected_at"`
	}
	var rows []row
	if err := w.db.WithContext(ctx).
		Table("device_neighbors").
		Select("local_port_id, local_port_desc, remote_sys_name, remote_chassis_id, remote_port_id, remote_mgmt_ip, collected_at").
		Where("device_id = ?", deviceID).
		Order("local_port_num ASC, id ASC").
		Scan(&rows).Error; err != nil || len(rows) == 0 {
		return []HostNeighborSummary{}
	}

	out := make([]HostNeighborSummary, 0, len(rows))
	for _, r := range rows {
		localPort := derefStr(r.LocalPortID, derefStr(r.LocalPortDesc, "-"))
		remoteName := derefStr(r.RemoteSysName, r.RemoteChassis)
		remotePort := derefStr(r.RemotePortID, "")
		out = append(out, HostNeighborSummary{
			LocalPort:    localPort,
			RemoteName:   remoteName,
			RemotePort:   remotePort,
			RemoteMgmtIP: r.RemoteMgmtIP,
			CollectedAt:  r.CollectedAt.UTC(),
		})
	}
	return out
}

func (w *MetricsWriter) queryDeviceActiveAlerts(ctx context.Context, deviceID int) []HostActiveAlertSummary {
	var rows []HostActiveAlertSummary
	if err := w.db.WithContext(ctx).
		Table("alerts").
		Select("id, title, severity, status, metric_name, current_value, threshold_value, first_occurred, last_occurred, snoozed_until").
		Where("device_id = ? AND "+activeAlertStatusClause, deviceID).
		Order("last_occurred DESC, id DESC").
		Scan(&rows).Error; err != nil || rows == nil {
		return []HostActiveAlertSummary{}
	}
	return rows
}
