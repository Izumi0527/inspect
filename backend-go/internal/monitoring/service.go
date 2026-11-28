package monitoring

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"go.uber.org/zap"
	"gorm.io/datatypes"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/ws"
)

var ErrNoMetrics = errors.New("no metrics to write")

// ErrDeviceNotFound 写入目标设备已不在 devices 表：采集任务中途被删的设备会命中。
var ErrDeviceNotFound = errors.New("device not found")

type WriteResult struct {
	DeviceMetrics    int
	InterfaceMetrics int
	SystemMetrics    int
}

type MetricsWriter struct {
	db           *gorm.DB
	wsManager    *ws.Manager
	logger       *zap.Logger
	cache        *MetricsCache
	engineHealth *EngineHealthTracker
}

func NewMetricsWriter(db *gorm.DB, wsManager *ws.Manager, logger *zap.Logger) *MetricsWriter {
	return &MetricsWriter{
		db:           db,
		wsManager:    wsManager,
		logger:       logger,
		cache:        nil, // 缓存需要单独设置
		engineHealth: NewEngineHealthTracker(),
	}
}

// EngineHealthTracker 返回指标写入器关联的采集引擎健康追踪器。
func (w *MetricsWriter) EngineHealthTracker() *EngineHealthTracker {
	if w == nil {
		return nil
	}
	return w.engineHealth
}

// EngineHealthSnapshot 返回当前采集引擎健康状态的只读快照。
func (w *MetricsWriter) EngineHealthSnapshot() EngineHealthSnapshot {
	if w == nil || w.engineHealth == nil {
		return NewEngineHealthTracker().Snapshot()
	}
	return w.engineHealth.Snapshot()
}

// SetCache 设置缓存服务
func (w *MetricsWriter) SetCache(cache *MetricsCache) {
	w.cache = cache
}

func (w *MetricsWriter) WriteDeviceMetrics(ctx context.Context, req DeviceMetricsRequest) (WriteResult, error) {
	if w.db == nil {
		return WriteResult{}, fmt.Errorf("database not initialized")
	}
	if req.DeviceID <= 0 {
		return WriteResult{}, fmt.Errorf("invalid device_id")
	}

	req.Metrics = normalizeMetricMap(req.Metrics)

	collectedAt := resolveCollectedAt(req.CollectedAt)
	tags := normalizeTags(req.Tags)

	deviceMetrics, deviceUpdates := buildDeviceMetricRecords(req.DeviceID, req.Metrics, tags, collectedAt)
	interfaceMetrics := buildInterfaceMetricRecords(req.DeviceID, req.Interfaces, tags, collectedAt)
	interfaceSpeedUpdates := extractInterfaceSpeedUpdates(req.DeviceID, req.Interfaces, collectedAt)

	if len(deviceMetrics) == 0 && len(interfaceMetrics) == 0 && len(interfaceSpeedUpdates) == 0 {
		return WriteResult{}, ErrNoMetrics
	}

	// 采集任务开始时一次性加载设备列表再逐台写入：任务进行中被删除的设备仍会走到这里。
	// 删设备已清掉它的监控数据，不校验就会写出新的孤儿行；统计卡、流量聚合不按设备名过滤，
	// 会被这些样本污染到下次重启清理为止。放在无指标早退之后，没东西可写就不多查一次。
	exists, err := w.DeviceExists(ctx, req.DeviceID)
	if err != nil {
		return WriteResult{}, err
	}
	if !exists {
		return WriteResult{}, ErrDeviceNotFound
	}

	if w.engineHealth != nil {
		w.engineHealth.IncPendingWriteQueue(1)
		defer w.engineHealth.IncPendingWriteQueue(-1)
	}

	writtenInterfaceMetrics := len(interfaceMetrics)
	err = w.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// 核心写入①：设备级时序指标（device_metrics）与最新快照（device_latest_metrics）。
		if len(deviceMetrics) > 0 {
			// Use raw SQL to let database sequence generate IDs for TimescaleDB hypertable
			if err := insertDeviceMetricsRaw(tx, deviceMetrics); err != nil {
				return err
			}
			if err := upsertLatestMetricsWithDB(tx, DeviceMetricsToLatestMetrics(deviceMetrics)); err != nil {
				return err
			}
		}
		// 核心写入②：devices 表 cpu_usage/memory_usage 等快照（设备管理页直接读此列）。
		// 必须先于接口类写入落库，确保接口写入异常不会回滚掉核心快照。
		if len(deviceUpdates) > 0 {
			if err := tx.Table("devices").Where("id = ?", req.DeviceID).Updates(deviceUpdates).Error; err != nil {
				return err
			}
		}
		// 核心写入③：设备档案静态属性（型号/软件版本）。
		// 与快照分开：仅当采集值与库中不同才写，避免每轮采集都刷新 updated_at。
		writeDeviceIdentityIfChanged(tx, req.DeviceID, req.Identity, w.logger)
		// 次要写入：接口时序指标 + device_interfaces 状态表 UPSERT + 接口速率更新 + 纳管接口最新快照。
		// 用嵌套事务(SAVEPOINT)隔离为“尽力而为”：任一步失败仅回滚本段并记日志，
		// 不连累上面已写入的核心快照——根治“接口写入报错导致整笔回滚、cpu/mem 丢失”的历史故障。
		writtenInterfaceMetrics = w.writeInterfaceDataBestEffort(tx, req.DeviceID, interfaceMetrics, req.Interfaces, interfaceSpeedUpdates, tags, collectedAt)
		// 次要写入：LLDP 邻居全量替换（拓扑连线数据源），同样尽力而为。
		w.writeNeighborsBestEffort(tx, req.DeviceID, req.Neighbors, collectedAt)
		return nil
	})
	if err != nil {
		if w.logger != nil {
			w.logger.Error("write_device_metrics_failed", zap.Int("device_id", req.DeviceID), zap.Error(err))
		}
		return WriteResult{}, err
	}

	w.broadcastDeviceMetrics(req)

	return WriteResult{
		DeviceMetrics:    len(deviceMetrics),
		InterfaceMetrics: writtenInterfaceMetrics,
	}, nil
}

