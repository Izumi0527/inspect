package logs

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gosnmp/gosnmp"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/snmpmib"
)

// SNMP 轮询采集：用 MIB 表读取设备侧的告警缓冲，替代 SSH 的 display trapbuffer / display alarm active。
//
// 依据华为 S 系列产品文档（MIB 参考）：
//   - NOTIFICATION-LOG-MIB nlmLogTable / nlmLogVariableTable（§1.166）：设备已发出的 Trap 日志，
//     含时间、Trap OID 与变量绑定，「该表对读取没有限制」——即 display trapbuffer 的 SNMP 等价物；
//     但 nlmConfigLogTable 不支持 SNMP 创建，设备须先执行 snmp-agent notification-log enable，
//     否则该表恒为空（实测 S5700-28C-HI V200R001C00）；
//   - HUAWEI-ALARM-MIB hwAlarmActiveTable（§1.13.4.3）：活动告警表，「只能读取 Trap 主机的数据」，
//     本系统 IP 未配置为设备 snmp-agent target-host 时读到空表，由服务层回退 SSH；
//   - display logbuffer 的文本内容在文档中没有任何 MIB 暴露（HUAWEI-INFOCENTER-MIB 仅配置项），
//     因此 system/interface/security/recent 四类仍只能走 SSH。
const (
	oidNlmLogEntry         = "1.3.6.1.2.1.92.1.3.1.1"
	oidNlmLogVariableEntry = "1.3.6.1.2.1.92.1.3.2.1"
	oidHwAlarmActiveEntry  = "1.3.6.1.4.1.2011.5.25.180.1.8.1"

	nlmColDateAndTime    = "3"
	nlmColNotificationID = "9"
	nlmVarColID          = "2"
	nlmVarColValueType   = "3"
	hwAlarmColID         = "2"
	hwAlarmColPara       = "3"
)

// ErrSNMPLogTypeUnsupported 表示该日志类型没有 SNMP 等价物（logbuffer 文本只能 SSH 或 Syslog）。
var ErrSNMPLogTypeUnsupported = errors.New("log type has no snmp equivalent")

// nlmValueColumns 为 nlmLogVariableValueType 枚举 → 承载值的列号（文档 §1.166.4.4）。
var nlmValueColumns = map[string]string{
	"1": "4",  // counter32
	"2": "5",  // unsigned32
	"3": "6",  // timeTicks
	"4": "7",  // integer32
	"5": "9",  // ipAddress
	"6": "8",  // octetString
	"7": "10", // objectId
	"8": "11", // counter64
	"9": "12", // opaque
}

// SNMPLogCollector 通过 SNMP 读取设备告警缓冲。
type SNMPLogCollector struct {
	logger *zap.Logger
}

func NewSNMPLogCollector(logger *zap.Logger) *SNMPLogCollector {
	return &SNMPLogCollector{logger: logger}
}

// Collect 读取 trap（nlmLogTable）或 alarm（hwAlarmActiveTable）。
// 返回 (nil, nil) 表示 SNMP 可达但表为空——调用方据此决定是否回退 SSH。
func (c *SNMPLogCollector) Collect(ctx context.Context, device deviceInfo, logType string, maxEntries int) ([]logEntry, error) {
	logType = normalizeLogType(logType)
	if logType != "trap" && logType != "alarm" {
		return nil, ErrSNMPLogTypeUnsupported
	}
	if maxEntries <= 0 {
		maxEntries = 100
	}

	client, err := devices.NewSNMPClient(device.IPAddress, device.SnmpCommunity, device.SnmpVersion, device.SnmpPort, device.Tags)
	if err != nil {
		return nil, err
	}
	client.Context = ctx
	if err := client.Connect(); err != nil {
		return nil, fmt.Errorf("snmp connect failed: %w", err)
	}
	defer client.Conn.Close()

	collectedAt := time.Now().UTC()
	switch logType {
	case "alarm":
		pdus, err := devices.SNMPWalkAll(client, oidHwAlarmActiveEntry)
		if err != nil {
			return nil, fmt.Errorf("walk hwAlarmActiveTable failed: %w", err)
		}
		return parseAlarmActivePDUs(pdus, device.ID, collectedAt, maxEntries), nil
	default:
		logPDUs, err := devices.SNMPWalkAll(client, oidNlmLogEntry)
		if err != nil {
			return nil, fmt.Errorf("walk nlmLogTable failed: %w", err)
		}
		if len(logPDUs) == 0 {
			return nil, nil
		}
		varPDUs, err := devices.SNMPWalkAll(client, oidNlmLogVariableEntry)
		if err != nil {
			return nil, fmt.Errorf("walk nlmLogVariableTable failed: %w", err)
		}
		return parseNotificationLogPDUs(logPDUs, varPDUs, device.ID, collectedAt, maxEntries), nil
	}
}

