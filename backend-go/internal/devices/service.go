package devices

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"go.uber.org/zap"
	"gorm.io/gorm"
)

const (
	defaultSnmpCommunity   = "public"
	defaultSnmpVersion     = "2c"
	defaultSnmpPort        = 161
	defaultSshPort         = 22
	defaultTelnetPort      = 23
	defaultCliProtocol     = "none"
	defaultStatus          = "unknown"
	defaultMonitorInterval = 300
)

type Service struct {
	db     *gorm.DB
	logger *zap.Logger
}

func NewService(db *gorm.DB, logger *zap.Logger) *Service {
	return &Service{
		db:     db,
		logger: logger,
	}
}

func (s *Service) GetDeviceByID(ctx context.Context, deviceID int) (*DeviceResponse, error) {
	if s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	device, err := s.GetDeviceRecord(ctx, deviceID)
	if err != nil {
		return nil, err
	}

	response := buildDeviceResponse(device, nil)
	return &response, nil
}

func (s *Service) GetDeviceRecord(ctx context.Context, deviceID int) (Device, error) {
	var device Device
	if s.db == nil {
		return device, fmt.Errorf("database not initialized")
	}
	if err := s.db.WithContext(ctx).Table("devices").Where("id = ?", deviceID).Take(&device).Error; err != nil {
		return device, err
	}
	return device, nil
}

func (s *Service) GetDevices(
	ctx context.Context,
	page int,
	pageSize int,
	deviceType string,
	status string,
	groupID *int,
	search string,
	isActive *bool,
	includeAlertCount bool,
) ([]DeviceResponse, int, error) {
	if s.db == nil {
		return nil, 0, fmt.Errorf("database not initialized")
	}

	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 20
	}

	base := s.db.WithContext(ctx).Table("devices")
	base = applyDeviceFilters(base, deviceType, status, groupID, search, isActive)

	var total int64
	if err := base.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var rows []Device
	if err := base.Order("created_at desc").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&rows).Error; err != nil {
		return nil, 0, err
	}

	alertCounts := map[int]int{}
	if includeAlertCount && len(rows) > 0 {
		ids := make([]int, 0, len(rows))
		for _, item := range rows {
			ids = append(ids, item.ID)
		}
		counts, err := s.loadAlertCounts(ctx, ids)
		if err != nil && s.logger != nil {
			s.logger.Warn("load device alert counts failed", zap.Error(err))
		} else {
			alertCounts = counts
		}
	}

	result := make([]DeviceResponse, 0, len(rows))
	for _, item := range rows {
		var countPtr *int
		if value, ok := alertCounts[item.ID]; ok {
			v := value
			countPtr = &v
		}
		result = append(result, buildDeviceResponse(item, countPtr))
	}

	return result, int(total), nil
}

func (s *Service) CreateDevice(ctx context.Context, req DeviceCreateRequest, createdBy string) (*DeviceResponse, error) {
	if s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	name := strings.TrimSpace(req.Name)
	ip := strings.TrimSpace(req.IPAddress)
	deviceType := strings.TrimSpace(req.DeviceType)
	vendor := strings.TrimSpace(req.Vendor)
	if name == "" || ip == "" || deviceType == "" || vendor == "" {
		return nil, fmt.Errorf("name, ip_address, device_type, vendor are required")
	}

	exists, err := s.checkIPExists(ctx, ip, 0)
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, fmt.Errorf("ip address already exists")
	}

	snmpVersion := defaultSnmpVersion
	if req.SnmpVersion != nil && strings.TrimSpace(*req.SnmpVersion) != "" {
		snmpVersion = sanitizeSnmpVersion(*req.SnmpVersion)
	}

	snmpCommunity := req.SnmpCommunity
	if snmpCommunity == nil || strings.TrimSpace(*snmpCommunity) == "" {
		value := defaultSnmpCommunity
		snmpCommunity = &value
	}

	snmpPort := req.SnmpPort
	if snmpPort == nil || *snmpPort <= 0 {
		value := defaultSnmpPort
		snmpPort = &value
	}

	sshPort := req.SshPort
	if sshPort == nil || *sshPort <= 0 {
		value := defaultSshPort
		sshPort = &value
	}

	telnetPort := req.TelnetPort
	if telnetPort == nil || *telnetPort <= 0 {
		value := defaultTelnetPort
		telnetPort = &value
	}

	cliProtocol := req.CliProtocol
	if cliProtocol == nil || strings.TrimSpace(*cliProtocol) == "" {
		value := defaultCliProtocol
		cliProtocol = &value
	}

	tags, err := encodeTags(req.Tags)
	if err != nil {
		return nil, err
	}

	device := Device{
		Name:            name,
		IPAddress:       ip,
		DeviceType:      deviceType,
		Vendor:          vendor,
		Model:           req.Model,
		Location:        req.Location,
		GroupID:         req.GroupID,
		SnmpCommunity:   snmpCommunity,
		SnmpVersion:     &snmpVersion,
		SnmpPort:        snmpPort,
		CliProtocol:     cliProtocol,
		SshUsername:     req.SshUsername,
		SshPassword:     req.SshPassword,
		SshPort:         sshPort,
		TelnetUsername:  req.TelnetUsername,
		TelnetPassword:  req.TelnetPassword,
		TelnetPort:      telnetPort,
		EnablePassword:  req.EnablePassword,
		Status:          defaultStatus,
		IsActive:        true,
		IsMonitored:     true,
		MonitorInterval: defaultMonitorInterval,
		Description:     req.Description,
		Tags:            tags,
	}
	if strings.TrimSpace(createdBy) != "" {
		device.CreatedBy = &createdBy
	}

	if err := s.db.WithContext(ctx).Create(&device).Error; err != nil {
		return nil, err
	}

	response := buildDeviceResponse(device, nil)
	return &response, nil
}