func (w *MetricsWriter) WriteSystemMetrics(ctx context.Context, req SystemMetricsRequest) (WriteResult, error) {
	if w.db == nil {
		return WriteResult{}, fmt.Errorf("database not initialized")
	}

	host := strings.TrimSpace(req.Host)
	if host == "" {
		return WriteResult{}, fmt.Errorf("host is required")
	}

	req.Metrics = normalizeMetricMap(req.Metrics)

	collectedAt := resolveCollectedAt(req.CollectedAt)
	tags := normalizeTags(req.Tags)

	records := make([]SystemMetric, 0, len(req.Metrics))
	for name, metric := range req.Metrics {
		value, ok := metric.Numeric()
		if !ok {
			continue
		}
		metricTime := collectedAt
		if metric.Timestamp != nil && !metric.Timestamp.IsZero() {
			metricTime = metric.Timestamp.Time.UTC()
		}

		unit := metric.Unit
		hostValue := host
		records = append(records, SystemMetric{
			Host:        &hostValue,
			MetricName:  name,
			MetricValue: &value,
			MetricUnit:  unit,
			Tags:        tags,
			CollectedAt: metricTime,
		})
	}

	if len(records) == 0 {
		return WriteResult{}, ErrNoMetrics
	}

	if err := w.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return InsertSystemMetricsRaw(tx, records)
	}); err != nil {
		if w.logger != nil {
			w.logger.Error("write_system_metrics_failed", zap.String("host", host), zap.Error(err))
		}
		return WriteResult{}, err
	}

	return WriteResult{SystemMetrics: len(records)}, nil
}

// InsertSystemMetricsRaw inserts system metrics using raw SQL to work with TimescaleDB hypertables.
func InsertSystemMetricsRaw(tx *gorm.DB, metrics []SystemMetric) error {
	if len(metrics) == 0 {
		return nil
	}

	// Ensure sequence exists for environments that haven't run migration yet.
	_ = tx.Exec(`CREATE SEQUENCE IF NOT EXISTS system_metrics_id_seq;`).Error

	sql, values := buildSystemMetricsInsertSQL(metrics, time.Now().UTC())
	return tx.Exec(sql, values...).Error
}

func buildSystemMetricsInsertSQL(metrics []SystemMetric, createdAt time.Time) (string, []interface{}) {
	if len(metrics) == 0 {
		return "", nil
	}

	sql := `INSERT INTO system_metrics (id, host, metric_name, metric_value, metric_unit, tags, collected_at, created_at) VALUES `
	values := make([]interface{}, 0, len(metrics)*7)
	placeholders := make([]string, 0, len(metrics))

	for i, m := range metrics {
		base := i * 7
		placeholders = append(placeholders, fmt.Sprintf("(nextval('system_metrics_id_seq'), $%d, $%d, $%d, $%d, $%d, $%d, $%d)",
			base+1, base+2, base+3, base+4, base+5, base+6, base+7))

		values = append(values,
			m.Host,
			m.MetricName,
			m.MetricValue,
			m.MetricUnit,
			m.Tags,
			m.CollectedAt,
			createdAt,
		)
	}

	sql += strings.Join(placeholders, ", ")
	return sql, values
}

func (w *MetricsWriter) DeviceExists(ctx context.Context, deviceID int) (bool, error) {
	if w.db == nil {
		return false, fmt.Errorf("database not initialized")
	}

	var id int
	err := w.db.WithContext(ctx).Table("devices").Select("id").Where("id = ?", deviceID).Take(&id).Error
	if err == nil {
		return true, nil
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return false, nil
	}
	return false, err
}

func (w *MetricsWriter) GetDeviceMetrics(ctx context.Context, deviceID int) (DeviceMetricsResponse, error) {
	if w.db == nil {
		return DeviceMetricsResponse{}, fmt.Errorf("database not initialized")
	}

	type metricRow struct {
		MetricName  string
		MetricValue *float64
		MetricUnit  *string
		CollectedAt time.Time
	}

	rows := make([]metricRow, 0)
	query := `
        SELECT DISTINCT ON (metric_name)
            metric_name,
            metric_value,
            metric_unit,
            collected_at
        FROM device_metrics
        WHERE device_id = ?
        ORDER BY metric_name, collected_at DESC`

	if err := w.db.WithContext(ctx).Raw(query, deviceID).Scan(&rows).Error; err != nil {
		return DeviceMetricsResponse{}, err
	}

	resp := DeviceMetricsResponse{
		DeviceID:  deviceID,
		Timestamp: time.Now().UTC(),
	}

	var latest time.Time
	for _, row := range rows {
		if row.CollectedAt.After(latest) {
			latest = row.CollectedAt
		}
		if row.MetricValue == nil {
			continue
		}
		assignMetricValue(&resp, row.MetricName, *row.MetricValue)
	}

	if !latest.IsZero() {
		resp.Timestamp = latest.UTC()
	}

	if len(rows) == 0 {
		w.fillFromDeviceSnapshot(ctx, deviceID, &resp)
	}

	return resp, nil
}