// splitTableColumn 把表项实例 OID 拆成列号与索引后缀（如 entry.3.0.17 → "3", "0.17"）。
func splitTableColumn(entryOID string, name string) (column string, index string, ok bool) {
	normalized := snmpmib.NormalizeOID(name)
	if !strings.HasPrefix(normalized, entryOID+".") {
		return "", "", false
	}
	rest := normalized[len(entryOID)+1:]
	dot := strings.IndexByte(rest, '.')
	if dot <= 0 || dot == len(rest)-1 {
		return "", "", false
	}
	return rest[:dot], rest[dot+1:], true
}

// lastIndexSegment 取索引后缀的最后一段整数（logIndex / alarmIndex），用于排序。
func lastIndexSegment(index string) int {
	if pos := strings.LastIndexByte(index, '.'); pos >= 0 {
		index = index[pos+1:]
	}
	value, _ := strconv.Atoi(index)
	return value
}

type nlmLogRow struct {
	index     string
	timestamp time.Time
	hasTime   bool
	trapOID   string
	vars      []trapVar
}

// parseNotificationLogPDUs 把 nlmLogTable 与 nlmLogVariableTable 的 walk 结果组装为日志条目，
// 复用实时 Trap 的 buildTrapLog，使两条路径的消息骨架、级别与设施判定完全一致。
// 结果按 logIndex 倒序（最新在前）并截断到 maxEntries。
func parseNotificationLogPDUs(logPDUs, varPDUs []gosnmp.SnmpPDU, deviceID int, collectedAt time.Time, maxEntries int) []logEntry {
	rows := make(map[string]*nlmLogRow)
	row := func(index string) *nlmLogRow {
		if r, ok := rows[index]; ok {
			return r
		}
		r := &nlmLogRow{index: index}
		rows[index] = r
		return r
	}

	for _, pdu := range logPDUs {
		column, index, ok := splitTableColumn(oidNlmLogEntry, pdu.Name)
		if !ok {
			continue
		}
		switch column {
		case nlmColDateAndTime:
			if raw, ok := pdu.Value.([]byte); ok {
				if ts, ok := parseDateAndTime(raw); ok {
					r := row(index)
					r.timestamp, r.hasTime = ts, true
				}
			}
		case nlmColNotificationID:
			row(index).trapOID = snmpmib.NormalizeOID(normalizeTrapValue(pdu.Value))
		}
	}

	// 变量表索引 = 日志索引 + 变量序号：先按 (日志索引, 变量序号) 聚合各列，再挂到日志行
	type varCell struct {
		id        string
		valueType string
		values    map[string]string
	}
	cells := make(map[string]*varCell)
	cellOrder := make([]string, 0)
	for _, pdu := range varPDUs {
		column, index, ok := splitTableColumn(oidNlmLogVariableEntry, pdu.Name)
		if !ok {
			continue
		}
		cell, exists := cells[index]
		if !exists {
			cell = &varCell{values: map[string]string{}}
			cells[index] = cell
			cellOrder = append(cellOrder, index)
		}
		value := normalizeTrapValue(pdu.Value)
		if pdu.Type == gosnmp.ObjectIdentifier {
			value = snmpmib.NormalizeOID(value)
		}
		switch column {
		case nlmVarColID:
			cell.id = value
		case nlmVarColValueType:
			cell.valueType = value
		default:
			cell.values[column] = value
		}
	}
	sort.SliceStable(cellOrder, func(i, j int) bool {
		return lastIndexSegment(cellOrder[i]) < lastIndexSegment(cellOrder[j])
	})
	for _, index := range cellOrder {
		cell := cells[index]
		pos := strings.LastIndexByte(index, '.')
		if pos < 0 || cell.id == "" {
			continue
		}
		logIndex := index[:pos]
		r, ok := rows[logIndex]
		if !ok {
			continue
		}
		value := ""
		if column, known := nlmValueColumns[cell.valueType]; known {
			value = cell.values[column]
		}
		if value == "" {
			// 类型列缺失或未知：取列号最小的那个值列，保证结果可复现
			columns := make([]string, 0, len(cell.values))
			for column := range cell.values {
				columns = append(columns, column)
			}
			sort.Slice(columns, func(i, j int) bool { return lastIndexSegment(columns[i]) < lastIndexSegment(columns[j]) })
			for _, column := range columns {
				if cell.values[column] != "" {
					value = cell.values[column]
					break
				}
			}
		}
		r.vars = append(r.vars, trapVar{OID: cell.id, Type: "nlm:" + cell.valueType, Value: value})
	}

	ordered := make([]*nlmLogRow, 0, len(rows))
	for _, r := range rows {
		if r.trapOID == "" {
			continue
		}
		ordered = append(ordered, r)
	}
	sort.SliceStable(ordered, func(i, j int) bool {
		return lastIndexSegment(ordered[i].index) > lastIndexSegment(ordered[j].index)
	})
	if len(ordered) > maxEntries {
		ordered = ordered[:maxEntries]
	}

	entries := make([]logEntry, 0, len(ordered))
	for _, r := range ordered {
		timestamp := collectedAt
		if r.hasTime {
			timestamp = r.timestamp
		}
		snapshot := trapSnapshot{
			TrapOID:    r.trapOID,
			Version:    "notification-log",
			PDUType:    "nlmLogEntry",
			Variables:  r.vars,
			ReceivedAt: timestamp,
		}
		message, level, facility, raw := buildTrapLog(snapshot)
		entries = append(entries, logEntry{
			DeviceID:     deviceID,
			Level:        level,
			Facility:     facility,
			Source:       "snmp",
			Message:      message,
			RawMessage:   raw,
			LogTimestamp: timestamp,
			CollectedAt:  collectedAt,
		})
	}
	return entries
}