func (s *Service) UpdateDevice(ctx context.Context, deviceID int, updates map[string]interface{}) (*DeviceResponse, error) {
	if s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	var device Device
	if err := s.db.WithContext(ctx).Table("devices").Where("id = ?", deviceID).Take(&device).Error; err != nil {
		return nil, err
	}

	if ipRaw, ok := updates["ip_address"]; ok {
		if ip, ok := ipRaw.(string); ok {
			ip = strings.TrimSpace(ip)
			if ip == "" {
				return nil, fmt.Errorf("ip_address cannot be empty")
			}
			exists, err := s.checkIPExists(ctx, ip, deviceID)
			if err != nil {
				return nil, err
			}
			if exists {
				return nil, fmt.Errorf("ip address already exists")
			}
			updates["ip_address"] = ip
		}
	}

	if value, ok := updates["snmp_version"]; ok {
		if raw, ok := value.(string); ok {
			updates["snmp_version"] = sanitizeSnmpVersion(raw)
		}
	}

	if value, ok := updates["tags"]; ok {
		encoded, err := encodeTags(value)
		if err != nil {
			return nil, err
		}
		updates["tags"] = encoded
	}

	updates["updated_at"] = time.Now().UTC()

	if err := s.db.WithContext(ctx).Table("devices").Where("id = ?", deviceID).Updates(updates).Error; err != nil {
		return nil, err
	}

	if err := s.db.WithContext(ctx).Table("devices").Where("id = ?", deviceID).Take(&device).Error; err != nil {
		return nil, err
	}

	response := buildDeviceResponse(device, nil)
	return &response, nil
}