func (w *MetricsWriter) GetDeviceMetricsHistory(
	ctx context.Context,
	deviceID int,
	start time.Time,
	end time.Time,
	metricNames []string,
) ([]HistoryPoint, error) {
	return w.GetBulkMetricsHistory(ctx, []int{deviceID}, start, end, metricNames)
}

func (w *MetricsWriter) broadcastDeviceMetrics(req DeviceMetricsRequest) {
	if w.wsManager == nil {
		return
	}

	payload := map[string]interface{}{
		"device_id": req.DeviceID,
		"metrics":   req.Metrics,
	}
	if len(req.Interfaces) > 0 {
		payload["interfaces"] = req.Interfaces
	}
	if req.CollectedAt != nil && !req.CollectedAt.IsZero() {
		payload["collected_at"] = req.CollectedAt.Time.UTC().Format(time.RFC3339Nano)
	}

	w.wsManager.SendToRoom("device_metrics", ws.Message{
		Type: ws.MessageDeviceMetrics,
		Data: payload,
	})
}

func resolveCollectedAt(raw *FlexibleTime) time.Time {
	if raw == nil || raw.IsZero() {
		return time.Now().UTC()
	}
	return raw.Time.UTC()
}

func (w *MetricsWriter) fillFromDeviceSnapshot(ctx context.Context, deviceID int, resp *DeviceMetricsResponse) {
	type deviceSnapshot struct {
		CPUUsage    *float64   `gorm:"column:cpu_usage"`
		MemoryUsage *float64   `gorm:"column:memory_usage"`
		DiskUsage   *float64   `gorm:"column:disk_usage"`
		Temperature *float64   `gorm:"column:temperature"`
		Uptime      *int64     `gorm:"column:uptime"`
		LastSeen    *time.Time `gorm:"column:last_seen"`
		UpdatedAt   *time.Time `gorm:"column:updated_at"`
	}

	var snapshot deviceSnapshot
	if err := w.db.WithContext(ctx).Table("devices").
		Select("cpu_usage, memory_usage, disk_usage, temperature, uptime, last_seen, updated_at").
		Where("id = ?", deviceID).
		Take(&snapshot).Error; err != nil {
		return
	}

	if resp.CPUUsage == nil {
		resp.CPUUsage = snapshot.CPUUsage
	}
	if resp.MemoryUsage == nil {
		resp.MemoryUsage = snapshot.MemoryUsage
	}
	if resp.DiskUsage == nil {
		resp.DiskUsage = snapshot.DiskUsage
	}
	if resp.Temperature == nil {
		resp.Temperature = snapshot.Temperature
	}
	if resp.Uptime == nil {
		resp.Uptime = snapshot.Uptime
	}

	if snapshot.LastSeen != nil {
		resp.Timestamp = snapshot.LastSeen.UTC()
	} else if snapshot.UpdatedAt != nil {
		resp.Timestamp = snapshot.UpdatedAt.UTC()
	}
}

func normalizeTags(raw map[string]interface{}) datatypes.JSONMap {
	if len(raw) == 0 {
		return nil
	}
	return datatypes.JSONMap(raw)
}

func buildDeviceMetricRecords(deviceID int, metrics map[string]MetricValue, tags datatypes.JSONMap, collectedAt time.Time) ([]DeviceMetric, map[string]interface{}) {
	records := make([]DeviceMetric, 0, len(metrics))
	updates := make(map[string]interface{})

	for name, metric := range metrics {
		value, ok := metric.Numeric()
		if !ok {
			continue
		}

		metricTime := collectedAt
		if metric.Timestamp != nil && !metric.Timestamp.IsZero() {
			metricTime = metric.Timestamp.Time.UTC()
		}

		unit := metric.Unit
		records = append(records, DeviceMetric{
			DeviceID:    deviceID,
			MetricName:  name,
			MetricValue: &value,
			MetricUnit:  unit,
			Tags:        tags,
			CollectedAt: metricTime,
		})

		switch name {
		case "cpu_usage":
			updates["cpu_usage"] = value
		case "memory_usage":
			updates["memory_usage"] = value
		case "disk_usage":
			updates["disk_usage"] = value
		case "temperature":
			updates["temperature"] = value
		case "response_time":
			updates["response_time"] = value
		case "uptime", "system_uptime":
			updates["uptime"] = int64(value)
		}
	}

	return records, updates
}

func buildInterfaceMetricRecords(deviceID int, interfaces []map[string]interface{}, tags datatypes.JSONMap, collectedAt time.Time) []InterfaceMetric {
	if len(interfaces) == 0 {
		return nil
	}

	records := make([]InterfaceMetric, 0)
	for _, item := range interfaces {
		if item == nil {
			continue
		}
		nameValue, _ := item["name"].(string)
		interfaceName := strings.TrimSpace(nameValue)
		if interfaceName == "" {
			continue
		}
		for key, rawValue := range item {
			if isInterfaceMetaKey(key) {
				continue
			}
			if isInterfaceSpeedKey(normalizeInterfaceKey(key)) {
				continue
			}
			value, ok := coerceFloat(rawValue)
			if !ok {
				continue
			}

			records = append(records, InterfaceMetric{
				DeviceID:      deviceID,
				InterfaceName: interfaceName,
				MetricName:    key,
				MetricValue:   &value,
				Tags:          tags,
				CollectedAt:   collectedAt,
			})
		}
	}

	return records
}

type InterfaceSpeedUpdate struct {
	DeviceID      int
	InterfaceName string
	SpeedMbps     int64
	UpdatedAt     time.Time
}

const maxIdentityFieldLen = 255