// parseAlarmActivePDUs 把 hwAlarmActiveTable 的 walk 结果组装为日志条目。
// 表无时间列，log_timestamp 取采集时间，去重退化为按内容（同一活动告警反复轮询只入库一次）。
func parseAlarmActivePDUs(pdus []gosnmp.SnmpPDU, deviceID int, collectedAt time.Time, maxEntries int) []logEntry {
	type alarmRow struct {
		index string
		id    string
		para  string
	}
	rows := make(map[string]*alarmRow)
	order := make([]string, 0)
	for _, pdu := range pdus {
		column, index, ok := splitTableColumn(oidHwAlarmActiveEntry, pdu.Name)
		if !ok {
			continue
		}
		r, exists := rows[index]
		if !exists {
			r = &alarmRow{index: index}
			rows[index] = r
			order = append(order, index)
		}
		switch column {
		case hwAlarmColID:
			r.id = snmpmib.NormalizeOID(normalizeTrapValue(pdu.Value))
		case hwAlarmColPara:
			r.para = normalizeTrapValue(pdu.Value)
		}
	}
	sort.SliceStable(order, func(i, j int) bool {
		return lastIndexSegment(order[i]) < lastIndexSegment(order[j])
	})

	catalog := alarmCatalog()
	entries := make([]logEntry, 0, len(order))
	for _, index := range order {
		if len(entries) >= maxEntries {
			break
		}
		r := rows[index]
		if r.id == "" {
			continue
		}
		level, facility := "warning", "system"
		label := r.id
		if def, ok := catalog.LookupTrap(r.id); ok {
			level, facility = def.Level, def.Facility
			label = fmt.Sprintf("%s (%s)", r.id, def.Name)
		}
		message := "Active alarm " + label
		if strings.TrimSpace(r.para) != "" {
			message += " | " + strings.TrimSpace(r.para)
		}
		entries = append(entries, logEntry{
			DeviceID:     deviceID,
			Level:        level,
			Facility:     facility,
			Source:       "snmp",
			Message:      message,
			RawMessage:   message,
			LogTimestamp: collectedAt,
			CollectedAt:  collectedAt,
		})
	}
	return entries
}

// parseDateAndTime 解析 SNMPv2-TC DateAndTime（8 字节本地时间或 11 字节带时区偏移）。
// 8 字节形态没有时区信息，按服务器本地时间解释，与 SSH 采集的 parseTrapTimestamp 口径一致。
func parseDateAndTime(raw []byte) (time.Time, bool) {
	if len(raw) != 8 && len(raw) != 11 {
		return time.Time{}, false
	}
	year := int(raw[0])<<8 | int(raw[1])
	month, day := int(raw[2]), int(raw[3])
	hour, minute, second := int(raw[4]), int(raw[5]), int(raw[6])
	deci := int(raw[7])
	if year == 0 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 60 || deci > 9 {
		return time.Time{}, false
	}
	location := time.Local
	if len(raw) == 11 {
		offset := int(raw[9])*3600 + int(raw[10])*60
		if raw[8] == '-' {
			offset = -offset
		}
		location = time.FixedZone("", offset)
	}
	return time.Date(year, time.Month(month), day, hour, minute, second, deci*100_000_000, location).UTC(), true
}

// ParseNotificationLogPDUsForTest / ParseAlarmActivePDUsForTest 为外置测试入口，
// 返回入库前的 DeviceLog 记录（经 buildDeviceLogRecords 归一），生产路径不使用。
func ParseNotificationLogPDUsForTest(logPDUs, varPDUs []gosnmp.SnmpPDU, deviceID int, collectedAt time.Time, maxEntries int) []DeviceLog {
	return buildDeviceLogRecords(parseNotificationLogPDUs(logPDUs, varPDUs, deviceID, collectedAt, maxEntries))
}

func ParseAlarmActivePDUsForTest(pdus []gosnmp.SnmpPDU, deviceID int, collectedAt time.Time, maxEntries int) []DeviceLog {
	return buildDeviceLogRecords(parseAlarmActivePDUs(pdus, deviceID, collectedAt, maxEntries))
}
