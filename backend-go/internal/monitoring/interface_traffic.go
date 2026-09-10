package monitoring

import (
	"context"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
)

// 网络流量指标名，设备级（device_metrics）与接口级（interface_metrics）共用：
// SNMP 采集写入的是 bandwidth_in/bandwidth_out，其余为外部写入路径的兼容别名。
var (
	networkInboundMetricNames  = []string{"bandwidth_in", "network_bytes_in", "throughput_in"}
	networkOutboundMetricNames = []string{"bandwidth_out", "network_bytes_out", "throughput_out"}
)

func networkAllMetricNames() []string {
	return append(append([]string{}, networkInboundMetricNames...), networkOutboundMetricNames...)
}

type upInterfaceRow struct {
	Name  string  `gorm:"column:name"`
	Alias *string `gorm:"column:alias"`
	Speed *int64  `gorm:"column:speed"`
}

type interfaceTrafficRow struct {
	Bucket   time.Time `gorm:"column:bucket"`
	Inbound  *float64  `gorm:"column:inbound"`
	Outbound *float64  `gorm:"column:outbound"`
}

// GetDeviceInterfaceTraffic 查询单台设备某个物理接口的上行/下行流量时序（Mbps）。
// 接口列表只含当前 UP 的物理口（Vlanif/LoopBack/NULL/Console/Eth-Trunk 等逻辑口剔除，
// 它们的流量已体现在物理口上）；interfaceName 为空时默认取列表首个，没有可选接口则返回空序列。
//
// 桶内先按接口 AVG 再输出：采集周期与桶宽不对齐时同一桶内会落入多个样本，
// 直接 SUM 会把这些桶成倍放大；速率类指标在桶内取均值才是正确口径。
func (w *MetricsWriter) GetDeviceInterfaceTraffic(ctx context.Context, deviceID int, start time.Time, end time.Time, interfaceName string) (DeviceInterfaceTraffic, error) {
	if w.db == nil {
		return DeviceInterfaceTraffic{}, fmt.Errorf("database not initialized")
	}

	interfaceName = strings.TrimSpace(interfaceName)
	result := DeviceInterfaceTraffic{
		DeviceID:   deviceID,
		Interface:  interfaceName,
		Interfaces: []InterfaceTrafficInterface{},
		Points:     []NetworkTrafficPoint{},
	}

	upRows := make([]upInterfaceRow, 0)
	if err := w.db.WithContext(ctx).
		Raw(`SELECT name, alias, speed FROM device_interfaces WHERE device_id = ? AND is_up = TRUE`, deviceID).
		Scan(&upRows).Error; err != nil {
		return DeviceInterfaceTraffic{}, err
	}
	sortInterfacesByIndex(upRows)

	for _, row := range upRows {
		name := strings.TrimSpace(row.Name)
		if name == "" {
			continue
		}
		label := name
		if row.Alias != nil && strings.TrimSpace(*row.Alias) != "" {
			label = strings.TrimSpace(*row.Alias)
		}
		if devices.IsLogicalInterface(label) {
			continue
		}
		result.Interfaces = append(result.Interfaces, InterfaceTrafficInterface{Name: name, Label: label, SpeedMbps: row.Speed})
	}

	if interfaceName == "" {
		if len(result.Interfaces) == 0 {
			return result, nil
		}
		interfaceName = result.Interfaces[0].Name
		result.Interface = interfaceName
	}

	query := fmt.Sprintf(
		`SELECT bucket, SUM(inbound) AS inbound, SUM(outbound) AS outbound FROM (SELECT time_bucket('%s', collected_at) AS bucket, interface_name, AVG(CASE WHEN metric_name IN (%s) THEN metric_value END) AS inbound, AVG(CASE WHEN metric_name IN (%s) THEN metric_value END) AS outbound FROM interface_metrics WHERE device_id = ? AND collected_at >= ? AND collected_at <= ? AND metric_name IN (%s) AND interface_name = ? GROUP BY bucket, interface_name) AS per_interface GROUP BY bucket ORDER BY bucket ASC`,
		bucketIntervalString(bucketSizeForRange(start, end)),
		formatMetricList(networkInboundMetricNames),
		formatMetricList(networkOutboundMetricNames),
		formatMetricList(networkAllMetricNames()),
	)

	rows := make([]interfaceTrafficRow, 0)
	if err := w.db.WithContext(ctx).Raw(query, deviceID, start, end, interfaceName).Scan(&rows).Error; err != nil {
		return DeviceInterfaceTraffic{}, err
	}

	for _, row := range rows {
		inbound := 0.0
		if row.Inbound != nil {
			inbound = *row.Inbound
		}
		outbound := 0.0
		if row.Outbound != nil {
			outbound = *row.Outbound
		}
		result.Points = append(result.Points, NetworkTrafficPoint{
			Timestamp: row.Bucket.UTC().Format(time.RFC3339Nano),
			Inbound:   bpsToMbps(inbound),
			Outbound:  bpsToMbps(outbound),
		})
	}

	return result, nil
}

// interfaceIndexOf 解析采集内部名 if<ifIndex> 中的 ifIndex；非该格式返回 false。
func interfaceIndexOf(name string) (int, bool) {
	rest, ok := strings.CutPrefix(strings.TrimSpace(name), "if")
	if !ok || rest == "" {
		return 0, false
	}
	index, err := strconv.Atoi(rest)
	if err != nil {
		return 0, false
	}
	return index, true
}

// sortInterfacesByIndex 按 ifIndex 升序（与设备面板顺序一致）；无法解析的名字排在其后按字典序。
func sortInterfacesByIndex(rows []upInterfaceRow) {
	sort.SliceStable(rows, func(i, j int) bool {
		left, leftOK := interfaceIndexOf(rows[i].Name)
		right, rightOK := interfaceIndexOf(rows[j].Name)
		if leftOK && rightOK {
			return left < right
		}
		if leftOK != rightOK {
			return leftOK
		}
		return rows[i].Name < rows[j].Name
	})
}