func (s *Service) DeleteDevice(ctx context.Context, deviceID int) error {
	if s.db == nil {
		return fmt.Errorf("database not initialized")
	}

	result := s.db.WithContext(ctx).Table("devices").Where("id = ?", deviceID).Delete(&Device{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (s *Service) BatchCreateDevices(
	ctx context.Context,
	devices []DeviceCreateRequest,
	createdBy string,
	skipDuplicates bool,
) ([]DeviceResponse, []SkippedDevice, error) {
	imported := make([]DeviceResponse, 0)
	skipped := make([]SkippedDevice, 0)

	for _, item := range devices {
		ip := strings.TrimSpace(item.IPAddress)
		if ip == "" {
			skipped = append(skipped, SkippedDevice{IPAddress: ip, Reason: "invalid ip_address"})
			continue
		}

		if skipDuplicates {
			exists, err := s.checkIPExists(ctx, ip, 0)
			if err != nil {
				return imported, skipped, err
			}
			if exists {
				skipped = append(skipped, SkippedDevice{IPAddress: ip, Reason: "device already exists"})
				continue
			}
		}

		device, err := s.CreateDevice(ctx, item, createdBy)
		if err != nil {
			skipped = append(skipped, SkippedDevice{IPAddress: ip, Reason: err.Error()})
			continue
		}

		imported = append(imported, *device)
	}

	return imported, skipped, nil
}

func (s *Service) GetDeviceGroups(ctx context.Context) ([]DeviceGroupResponse, error) {
	if s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	type row struct {
		ID          int        `gorm:"column:id"`
		Name        string     `gorm:"column:name"`
		Description *string    `gorm:"column:description"`
		CreatedAt   *time.Time `gorm:"column:created_at"`
		DeviceCount int        `gorm:"column:device_count"`
	}

	rows := make([]row, 0)
	query := `
        SELECT g.id, g.name, g.description, g.created_at,
               COUNT(d.id) AS device_count
        FROM device_groups g
        LEFT JOIN devices d ON d.group_id = g.id
        GROUP BY g.id
        ORDER BY g.name`

	if err := s.db.WithContext(ctx).Raw(query).Scan(&rows).Error; err != nil {
		return nil, err
	}

	result := make([]DeviceGroupResponse, 0, len(rows))
	for _, item := range rows {
		createdAt := time.Now()
		if item.CreatedAt != nil {
			createdAt = *item.CreatedAt
		}
		result = append(result, DeviceGroupResponse{
			ID:          item.ID,
			Name:        item.Name,
			Description: item.Description,
			DeviceCount: item.DeviceCount,
			CreatedAt:   createdAt,
		})
	}

	return result, nil
}

func (s *Service) GetDeviceStatistics(ctx context.Context) (DeviceStatistics, error) {
	if s.db == nil {
		return DeviceStatistics{}, fmt.Errorf("database not initialized")
	}

	var total int64
	if err := s.db.WithContext(ctx).Table("devices").Count(&total).Error; err != nil {
		return DeviceStatistics{}, err
	}

	var online int64
	if err := s.db.WithContext(ctx).
		Table("devices").
		Where("status = ?", "online").
		Count(&online).Error; err != nil {
		return DeviceStatistics{}, err
	}

	var offline int64
	if err := s.db.WithContext(ctx).
		Table("devices").
		Where("status = ?", "offline").
		Count(&offline).Error; err != nil {
		return DeviceStatistics{}, err
	}

	var warning int64
	if err := s.db.WithContext(ctx).
		Table("devices").
		Where("status = ?", "warning").
		Count(&warning).Error; err != nil {
		return DeviceStatistics{}, err
	}

	// 统计总告警数
	var totalAlerts int64
	if err := s.db.WithContext(ctx).
		Table("devices").
		Select("COALESCE(SUM(alert_count), 0)").
		Scan(&totalAlerts).Error; err != nil {
		// 告警统计失败不影响其他数据
		totalAlerts = 0
	}

	type typeRow struct {
		DeviceType string `gorm:"column:device_type"`
		Count      int    `gorm:"column:count"`
	}
	rows := make([]typeRow, 0)
	if err := s.db.WithContext(ctx).
		Table("devices").
		Select("device_type, COUNT(*) as count").
		Group("device_type").
		Scan(&rows).Error; err != nil {
		return DeviceStatistics{}, err
	}

	typeDistribution := map[string]int{}
	for _, row := range rows {
		if strings.TrimSpace(row.DeviceType) == "" {
			continue
		}
		typeDistribution[row.DeviceType] = row.Count
	}

	unknown := int(total - online - offline - warning)
	if unknown < 0 {
		unknown = 0
	}

	return DeviceStatistics{
		TotalDevices:     int(total),
		OnlineDevices:    int(online),
		OfflineDevices:   int(offline),
		WarningDevices:   int(warning),
		UnknownDevices:   unknown,
		TotalAlerts:      int(totalAlerts),
		TypeDistribution: typeDistribution,
	}, nil
}

func (s *Service) UpdateDeviceProbeStatus(
	ctx context.Context,
	deviceID int,
	status string,
	icmpStatus string,
	snmpStatus string,
	responseTime *float64,
	lastSeen *time.Time,
	lastProbeTime *time.Time,
) error {
	if s.db == nil {
		return fmt.Errorf("database not initialized")
	}

	updates := map[string]interface{}{
		"status":        status,
		"icmp_status":   icmpStatus,
		"snmp_status":   snmpStatus,
		"last_probe_time": time.Now().UTC(),
		"updated_at":    time.Now().UTC(),
	}

	if responseTime != nil {
		updates["response_time"] = *responseTime
	}
	if lastSeen != nil {
		updates["last_seen"] = *lastSeen
	}
	if lastProbeTime != nil {
		updates["last_probe_time"] = *lastProbeTime
	}

	result := s.db.WithContext(ctx).Table("devices").Where("id = ?", deviceID).Updates(updates)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (s *Service) ListActiveDevices(ctx context.Context) ([]Device, error) {
	if s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	var rows []Device
	if err := s.db.WithContext(ctx).
		Table("devices").
		Where("is_active = ?", true).
		Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

func (s *Service) GetDevicesByIDs(ctx context.Context, ids []int) ([]Device, error) {
	if s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	if len(ids) == 0 {
		return []Device{}, nil
	}

	var rows []Device
	if err := s.db.WithContext(ctx).Table("devices").Where("id IN ?", ids).Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

func (s *Service) checkIPExists(ctx context.Context, ip string, excludeID int) (bool, error) {
	var count int64
	query := s.db.WithContext(ctx).Table("devices").Where("ip_address = ?", ip)
	if excludeID > 0 {
		query = query.Where("id != ?", excludeID)
	}
	if err := query.Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

func (s *Service) loadAlertCounts(ctx context.Context, deviceIDs []int) (map[int]int, error) {
	if len(deviceIDs) == 0 {
		return map[int]int{}, nil
	}

	type row struct {
		DeviceID int `gorm:"column:device_id"`
		Count    int `gorm:"column:count"`
	}

	rows := make([]row, 0)
	err := s.db.WithContext(ctx).
		Table("alerts").
		Select("device_id, COUNT(*) as count").
		Where("status IN ?", []string{"open", "acknowledged"}).
		Where("device_id IN ?", deviceIDs).
		Group("device_id").
		Scan(&rows).Error

	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return map[int]int{}, nil
		}
		return nil, err
	}

	result := map[int]int{}
	for _, item := range rows {
		result[item.DeviceID] = item.Count
	}
	return result, nil
}

func applyDeviceFilters(db *gorm.DB, deviceType string, status string, groupID *int, search string, isActive *bool) *gorm.DB {
	if strings.TrimSpace(deviceType) != "" {
		db = db.Where("device_type = ?", deviceType)
	}
	if strings.TrimSpace(status) != "" {
		db = db.Where("status = ?", status)
	}
	if groupID != nil {
		db = db.Where("group_id = ?", *groupID)
	}
	if isActive != nil {
		db = db.Where("is_active = ?", *isActive)
	}
	if strings.TrimSpace(search) != "" {
		pattern := "%" + strings.TrimSpace(search) + "%"
		db = db.Where("(name ILIKE ? OR ip_address ILIKE ? OR location ILIKE ? OR description ILIKE ?)", pattern, pattern, pattern, pattern)
	}
	return db
}

func sanitizeSnmpVersion(value string) string {
	normalized := normalizeSNMPVersion(value)
	switch normalized {
	case "1", "2c", "3":
		return normalized
	default:
		return defaultSnmpVersion
	}
}

func buildDeviceResponse(device Device, alertCount *int) DeviceResponse {
	status := strings.TrimSpace(device.Status)
	if status == "" {
		status = defaultStatus
	}

	response := DeviceResponse{
		ID:            device.ID,
		Name:          device.Name,
		IPAddress:     device.IPAddress,
		DeviceType:    device.DeviceType,
		Vendor:        device.Vendor,
		Model:         device.Model,
		Location:      device.Location,
		GroupID:       device.GroupID,
		Status:        status,
		LastSeen:      device.LastSeen,
		IsActive:      device.IsActive,
		CreatedBy:     device.CreatedBy,
		SnmpCommunity: device.SnmpCommunity,
		SnmpVersion:   device.SnmpVersion,
		SnmpPort:      device.SnmpPort,
		CliProtocol:   device.CliProtocol,
		SshUsername:   device.SshUsername,
		SshPort:       device.SshPort,
		TelnetUsername: device.TelnetUsername,
		TelnetPort:    device.TelnetPort,
		EnablePassword: device.EnablePassword,
		Tags:          decodeTags(device.Tags),
		Description:   device.Description,
		IcmpStatus:    device.IcmpStatus,
		SnmpStatus:    device.SnmpStatus,
		ResponseTime:  device.ResponseTime,
		LastProbeTime: device.LastProbeTime,
		CPUUsage:      device.CPUUsage,
		MemoryUsage:   device.MemoryUsage,
		Temperature:   device.Temperature,
		Uptime:        device.Uptime,
		AlertCount:    device.AlertCount,
		CreatedAt:     device.CreatedAt,
		UpdatedAt:     device.UpdatedAt,
	}

	if alertCount != nil {
		response.AlertCount = alertCount
	}

	return response
}