// sanitizeIdentityField 清洗设备静态身份字段：拦截控制字符（含 NUL/换行/ANSI 转义）与超长输入，
// 避免经外部推送接口写入脏值或触发 PostgreSQL 22021（非法 NUL 字节）报错。
func sanitizeIdentityField(value string, maxLen int) string {
	cleaned := strings.TrimSpace(strings.Trim(value, "\x00"))
	if cleaned == "" || (maxLen > 0 && len(cleaned) > maxLen) {
		return ""
	}
	for _, r := range cleaned {
		if r < 0x20 || r == 0x7f {
			return ""
		}
	}
	return cleaned
}

// writeDeviceIdentityIfChanged 把采集到的型号/软件版本/序列号/LLDP 身份与状态回填设备档案。
//
// 只写差异：WHERE 子句带 "值为空或与新值不同" 的条件，取值稳定时不产生任何 UPDATE，
// 因此不会让每 5 分钟一轮的采集持续刷新 devices.updated_at。
// 单列 UPDATE 各自包在 SAVEPOINT 里，失败仅回滚该列并记日志——设备档案是锦上添花，
// 绝不污染外层事务或连累已落库的核心指标快照。
func writeDeviceIdentityIfChanged(tx *gorm.DB, deviceID int, identity *DeviceIdentity, logger *zap.Logger) {
	if identity == nil || deviceID <= 0 {
		return
	}

	apply := func(column, value string) {
		if value == "" {
			return
		}
		// 条件写成单个带括号的表达式：拆成两个 Where 会生成
		// "id = ? AND col IS NULL OR col <> ?"，AND 优先级高于 OR，
		// 会退化成"更新所有取值不同的设备"——多设备环境下是跨设备误写。
		err := tx.Transaction(func(itx *gorm.DB) error {
			return itx.Table("devices").
				Where(fmt.Sprintf("id = ? AND (%s IS NULL OR %s <> ?)", column, column), deviceID, value).
				Update(column, value).Error
		})
		if err != nil && logger != nil {
			logger.Warn("write_device_identity_failed",
				zap.Int("device_id", deviceID),
				zap.String("column", column),
				zap.Error(err))
		}
	}

	apply("model", sanitizeIdentityField(identity.Model, maxIdentityFieldLen))
	apply("firmware_version", sanitizeIdentityField(identity.FirmwareVersion, maxIdentityFieldLen))
	apply("patch_version", sanitizeIdentityField(identity.PatchVersion, maxIdentityFieldLen))
	apply("serial_number", devices.SanitizeSerialNumber(identity.SerialNumber))
	apply("detected_device_type", sanitizeIdentityField(identity.DetectedDeviceType, maxIdentityFieldLen))
	apply("detected_sys_name", sanitizeIdentityField(identity.SysName, maxIdentityFieldLen))
	apply("detected_chassis_id", sanitizeIdentityField(identity.ChassisID, maxIdentityFieldLen))
	apply("lldp_status", sanitizeIdentityField(identity.LLDPStatus, maxIdentityFieldLen))
}

// writeNeighborsBestEffort 以「先删后插」全量替换设备的 LLDP 邻居行。
//
// LLDP 表是设备的当前视图，不做老化：邻居消失就该从表里消失。payload 为 nil 表示本轮
// 没读到 LLDP 表（不支持/未放行），此时不动旧行——否则一次 SNMP 超时就会把拓扑连线清空。
// 整段包在 SAVEPOINT 里：失败只回滚本段并记日志，不连累已写入的核心快照。
func (w *MetricsWriter) writeNeighborsBestEffort(tx *gorm.DB, deviceID int, payload *NeighborsPayload, collectedAt time.Time) {
	if payload == nil || deviceID <= 0 {
		return
	}

	const insertSQL = `INSERT INTO device_neighbors (device_id, local_port_num, local_port_id, local_port_desc, remote_chassis_id, remote_port_id, remote_port_desc, remote_sys_name, remote_sys_desc, remote_mgmt_ip, remote_cap_enabled, collected_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

	err := tx.Transaction(func(itx *gorm.DB) error {
		if err := itx.Exec(`DELETE FROM device_neighbors WHERE device_id = ?`, deviceID).Error; err != nil {
			return err
		}
		now := time.Now().UTC()
		for _, n := range payload.Items {
			if strings.TrimSpace(n.RemoteChassisID) == "" && strings.TrimSpace(n.RemoteSysName) == "" {
				continue
			}
			if err := itx.Exec(insertSQL,
				deviceID,
				n.LocalPortNum,
				nullIfBlank(n.LocalPortID),
				nullIfBlank(n.LocalPortDesc),
				strings.TrimSpace(n.RemoteChassisID),
				nullIfBlank(n.RemotePortID),
				nullIfBlank(n.RemotePortDesc),
				nullIfBlank(n.RemoteSysName),
				nullIfBlank(n.RemoteSysDesc),
				nullIfBlank(n.RemoteMgmtIP),
				nullIfBlank(n.RemoteCapEnabled),
				collectedAt,
				now,
			).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil && w.logger != nil {
		w.logger.Warn("neighbor data best-effort write failed; core device snapshot preserved",
			zap.Int("device_id", deviceID), zap.Error(err))
	}
}

// nullIfBlank 把空白字符串转为 SQL NULL，避免邻居表里堆满空串。
func nullIfBlank(value string) interface{} {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return trimmed
}

func extractInterfaceSpeedUpdates(deviceID int, interfaces []map[string]interface{}, collectedAt time.Time) []InterfaceSpeedUpdate {
	if len(interfaces) == 0 {
		return nil
	}

	type candidate struct {
		speed    int64
		priority int
	}

	candidates := make(map[string]candidate)
	for _, item := range interfaces {
		if item == nil {
			continue
		}
		nameValue, _ := item["name"].(string)
		interfaceName := strings.TrimSpace(nameValue)
		if interfaceName == "" {
			continue
		}
		speed, priority, ok := resolveInterfaceSpeed(item)
		if !ok || speed <= 0 {
			continue
		}
		existing, exists := candidates[interfaceName]
		if !exists || priority > existing.priority || (priority == existing.priority && speed > existing.speed) {
			candidates[interfaceName] = candidate{speed: speed, priority: priority}
		}
	}

	if len(candidates) == 0 {
		return nil
	}

	updates := make([]InterfaceSpeedUpdate, 0, len(candidates))
	for name, item := range candidates {
		updates = append(updates, InterfaceSpeedUpdate{
			DeviceID:      deviceID,
			InterfaceName: name,
			SpeedMbps:     item.speed,
			UpdatedAt:     collectedAt,
		})
	}

	return updates
}

func resolveInterfaceSpeed(item map[string]interface{}) (int64, int, bool) {
	var (
		bestSpeed    int64
		bestPriority int
		found        bool
	)

	for key, rawValue := range item {
		if isInterfaceMetaKey(key) {
			continue
		}
		normalized := normalizeInterfaceKey(key)
		priority, multiplier := interfaceSpeedPriority(normalized)
		if priority == 0 {
			continue
		}
		value, ok := coerceFloat(rawValue)
		if !ok {
			continue
		}
		speed := int64(value * multiplier)
		if speed <= 0 {
			continue
		}
		if !found || priority > bestPriority || (priority == bestPriority && speed > bestSpeed) {
			bestSpeed = speed
			bestPriority = priority
			found = true
		}
	}

	return bestSpeed, bestPriority, found
}

func interfaceSpeedPriority(normalized string) (int, float64) {
	switch normalized {
	case "ifhighspeed", "if_high_speed", "if_highspeed":
		return 3, 1
	case "ifspeed", "if_speed":
		return 2, 1.0 / 1_000_000
	case "speed_mbps", "link_speed_mbps":
		return 1, 1
	case "speed_bps", "link_speed_bps":
		return 1, 1.0 / 1_000_000
	case "speed", "linkspeed", "link_speed":
		return 1, 1
	default:
		return 0, 0
	}
}

func isInterfaceMetaKey(key string) bool {
	normalized := normalizeInterfaceKey(key)
	switch normalized {
	case "name", "timestamp", "collected_at", "speed_unknown", "lld_monitored",
		"description", "port_description", "alias", "if_alias":
		return true
	default:
		return false
	}
}

func isInterfaceSpeedKey(normalized string) bool {
	priority, _ := interfaceSpeedPriority(normalized)
	return priority > 0
}

func normalizeInterfaceKey(raw string) string {
	normalized := strings.ToLower(strings.TrimSpace(raw))
	normalized = strings.ReplaceAll(normalized, "-", "_")
	normalized = strings.ReplaceAll(normalized, " ", "_")
	return normalized
}

func applyInterfaceSpeedUpdates(tx *gorm.DB, updates []InterfaceSpeedUpdate) error {
	for _, update := range updates {
		if err := tx.Table("device_interfaces").
			Where("device_id = ? AND name = ?", update.DeviceID, update.InterfaceName).
			Updates(map[string]interface{}{
				"speed":        update.SpeedMbps,
				"last_updated": update.UpdatedAt,
				"updated_at":   update.UpdatedAt,
			}).Error; err != nil {
			return err
		}
	}
	return nil
}

type deviceInterfaceState struct {
	Name               string     `gorm:"column:name"`
	Speed              *int64     `gorm:"column:speed"`
	IsUp               *bool      `gorm:"column:is_up"`
	AdminUp            bool       `gorm:"column:admin_up"`
	DuplexStatus       string     `gorm:"column:duplex_status"`
	InErrors           int64      `gorm:"column:in_errors"`
	OutErrors          int64      `gorm:"column:out_errors"`
	FlapCount1h        int        `gorm:"column:flap_count_1h"`
	LastStatusChangeAt *time.Time `gorm:"column:last_status_change_at"`
	LastUpdated        *time.Time `gorm:"column:last_updated"`
	LLDMonitored       bool       `gorm:"column:lld_monitored"`
}

func loadDeviceInterfaceStates(tx *gorm.DB, deviceID int) (map[string]deviceInterfaceState, error) {
	rows := make([]deviceInterfaceState, 0)
	if err := tx.Table("device_interfaces").
		Select("name, speed, is_up, admin_up, duplex_status, in_errors, out_errors, flap_count_1h, last_status_change_at, last_updated, lld_monitored").
		Where("device_id = ?", deviceID).
		Scan(&rows).Error; err != nil {
		return nil, err
	}
	states := make(map[string]deviceInterfaceState, len(rows))
	for _, row := range rows {
		name := strings.TrimSpace(row.Name)
		if name != "" {
			states[name] = row
		}
	}
	return states, nil
}

// writeInterfaceDataBestEffort 以“尽力而为”方式写入接口相关数据（时序指标 + 状态表 + 速率 + 纳管接口最新快照）。
// 整段包在嵌套事务(SAVEPOINT)中：任一步失败只回滚本段并记日志，不影响外层已写入的核心快照。
func (w *MetricsWriter) writeInterfaceDataBestEffort(
	tx *gorm.DB,
	deviceID int,
	interfaceMetrics []InterfaceMetric,
	interfacePayload []map[string]interface{},
	speedUpdates []InterfaceSpeedUpdate,
	tags datatypes.JSONMap,
	collectedAt time.Time,
) int {
	if len(interfaceMetrics) == 0 && len(interfacePayload) == 0 && len(speedUpdates) == 0 {
		return 0
	}

	writtenCount := len(interfaceMetrics)
	err := tx.Transaction(func(itx *gorm.DB) error {
		existingStates, err := loadDeviceInterfaceStates(itx, deviceID)
		if err != nil {
			return err
		}

		monitoredMap := make(map[string]bool, len(existingStates)+len(interfacePayload))
		for name, st := range existingStates {
			monitoredMap[name] = st.LLDMonitored
		}

		allInterfaceMetrics := make([]InterfaceMetric, len(interfaceMetrics))
		copy(allInterfaceMetrics, interfaceMetrics)

		if len(interfacePayload) > 0 {
			flapMetrics, err := upsertDeviceInterfacesWithStates(itx, deviceID, interfacePayload, existingStates, monitoredMap, tags, collectedAt)
			if err != nil {
				return err
			}
			allInterfaceMetrics = appendUniqueInterfaceMetrics(allInterfaceMetrics, flapMetrics)
		}

		if len(allInterfaceMetrics) > 0 {
			// Use raw SQL to let database sequence generate IDs for TimescaleDB hypertable
			if err := insertInterfaceMetricsRaw(itx, allInterfaceMetrics); err != nil {
				return err
			}
			for _, m := range allInterfaceMetrics {
				if _, exists := monitoredMap[m.InterfaceName]; !exists {
					monitoredMap[m.InterfaceName] = true
				}
			}
			latestPoints := InterfaceMetricsToLatestMetrics(allInterfaceMetrics, monitoredMap)
			if err := upsertLatestMetricsWithDB(itx, latestPoints); err != nil {
				return err
			}
		}

		if len(speedUpdates) > 0 {
			if err := applyInterfaceSpeedUpdates(itx, speedUpdates); err != nil {
				return err
			}
		}
		writtenCount = len(allInterfaceMetrics)
		return nil
	})
	if err != nil && w.logger != nil {
		w.logger.Warn("interface data best-effort write failed; core device snapshot preserved",
			zap.Int("device_id", deviceID), zap.Error(err))
		return 0
	}
	return writtenCount
}

func appendUniqueInterfaceMetrics(base []InterfaceMetric, extras []InterfaceMetric) []InterfaceMetric {
	if len(extras) == 0 {
		return base
	}
	type metricKey struct {
		iface string
		name  string
	}
	seen := make(map[metricKey]struct{}, len(base))
	for _, m := range base {
		seen[metricKey{iface: m.InterfaceName, name: m.MetricName}] = struct{}{}
	}
	for _, m := range extras {
		key := metricKey{iface: m.InterfaceName, name: m.MetricName}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		base = append(base, m)
	}
	return base
}

// upsertDeviceInterfacesWithStates 将采集到的接口状态、错包/丢弃、利用率及闪断统计 UPSERT 到 device_interfaces。
func upsertDeviceInterfacesWithStates(
	tx *gorm.DB,
	deviceID int,
	interfaces []map[string]interface{},
	existingStates map[string]deviceInterfaceState,
	monitoredMap map[string]bool,
	tags datatypes.JSONMap,
	collectedAt time.Time,
) ([]InterfaceMetric, error) {
	const upsertSQL = `
INSERT INTO device_interfaces (
    device_id, name, alias, description, in_octets, out_octets, is_up,
    admin_up, duplex_status, in_errors, out_errors, in_discards, out_discards,
    in_error_rate, out_error_rate, utilization_in, utilization_out, speed_unknown,
    flap_count_1h, last_status_change_at, lld_monitored, last_updated, created_at, updated_at
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (device_id, name) DO UPDATE SET
    alias = COALESCE(EXCLUDED.alias, device_interfaces.alias),
    description = CASE WHEN ? THEN EXCLUDED.description ELSE device_interfaces.description END,
    in_octets = EXCLUDED.in_octets,
    out_octets = EXCLUDED.out_octets,
    is_up = EXCLUDED.is_up,
    admin_up = EXCLUDED.admin_up,
    duplex_status = EXCLUDED.duplex_status,
    in_errors = EXCLUDED.in_errors,
    out_errors = EXCLUDED.out_errors,
    in_discards = EXCLUDED.in_discards,
    out_discards = EXCLUDED.out_discards,
    in_error_rate = EXCLUDED.in_error_rate,
    out_error_rate = EXCLUDED.out_error_rate,
    utilization_in = EXCLUDED.utilization_in,
    utilization_out = EXCLUDED.utilization_out,
    speed_unknown = EXCLUDED.speed_unknown,
    flap_count_1h = EXCLUDED.flap_count_1h,
    last_status_change_at = EXCLUDED.last_status_change_at,
    lld_monitored = EXCLUDED.lld_monitored,
    last_updated = EXCLUDED.last_updated,
    updated_at = EXCLUDED.updated_at`

	flapMetrics := make([]InterfaceMetric, 0, len(interfaces))
	for _, item := range interfaces {
		if item == nil {
			continue
		}
		name, _ := item["name"].(string)
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}

		prev, hasPrev := existingStates[name]
		var prevPtr *deviceInterfaceState
		if hasPrev {
			prevCopy := prev
			prevPtr = &prevCopy
		}

		resolved := resolveInterfaceUpsertValues(item, prevPtr, collectedAt)
		monitoredMap[name] = resolved.lldMonitored

		if err := tx.Exec(
			upsertSQL,
			deviceID,
			name,
			resolved.alias,
			resolved.portDescription,
			mapInterfaceInt64(item, "ifHCInOctets"),
			mapInterfaceInt64(item, "ifHCOutOctets"),
			resolved.currUpVal,
			resolved.adminUp,
			resolved.duplexStatus,
			resolved.inErrors,
			resolved.outErrors,
			resolved.inDiscards,
			resolved.outDiscards,
			resolved.inErrorRate,
			resolved.outErrorRate,
			resolved.utilIn,
			resolved.utilOut,
			resolved.speedUnknown,
			resolved.flapCount1h,
			resolved.lastStatusChangeAt,
			resolved.lldMonitored,
			collectedAt,
			collectedAt,
			collectedAt,
			resolved.hasPortDescription,
		).Error; err != nil {
			return nil, err
		}

		flapFloat := float64(resolved.flapCount1h)
		flapMetrics = append(flapMetrics, InterfaceMetric{
			DeviceID:      deviceID,
			InterfaceName: name,
			MetricName:    "if_flap_count_1h",
			MetricValue:   &flapFloat,
			Tags:          tags,
			CollectedAt:   collectedAt,
		})
	}
	return flapMetrics, nil
}

type resolvedInterfaceUpsert struct {
	alias              interface{}
	portDescription    interface{}
	hasPortDescription bool
	currUpVal          interface{}
	adminUp            bool
	duplexStatus       string
	inErrors           int64
	outErrors          int64
	inDiscards         int64
	outDiscards        int64
	inErrorRate        float64
	outErrorRate       float64
	utilIn             float64
	utilOut            float64
	speedUnknown       bool
	flapCount1h        int
	lastStatusChangeAt *time.Time
	lldMonitored       bool
}

func resolveInterfaceUpsertValues(item map[string]interface{}, prev *deviceInterfaceState, collectedAt time.Time) resolvedInterfaceUpsert {
	res := resolvedInterfaceUpsert{
		adminUp:      true,
		duplexStatus: "unknown",
		lldMonitored: true,
	}
	if descr, ok := item["description"].(string); ok {
		if trimmed := strings.TrimSpace(descr); trimmed != "" {
			res.alias = trimmed
		}
	}
	if rawPortDesc, exists := item["port_description"]; exists {
		if portDesc, ok := rawPortDesc.(string); ok {
			res.hasPortDescription = true
			if cleaned := devices.SanitizeInterfaceDescription(portDesc); cleaned != "" {
				res.portDescription = cleaned
			}
		}
	}

	var currUpPtr *bool
	if up, ok := item["is_up"].(bool); ok {
		res.currUpVal = up
		currUpPtr = &up
	}

	if adminUp, ok := item["admin_up"].(bool); ok {
		res.adminUp = adminUp
	} else if prev != nil {
		res.adminUp = prev.AdminUp
	}

	if duplex, ok := item["duplex_status"].(string); ok && strings.TrimSpace(duplex) != "" {
		res.duplexStatus = normalizeDuplexStatus(duplex)
	} else if prev != nil && strings.TrimSpace(prev.DuplexStatus) != "" {
		res.duplexStatus = prev.DuplexStatus
	}

	if lldMon, ok := item["lld_monitored"].(bool); ok {
		res.lldMonitored = lldMon
	} else if prev != nil {
		res.lldMonitored = prev.LLDMonitored
	}

	res.inErrors = mapInterfaceInt64OrZero(item, "if_in_errors", "in_errors")
	res.outErrors = mapInterfaceInt64OrZero(item, "if_out_errors", "out_errors")
	res.inDiscards = mapInterfaceInt64OrZero(item, "if_in_discards", "in_discards")
	res.outDiscards = mapInterfaceInt64OrZero(item, "if_out_discards", "out_discards")

	if prev != nil && prev.LastUpdated != nil {
		res.inErrorRate = CalculateCounterRate(prev.InErrors, res.inErrors, *prev.LastUpdated, collectedAt)
		res.outErrorRate = CalculateCounterRate(prev.OutErrors, res.outErrors, *prev.LastUpdated, collectedAt)
	}

	res.utilIn, res.utilOut, res.speedUnknown = resolveInterfaceUtilizationForUpsert(item, prev)

	var prevUpPtr *bool
	var prevFlaps int
	var prevChange *time.Time
	if prev != nil {
		prevUpPtr = prev.IsUp
		prevFlaps = prev.FlapCount1h
		prevChange = prev.LastStatusChangeAt
	}
	res.flapCount1h, res.lastStatusChangeAt = NextInterfaceFlapState(prevUpPtr, prevFlaps, prevChange, currUpPtr, collectedAt)
	return res
}

func resolveInterfaceUtilizationForUpsert(item map[string]interface{}, prev *deviceInterfaceState) (float64, float64, bool) {
	var speedPtr *int64
	if speed, _, ok := resolveInterfaceSpeed(item); ok {
		speedPtr = &speed
	} else if prev != nil && prev.Speed != nil {
		speedPtr = prev.Speed
	}
	if _, hasExplicitSpeed := item["ifHighSpeed"]; hasExplicitSpeed {
		if raw, ok := coerceFloat(item["ifHighSpeed"]); ok && int64(raw) <= 0 {
			zero := int64(0)
			speedPtr = &zero
		}
	}
	var inRatePtr, outRatePtr *float64
	if v, ok := coerceFloat(item["bandwidth_in"]); ok {
		inRatePtr = &v
	}
	if v, ok := coerceFloat(item["bandwidth_out"]); ok {
		outRatePtr = &v
	}
	utilIn, unknownIn := CalculateInterfaceUtilization(inRatePtr, speedPtr)
	utilOut, unknownOut := CalculateInterfaceUtilization(outRatePtr, speedPtr)
	speedUnknown := unknownIn || unknownOut
	if explicitUnknown, ok := item["speed_unknown"].(bool); ok && explicitUnknown {
		speedUnknown = true
		utilIn, utilOut = 0, 0
	}
	return utilIn, utilOut, speedUnknown
}

func mapInterfaceInt64OrZero(item map[string]interface{}, keys ...string) int64 {
	for _, key := range keys {
		if value, ok := item[key]; ok {
			if f, ok := coerceFloat(value); ok && f >= 0 {
				return int64(f)
			}
		}
	}
	return 0
}

// mapInterfaceInt64 从接口 payload 中按 key 提取整数（兼容内存路径的 uint64/int64 与 JSON 路径的 float64）；
// 缺失或不可解析时返回 nil（写入 NULL）。
func mapInterfaceInt64(item map[string]interface{}, key string) interface{} {
	value, ok := item[key]
	if !ok {
		return nil
	}
	if f, ok := coerceFloat(value); ok {
		return int64(f)
	}
	return nil
}

// mapInterfaceBool 从接口 payload 中按 key 提取布尔值（仅接受真正的 bool）；缺失时返回 nil（写入 NULL）。
func mapInterfaceBool(item map[string]interface{}, key string) interface{} {
	if value, ok := item[key].(bool); ok {
		return value
	}
	return nil
}

func assignMetricValue(resp *DeviceMetricsResponse, name string, value float64) {
	switch name {
	case "cpu_usage":
		resp.CPUUsage = &value
	case "memory_usage":
		resp.MemoryUsage = &value
	case "disk_usage":
		resp.DiskUsage = &value
	case "temperature":
		resp.Temperature = &value
	case "uptime", "system_uptime":
		parsed := int64(value)
		resp.Uptime = &parsed
	case "bandwidth_in", "network_bytes_in", "throughput_in":
		converted := networkMetricToMbps(value, name)
		resp.BandwidthIn = &converted
	case "bandwidth_out", "network_bytes_out", "throughput_out":
		converted := networkMetricToMbps(value, name)
		resp.BandwidthOut = &converted
	case "packet_loss":
		resp.PacketLoss = &value
	default:
		if resp.CustomMetrics == nil {
			resp.CustomMetrics = make(map[string]interface{})
		}
		resp.CustomMetrics[name] = value
	}
}

func coerceFloat(raw interface{}) (float64, bool) {
	switch value := raw.(type) {
	case float64:
		return value, true
	case float32:
		return float64(value), true
	case int:
		return float64(value), true
	case int64:
		return float64(value), true
	case int32:
		return float64(value), true
	case uint:
		return float64(value), true
	case uint64:
		return float64(value), true
	case json.Number:
		parsed, err := value.Float64()
		return parsed, err == nil
	case string:
		parsed, err := strconv.ParseFloat(strings.TrimSpace(value), 64)
		return parsed, err == nil
	default:
		return 0, false
	}
}

// insertDeviceMetricsRaw inserts device metrics using raw SQL to work with TimescaleDB hypertables
func insertDeviceMetricsRaw(tx *gorm.DB, metrics []DeviceMetric) error {
	if len(metrics) == 0 {
		return nil
	}

	// Ensure sequence exists
	_ = tx.Exec(`CREATE SEQUENCE IF NOT EXISTS device_metrics_id_seq;`).Error

	// Build batch insert SQL with ID column using nextval for sequence
	sql := `INSERT INTO device_metrics (id, device_id, metric_name, metric_value, metric_unit, interface_name, tags, collected_at, created_at) VALUES `
	values := make([]interface{}, 0, len(metrics)*8)
	placeholders := make([]string, 0, len(metrics))

	for i, m := range metrics {
		base := i * 8
		placeholders = append(placeholders, fmt.Sprintf("(nextval('device_metrics_id_seq'), $%d, $%d, $%d, $%d, $%d, $%d, $%d, $%d)",
			base+1, base+2, base+3, base+4, base+5, base+6, base+7, base+8))

		values = append(values,
			m.DeviceID,
			m.MetricName,
			m.MetricValue,
			m.MetricUnit,
			m.InterfaceName,
			m.Tags,
			m.CollectedAt,
			time.Now().UTC(),
		)
	}

	sql += strings.Join(placeholders, ", ")
	return tx.Exec(sql, values...).Error
}

// insertInterfaceMetricsRaw inserts interface metrics using raw SQL to work with TimescaleDB hypertables
func insertInterfaceMetricsRaw(tx *gorm.DB, metrics []InterfaceMetric) error {
	if len(metrics) == 0 {
		return nil
	}

	// Ensure sequence exists
	_ = tx.Exec(`CREATE SEQUENCE IF NOT EXISTS interface_metrics_id_seq;`).Error

	// Build batch insert SQL with ID column using nextval for sequence
	sql := `INSERT INTO interface_metrics (id, device_id, interface_name, metric_name, metric_value, metric_unit, tags, collected_at, created_at) VALUES `
	values := make([]interface{}, 0, len(metrics)*8)
	placeholders := make([]string, 0, len(metrics))

	for i, m := range metrics {
		base := i * 8
		placeholders = append(placeholders, fmt.Sprintf("(nextval('interface_metrics_id_seq'), $%d, $%d, $%d, $%d, $%d, $%d, $%d, $%d)",
			base+1, base+2, base+3, base+4, base+5, base+6, base+7, base+8))

		values = append(values,
			m.DeviceID,
			m.InterfaceName,
			m.MetricName,
			m.MetricValue,
			m.MetricUnit,
			m.Tags,
			m.CollectedAt,
			time.Now().UTC(),
		)
	}

	sql += strings.Join(placeholders, ", ")
	return tx.Exec(sql, values...).Error
}
