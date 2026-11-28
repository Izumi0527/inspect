package devices

import (
	"bytes"
	"context"
	"fmt"
	"math"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/gosnmp/gosnmp"
	"github.com/your-org/inspect-system/backend-go/internal/snmpmib"
	"go.uber.org/zap"
	"golang.org/x/text/encoding/simplifiedchinese"
)

// SNMPMetrics 保存采集的 SNMP 指标
type SNMPMetrics struct {
	CPUUsage            *float64                    `json:"cpu_usage,omitempty"`
	MemoryUsage         *float64                    `json:"memory_usage,omitempty"`
	MemoryTotal         *int64                      `json:"memory_total,omitempty"`
	MemoryUsed          *int64                      `json:"memory_used,omitempty"`
	Temperature         *float64                    `json:"temperature,omitempty"`
	BGPPeers            []BGPNeighborMetrics        `json:"bgp_peers,omitempty"`
	OpticalTransceivers []OpticalTransceiverMetrics `json:"optical_transceivers,omitempty"`
	Components          []ComponentStatusMetrics    `json:"components,omitempty"`
	PoE                 PoEMetrics                  `json:"poe,omitempty"`
	Uptime              *int64                      `json:"uptime,omitempty"`
	Model               *string                     `json:"model,omitempty"`            // 设备型号，如 S5700-28P-LI-AC
	FirmwareVersion     *string                     `json:"firmware_version,omitempty"` // 软件/固件版本，如 V200R019C00SPC500
	SerialNumber        *string                     `json:"serial_number,omitempty"`    // 设备序列号，如 210235A1B2C3
	PatchVersion        *string                     `json:"patch_version,omitempty"`    // 补丁版本，如 V200R024SPH010、P08
	// DetectedType 是按 sysDescr / LLDP 能力位 / sysServices 推断的设备类型（switch/router/firewall/ap），
	// 只回填 devices.detected_device_type，不覆盖用户填写的 device_type；推断不出为 nil。
	DetectedType *string `json:"detected_type,omitempty"`
	// Neighbors 是 LLDP 邻居表；LLDPAvailable=false 表示本轮没读到该表（不支持/未放行），
	// 写入端据此保留旧邻居而不是清空——两者语义不同，不能只看切片长度。
	Neighbors     []NeighborMetrics `json:"neighbors,omitempty"`
	LLDPAvailable bool              `json:"lldp_available,omitempty"`
	// LLDPStatus 是 LLDP 可用性判定（ok/mib_unreachable/disabled），空值表示本轮无结论；回填 devices.lldp_status。
	LLDPStatus LLDPStatus `json:"lldp_status,omitempty"`
	// SysName / ChassisID 是设备自身的 LLDP 身份：sysName.0 与 lldpLocChassisId（不可读时退回
	// dot1dBaseBridgeAddress，华为的 LLDP 机箱 ID 就是桥 MAC）。回填 devices.detected_sys_name /
	// detected_chassis_id，让拓扑组装能把别的设备上报的邻居匹配回本机——台账名是中文、
	// LLDP 管理地址取到别的 VLANIF 时，这是唯一能对上的键。
	SysName      *string  `json:"sys_name,omitempty"`
	ChassisID    *string  `json:"chassis_id,omitempty"`
	BandwidthIn  *float64 `json:"bandwidth_in,omitempty"`  // 入站带宽，单位：bps（比特每秒）
	BandwidthOut *float64 `json:"bandwidth_out,omitempty"` // 出站带宽，单位：bps（比特每秒）
	// STP 保存生成树（BRIDGE-MIB dot1dStp）指标，用于巡检拓扑稳定性
	STP             STPMetrics              `json:"stp,omitempty"`
	Stack           StackMetrics            `json:"stack,omitempty"`
	ConfigSave      ConfigSaveMetrics       `json:"config_save,omitempty"`
	VLAN            VLANMetrics             `json:"vlan,omitempty"`
	FlashPartitions []FlashPartitionMetrics `json:"flash_partitions,omitempty"`
	Interfaces      []InterfaceMetrics      `json:"interfaces,omitempty"`
	// Disks 是主机的固定磁盘分区（HOST-RESOURCES-MIB hrStorageFixedDisk），服务器巡检使用；
	// 网络设备不实现该表，恒为空。
	Disks          []DiskMetrics              `json:"disks,omitempty"`
	Diagnostics    *SNMPCollectionDiagnostics `json:"diagnostics,omitempty"`
	CollectedAt    time.Time                  `json:"collected_at"`
	CollectionTime float64                    `json:"collection_time_ms"`
}

// DiskMetrics 是一个固定磁盘分区的容量快照，字节数已按分配单元换算。
type DiskMetrics struct {
	// Mount 是挂载点（Linux）或盘符（Windows，已去掉卷标与序列号）
	Mount      string `json:"mount"`
	TotalBytes int64  `json:"total_bytes"`
	UsedBytes  int64  `json:"used_bytes"`
}

// MaxReasonableBandwidthBps 最大合理带宽：10 Gbps = 10,000,000,000 bps
// 全项目唯一权威定义：采集端用于拒绝异常速率写入；monitoring 包转发导出，
// 供查询端过滤历史脏数据及 dashboard 等消费方引用。
const MaxReasonableBandwidthBps = 10_000_000_000

// RateSampleMaxGap 是相邻两次接口计数器采样的最大间隔：超过即不计算速率，以本次读数重新建立基线；
// 速率缓存里超过它未更新的条目也会被淘汰（再旧的读数已算不出速率）。
// 必须大于「1 个采集节奏 + 抖动」，否则正常相邻样本会被当成中断而丢掉速率；取 ≥ 2 × 节奏
// （scheduler.MetricsCollectionInterval）是为了让慢轮后补跑的样本（间隔约 7–9 分钟）仍能算出平均速率。
// devices 包不能 import scheduler（反向依赖），由 tests/backend-go/internal/scheduler 下的跨包守卫测试把关。
const RateSampleMaxGap = 10 * time.Minute

// InterfaceMetrics 保存每个接口的指标
type InterfaceMetrics struct {
	Name            string   `json:"name"`
	Description     string   `json:"description,omitempty"`
	PortDescription *string  `json:"port_description,omitempty"`
	Speed           *int64   `json:"speed,omitempty"` // 接口速率，单位：Mbps
	InOctets        *uint64  `json:"in_octets,omitempty"`
	OutOctets       *uint64  `json:"out_octets,omitempty"`
	InRate          *float64 `json:"in_rate,omitempty"`  // 入站速率，单位：bps（比特每秒）
	OutRate         *float64 `json:"out_rate,omitempty"` // 出站速率，单位：bps（比特每秒）
	IsUp            *bool    `json:"is_up,omitempty"`    // 接口运行状态：IfOperStatus=1 为 up

	// AdminUp 是管理状态（ifAdminStatus=1 为 up）。与 IsUp 配合才能区分
	// 「人为 shutdown」（admin down）与「链路故障」（admin up 但 oper down）——
	// 只看 IsUp 会把运维主动关闭的端口也报成异常。
	AdminUp *bool `json:"admin_up,omitempty"`

	// 错包与丢弃是两类不同的问题：错包（Errors）指向物理层劣化——光衰、跳线
	// 老化、接头氧化、电磁干扰；丢弃（Discards）指向缓冲区溢出、QoS 队列丢弃
	// 或 ACL 拒绝，即拥塞与配置问题。合成一个指标会让配置问题被当成线路问题查。
	// 均为设备上电以来的累计计数器，比率的分母是 UcastPkts。
	InErrors      *uint64 `json:"in_errors,omitempty"`
	OutErrors     *uint64 `json:"out_errors,omitempty"`
	InDiscards    *uint64 `json:"in_discards,omitempty"`
	OutDiscards   *uint64 `json:"out_discards,omitempty"`
	InUcastPkts   *uint64 `json:"in_ucast_pkts,omitempty"`
	OutUcastPkts  *uint64 `json:"out_ucast_pkts,omitempty"`
	InNUcastPkts  *uint64 `json:"in_nucast_pkts,omitempty"`
	OutNUcastPkts *uint64 `json:"out_nucast_pkts,omitempty"`

	// DuplexStatus 取自 EtherLike-MIB 的 dot3StatsDuplexStatus：
	// 1=unknown、2=halfDuplex、3=fullDuplex。千兆口协商成半双工是经典故障，
	// 会同时引发大量错包与性能腰斩——它解释的正是 InErrors 升高的原因。
	DuplexStatus *int `json:"duplex_status,omitempty"`
}

// STPMetrics 保存 RFC 1493 (BRIDGE-MIB) 生成树指标
type STPMetrics struct {
	ProtocolSpec            *int64 `json:"protocol_spec,omitempty"`
	TimeSinceTopologyChange *int64 `json:"time_since_topology_change,omitempty"` // 单位：秒
	TopChanges              *int64 `json:"top_changes,omitempty"`
	Priority                *int64 `json:"priority,omitempty"`
	DesignatedRoot          string `json:"designated_root,omitempty"`
	RootCost                *int64 `json:"root_cost,omitempty"`
	RootPort                *int64 `json:"root_port,omitempty"`
	BpduGuard               *int64 `json:"bpdu_guard,omitempty"`
}

// BGPNeighborMetrics 保存通过厂商扩展 MIB 采集到的 BGP 邻居摘要。
type BGPNeighborMetrics struct {
	Index           string  `json:"index"`
	State           *int    `json:"state,omitempty"`
	StateLabel      string  `json:"state_label,omitempty"`
	EstablishedTime *int64  `json:"established_time_seconds,omitempty"`
	LastError       *string `json:"last_error,omitempty"`
}

// OpticalTransceiverMetrics 保存光模块诊断摘要。
type OpticalTransceiverMetrics struct {
	Index           string   `json:"index"`
	Name            string   `json:"name,omitempty"`
	VendorSN        string   `json:"vendor_sn,omitempty"`
	Temperature     *float64 `json:"temperature,omitempty"`
	TemperatureUnit string   `json:"temperature_unit,omitempty"`
	Voltage         *float64 `json:"voltage,omitempty"`
	VoltageUnit     string   `json:"voltage_unit,omitempty"`
	BiasCurrent     *float64 `json:"bias_current,omitempty"`
	BiasCurrentUnit string   `json:"bias_current_unit,omitempty"`
	TxPower         *float64 `json:"tx_power,omitempty"`
	TxPowerUnit     string   `json:"tx_power_unit,omitempty"`
	RxPower         *float64 `json:"rx_power,omitempty"`
	RxPowerUnit     string   `json:"rx_power_unit,omitempty"`
}

// ComponentStatusMetrics 保存风扇、电源、单板等部件的状态。
//
// State 是**厂商原始状态码**，采集端刻意在基础采集函数里保留原值；
// enrichComponents 基于已确认的厂商/实体类型上下文补齐 Name、StatusLabel 与 StatusLevel。
type ComponentStatusMetrics struct {
	Index string `json:"index"`
	Name  string `json:"name,omitempty"`
	// Kind 取 fan / power / board，由 catalog 条目 ID 推断
	Kind        string `json:"kind"`
	State       *int64 `json:"state,omitempty"`
	StatusLabel string `json:"status_label,omitempty"`
	StatusLevel string `json:"status_level,omitempty"`
}

// PoEPortMetrics 保存单个 PoE 端口的供电数据。
type PoEPortMetrics struct {
	Index          string   `json:"index"`
	Name           string   `json:"name,omitempty"`
	ConsumingPower *float64 `json:"consuming_power,omitempty"`
	PeakPower      *float64 `json:"peak_power,omitempty"`
	Unit           string   `json:"unit,omitempty"`
}

// PoEMetrics 保存设备的 PoE 供电概况。
//
// 两类数据不可互相替代：RemainingPower（PSE 剩余保障功率）回答「还能再接几个 AP」，
// Ports 回答「哪个口在吃电」。厂商支持度不同——H3C 上报剩余功率，华为只有端口功率，
// 因此检查项需要按可得数据分别处理。
type PoEMetrics struct {
	Ports          []PoEPortMetrics `json:"ports,omitempty"`
	RemainingPower *float64         `json:"remaining_power,omitempty"`
	RemainingUnit  string           `json:"remaining_unit,omitempty"`
}

type snmpClient interface {
	Get(oids []string) (*gosnmp.SnmpPacket, error)
	BulkWalkAll(oid string) ([]gosnmp.SnmpPDU, error)
}

// SNMPCollector 通过 SNMP 采集详细指标
type SNMPCollector struct {
	logger   *zap.Logger
	registry *snmpmib.Registry
	// 用于速率计算的缓存
	lastOctets map[string]map[int]octetsCache
	mu         sync.RWMutex
}

type octetsCache struct {
	inOctets  uint64
	outOctets uint64
	timestamp time.Time
}

// NewSNMPCollector 创建一个新的 SNMP 采集器
func NewSNMPCollector(logger *zap.Logger) *SNMPCollector {
	registry, err := snmpmib.DefaultRegistry()
	if err != nil && logger != nil {
		logger.Error("加载 SNMP MIB 注册表失败", zap.Error(err))
	}
	return NewSNMPCollectorWithRegistry(logger, registry)
}

func NewSNMPCollectorWithRegistry(logger *zap.Logger, registry *snmpmib.Registry) *SNMPCollector {
	c := &SNMPCollector{
		logger:     logger,
		registry:   registry,
		lastOctets: make(map[string]map[int]octetsCache),
	}
	go c.evictStaleOctets()
	return c
}

func (c *SNMPCollector) getRegistry() (*snmpmib.Registry, error) {
	c.mu.RLock()
	registry := c.registry
	c.mu.RUnlock()
	if registry != nil {
		return registry, nil
	}

	loaded, err := snmpmib.DefaultRegistry()
	if err != nil {
		return nil, err
	}

	c.mu.Lock()
	if c.registry == nil {
		c.registry = loaded
	}
	registry = c.registry
	c.mu.Unlock()
	return registry, nil
}

// evictStaleOctets 定期清理超过 RateSampleMaxGap 未更新的速率缓存条目（再旧的读数已算不出速率），防止 map 无限膨胀
func (c *SNMPCollector) evictStaleOctets() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		c.mu.Lock()
		for ip, ifMap := range c.lastOctets {
			for idx, cache := range ifMap {
				if time.Since(cache.timestamp) > RateSampleMaxGap {
					delete(ifMap, idx)
				}
			}
			if len(ifMap) == 0 {
				delete(c.lastOctets, ip)
			}
		}
		c.mu.Unlock()
	}
}

// rateSampleUsable 判断距上一次计数器采样的间隔能否用来计算速率：间隔必须为正（排除时钟回拨），
// 且小于 RateSampleMaxGap。
func rateSampleUsable(elapsed time.Duration) bool {
	return elapsed > 0 && elapsed < RateSampleMaxGap
}

// CollectMetrics 从设备采集所有可用的指标
func (c *SNMPCollector) CollectMetrics(
	ctx context.Context,
	ipAddress string,
	vendor string,
	snmpCommunity *string,
	snmpVersion *string,
	snmpPort *int,
	tags interface{},
) (*SNMPMetrics, error) {
	start := time.Now()

	config := resolveSNMPConfig(snmpCommunity, snmpVersion, snmpPort, tags)
	if config.version == "1" || config.version == "2c" {
		if strings.TrimSpace(config.community) == "" {
			return nil, fmt.Errorf("SNMP community not configured")
		}
	}

	if c.logger != nil {
		c.logger.Info("collecting SNMP metrics",
			zap.String("ip", ipAddress),
			zap.String("version", config.version),
			zap.Uint16("port", config.port))
	}

	registry, err := c.getRegistry()
	if err != nil {
		return nil, fmt.Errorf("failed to load SNMP MIB registry: %w", err)
	}

	target := c.createSNMPTarget(ipAddress, config)
	if err := target.Connect(); err != nil {
		if c.logger != nil {
			c.logger.Error("SNMP connect failed", zap.String("ip", ipAddress), zap.Error(err))
		}
		return nil, fmt.Errorf("SNMP connect failed: %w", err)
	}
	defer target.Conn.Close()

	client := newResilientSNMPClientWithContext(ctx, target)
	sysObjectID := snmpmib.NormalizeOID(readStringScalar(client, registry.Common.System.SysObjectID.OID))
	sysDescr := readStringScalar(client, registry.Common.Probe.SysDescr.OID)
	effectiveVendor := registry.ResolveVendorByContext(vendor, sysObjectID, sysDescr)
	canonicalPrefix, activePrefix := registry.ResolveEnterprisePrefix(vendor, sysObjectID, sysDescr)
	diag := newSNMPCollectionDiagnostics(vendor, effectiveVendor, sysObjectID, canonicalPrefix, activePrefix)

	metrics := &SNMPMetrics{
		CollectedAt: time.Now().UTC(),
	}

	// 采集系统运行时间
	c.collectUptime(client, metrics, registry)
	if c.logger != nil && metrics.Uptime != nil {
		c.logger.Debug("collected uptime", zap.Int64("uptime", *metrics.Uptime))
	}

	// 采集 CPU 使用率
	c.collectCPUWithDeviceContext(client, metrics, registry, vendor, sysObjectID, sysDescr, diag)
	if c.logger != nil && metrics.CPUUsage != nil {
		c.logger.Debug("collected CPU", zap.Float64("cpu", *metrics.CPUUsage))
	}

	// 采集内存使用率
	c.collectMemoryWithDeviceContext(client, metrics, registry, vendor, sysObjectID, sysDescr, diag)
	if c.logger != nil && metrics.MemoryUsage != nil {
		c.logger.Debug("collected memory", zap.Float64("memory", *metrics.MemoryUsage))
	}

	// 采集主机磁盘分区（HOST-RESOURCES-MIB，仅服务器有数据；网络设备一次 walk 即返回空）
	c.collectHostStorage(client, metrics, registry)
	if c.logger != nil && len(metrics.Disks) > 0 {
		c.logger.Debug("collected disks", zap.Int("count", len(metrics.Disks)))
	}

	// 采集温度
	c.collectTemperatureWithDeviceContext(client, metrics, registry, vendor, sysObjectID, sysDescr, diag)
	if c.logger != nil && metrics.Temperature != nil {
		c.logger.Debug("collected temperature", zap.Float64("temp", *metrics.Temperature))
	}

	// 采集 BGP 邻居摘要
	c.collectBGPWithDeviceContext(client, metrics, registry, vendor, sysObjectID, sysDescr, diag)
	if c.logger != nil && len(metrics.BGPPeers) > 0 {
		c.logger.Debug("collected bgp peers", zap.Int("count", len(metrics.BGPPeers)))
	}

	entityCatalog := newEntityCatalog(client, registry)

	// 采集光模块诊断摘要
	c.collectOpticalWithDeviceContext(client, metrics, registry, vendor, sysObjectID, sysDescr, diag)
	if c.logger != nil && len(metrics.OpticalTransceivers) > 0 {
		c.logger.Debug("collected optical transceivers", zap.Int("count", len(metrics.OpticalTransceivers)))
	}

	// 采集风扇、电源、单板状态：硬件基础健康，比 CPU/内存更早暴露物理隐患
	c.collectComponentsWithDeviceContext(client, metrics, registry, vendor, sysObjectID, sysDescr, entityCatalog, diag)
	if c.logger != nil && len(metrics.Components) > 0 {
		c.logger.Debug("collected components", zap.Int("count", len(metrics.Components)))
	}

	// 采集 PoE 供电概况（仅 PoE 交换机有数据）
	c.collectPoEWithDeviceContext(client, metrics, registry, vendor, sysObjectID, sysDescr, diag)
	if c.logger != nil && (len(metrics.PoE.Ports) > 0 || metrics.PoE.RemainingPower != nil) {
		c.logger.Debug("collected poe", zap.Int("ports", len(metrics.PoE.Ports)))
	}

	// 采集设备型号、软件版本与序列号（低频变化的静态属性，用于回填设备档案）
	c.collectDeviceIdentityWithDeviceContext(client, metrics, registry, vendor, sysDescr, true, sysObjectID, true, entityCatalog)
	if c.logger != nil && (metrics.Model != nil || metrics.FirmwareVersion != nil || metrics.SerialNumber != nil) {
		c.logger.Debug("collected device identity",
			zap.Stringp("model", metrics.Model),
			zap.Stringp("firmware_version", metrics.FirmwareVersion),
			zap.Stringp("serial_number", metrics.SerialNumber))
	}

	// 推断设备类型（交换机/路由器/防火墙/AP），放在 identity 之后以复用已解析的型号
	c.collectDeviceClassificationWithSysDescr(client, metrics, registry, sysDescr, true)
	if c.logger != nil && metrics.DetectedType != nil {
		c.logger.Debug("collected device classification", zap.Stringp("detected_type", metrics.DetectedType))
	}

	// 采集 LLDP 邻居（拓扑连线数据源）与设备自身 LLDP 身份
	c.collectNeighborsWithDeviceContext(client, metrics, registry, vendor, sysObjectID, sysDescr, diag)
	if c.logger != nil {
		c.logger.Debug("collected lldp",
			zap.String("status", string(metrics.LLDPStatus)),
			zap.Bool("available", metrics.LLDPAvailable),
			zap.Int("count", len(metrics.Neighbors)))
	}

	// 采集生成树 STP 拓扑指标（BRIDGE-MIB dot1dStp）
	c.collectSTP(client, metrics, registry)
	c.collectSwitchExtendedMetrics(client, metrics, registry, vendor, sysObjectID, sysDescr, diag)
	if c.logger != nil && (metrics.STP.ProtocolSpec != nil || metrics.STP.TimeSinceTopologyChange != nil || metrics.STP.TopChanges != nil) {
		c.logger.Debug("collected stp",
			zap.Int64p("protocol_spec", metrics.STP.ProtocolSpec),
			zap.Int64p("time_since_topology_change", metrics.STP.TimeSinceTopologyChange),
			zap.Int64p("top_changes", metrics.STP.TopChanges))
	}

	// 采集接口指标
	c.collectInterfaces(client, ipAddress, metrics, registry)
	if len(metrics.OpticalTransceivers) > 0 {
		ifaceNames := buildInterfaceNameIndex(metrics.Interfaces)
		metrics.OpticalTransceivers = enrichOpticalTransceivers(metrics.OpticalTransceivers, effectiveVendor, entityCatalog, ifaceNames)
	}
	if c.logger != nil {
		c.logger.Debug("collected interfaces", zap.Int("count", len(metrics.Interfaces)))
	}

	elapsed := time.Since(start)
	metrics.CollectionTime = float64(elapsed.Milliseconds())
	diag.TotalElapsedMs = elapsed.Milliseconds()
	metrics.Diagnostics = CompactSNMPDiagnostics(diag)

	if c.logger != nil && (metrics.CPUUsage == nil || metrics.MemoryUsage == nil) {
		c.logger.Warn("SNMP CPU or memory metrics unavailable",
			zap.String("ip", ipAddress),
			zap.String("input_vendor", vendor),
			zap.String("effective_vendor", effectiveVendor),
			zap.String("sys_object_id", sysObjectID),
			zap.String("sys_descr_head", sysDescrHead(sysDescr)),
			zap.Bool("missing_cpu", metrics.CPUUsage == nil),
			zap.Bool("missing_memory", metrics.MemoryUsage == nil),
			zap.String("candidate_diagnostics", FormatCandidateDiagnosticsLog(metrics.Diagnostics)))
	}

	if c.logger != nil {
		c.logger.Info("SNMP metrics collection completed",
			zap.String("ip", ipAddress),
			zap.Float64("duration_ms", metrics.CollectionTime),
			zap.Bool("has_cpu", metrics.CPUUsage != nil),
			zap.Bool("has_memory", metrics.MemoryUsage != nil),
			zap.Bool("has_temp", metrics.Temperature != nil),
			zap.Int("interfaces", len(metrics.Interfaces)))
	}

	return metrics, nil
}

func (c *SNMPCollector) createSNMPTarget(ipAddress string, config snmpConfig) *gosnmp.GoSNMP {
	return newSNMPTarget(ipAddress, config)
}

func (c *SNMPCollector) collectUptime(target snmpClient, metrics *SNMPMetrics, registry *snmpmib.Registry) {
	if seconds := readTimeticksSeconds(target, registry.Common.System.SysUptime.OID); seconds != nil {
		metrics.Uptime = seconds
	}
	// 服务器上的 sysUpTime 只是 SNMP 代理（snmpd）的运行时长，重启代理就清零；
	// hrSystemUptime 才是开机时长，读得到时以它为准。单独发 GET：SNMPv1 下与
	// sysUpTime 合并请求时，设备不认识的 OID 会让整个请求失败。
	if seconds := readTimeticksSeconds(target, registry.Common.HostResources.SystemUptime.OID); seconds != nil {
		metrics.Uptime = seconds
	}
}

// readTimeticksSeconds 读取一个 TimeTicks 标量并换算为秒；取不到返回 nil。
func readTimeticksSeconds(target snmpClient, oid string) *int64 {
	if strings.TrimSpace(oid) == "" {
		return nil
	}
	result, err := target.Get([]string{oid})
	if err != nil || result == nil {
		return nil
	}

	for _, variable := range result.Variables {
		if variable.Type == gosnmp.TimeTicks {
			seconds := gosnmp.ToBigInt(variable.Value).Int64() / 100
			return &seconds
		}
		if value, ok := numericPDUInt64(variable); ok {
			seconds := value / 100
			return &seconds
		}
	}
	return nil
}

// collectSTP 采集 RFC 1493 (BRIDGE-MIB) 生成树标量指标
func (c *SNMPCollector) collectSTP(
	target snmpClient,
	metrics *SNMPMetrics,
	registry *snmpmib.Registry,
) {
	if registry == nil {
		return
	}
	if oid := strings.TrimSpace(registry.Common.BridgeSTP.StpProtocolSpec.OID); oid != "" {
		metrics.STP.ProtocolSpec = readNumericScalar(target, oid)
	}
	if oid := strings.TrimSpace(registry.Common.BridgeSTP.StpTimeSinceTopologyChange.OID); oid != "" {
		metrics.STP.TimeSinceTopologyChange = readTimeticksSeconds(target, oid)
	}
	if oid := strings.TrimSpace(registry.Common.BridgeSTP.StpTopChanges.OID); oid != "" {
		metrics.STP.TopChanges = readNumericScalar(target, oid)
	}
	stp := registry.Common.BridgeSTP
	metrics.STP.Priority = readNumericScalar(target, stp.StpPriority.OID)
	metrics.STP.DesignatedRoot = readSTPBridgeID(target, stp.StpDesignatedRoot.OID)
	metrics.STP.RootCost = readNumericScalar(target, stp.StpRootCost.OID)
	metrics.STP.RootPort = readNumericScalar(target, stp.StpRootPort.OID)
}

// readNumericScalar 读取单个数值型标量 OID（Integer 或 Counter32）；取不到返回 nil。
func readNumericScalar(target snmpClient, oid string) *int64 {
	if strings.TrimSpace(oid) == "" {
		return nil
	}
	packet, err := target.Get([]string{oid})
	if err != nil || packet == nil || len(packet.Variables) == 0 {
		return nil
	}
	val, ok := numericPDUInt64(packet.Variables[0])
	if !ok {
		return nil
	}
	return &val
}

// hrStorageFixedDiskType 是 HOST-RESOURCES-TYPES 中固定磁盘的类型 OID。
// 内存（hrStorageRam）、网络盘（hrStorageNetworkDisk）、光驱、可移动盘都不参与磁盘使用率判定。
const hrStorageFixedDiskType = "1.3.6.1.2.1.25.2.1.4"

// collectHostStorage 一次 walk hrStorageEntry 取回全部列，挑出固定磁盘分区。
func (c *SNMPCollector) collectHostStorage(target snmpClient, metrics *SNMPMetrics, registry *snmpmib.Registry) {
	oid := strings.TrimSpace(registry.Common.HostResources.StorageEntry.OID)
	if oid == "" {
		return
	}
	pdus, err := target.BulkWalkAll(oid)
	if err != nil || len(pdus) == 0 {
		return
	}
	metrics.Disks = parseHostStorageDisks(pdus)
}

// parseHostStorageDisks 从 hrStorageEntry 的 walk 结果里解析固定磁盘分区，按索引升序。
// 列号：.2 类型、.3 描述、.4 分配单元（字节）、.5 容量、.6 已用（后两者以分配单元计）。
// 分配单元非法或计数为负（老代理 Integer32 溢出）的行无法换算，直接丢弃；
// 容量为 0 的行保留，由巡检判定层决定如何呈现。纯函数，便于测试。
func parseHostStorageDisks(pdus []gosnmp.SnmpPDU) []DiskMetrics {
	type storageRow struct {
		fixed          bool
		descr          string
		units          int64
		size, used     int64
		hasSize, hasUs bool
	}
	rows := make(map[int]*storageRow)
	rowOf := func(index int) *storageRow {
		if rows[index] == nil {
			rows[index] = &storageRow{}
		}
		return rows[index]
	}

	// walk 结果都在 hrStorageEntry 子树内，OID 末两段即「列号.索引」（hrStorageIndex 为单个整数）
	for _, pdu := range pdus {
		parts := strings.Split(strings.TrimSpace(pdu.Name), ".")
		if len(parts) < 2 {
			continue
		}
		column := parts[len(parts)-2]
		index, err := strconv.Atoi(parts[len(parts)-1])
		if err != nil || index <= 0 {
			continue
		}
		switch column {
		case "2":
			typeOID := strings.TrimPrefix(strings.TrimSpace(formatSNMPValue(pdu.Value)), ".")
			rowOf(index).fixed = typeOID == hrStorageFixedDiskType
		case "3":
			rowOf(index).descr = formatSNMPValue(pdu.Value)
		case "4":
			if value, ok := numericPDUInt64(pdu); ok {
				rowOf(index).units = value
			}
		case "5":
			if value, ok := numericPDUInt64(pdu); ok {
				rowOf(index).size, rowOf(index).hasSize = value, true
			}
		case "6":
			if value, ok := numericPDUInt64(pdu); ok {
				rowOf(index).used, rowOf(index).hasUs = value, true
			}
		}
	}

	indexes := make([]int, 0, len(rows))
	for index := range rows {
		indexes = append(indexes, index)
	}
	sort.Ints(indexes)

	disks := make([]DiskMetrics, 0, len(indexes))
	for _, index := range indexes {
		row := rows[index]
		if !row.fixed || !row.hasSize || !row.hasUs || row.units <= 0 || row.size < 0 || row.used < 0 {
			continue
		}
		disks = append(disks, DiskMetrics{
			Mount:      storageMountName(row.descr),
			TotalBytes: row.size * row.units,
			UsedBytes:  row.used * row.units,
		})
	}
	return disks
}

// storageMountName 清洗存储描述：Windows 形如 `C:\ Label:System  Serial Number 5a3c9f10`，
// 只留盘符；Linux 的描述本身就是挂载点。
func storageMountName(descr string) string {
	name := strings.TrimSpace(descr)
	if idx := strings.Index(name, " Label:"); idx >= 0 {
		name = strings.TrimSpace(name[:idx])
	}
	return name
}

func (c *SNMPCollector) resolveMetricCandidates(metricName string, vendor string) []snmpmib.MetricCandidate {
	registry, err := c.getRegistry()
	if err != nil || registry == nil {
		return nil
	}
	return registry.MetricCandidates(metricName, vendor)
}

func (c *SNMPCollector) resolveMetricCandidatesForDevice(
	metricName string,
	vendor string,
	sysObjectID string,
	sysDescr string,
) []snmpmib.MetricCandidate {
	registry, err := c.getRegistry()
	if err != nil || registry == nil {
		return nil
	}
	return registry.MetricCandidatesForDevice(metricName, vendor, sysObjectID, sysDescr)
}

func (c *SNMPCollector) collectCPU(
	target snmpClient,
	metrics *SNMPMetrics,
	registry *snmpmib.Registry,
	vendor string,
) {
	c.collectCPUWithDeviceContext(target, metrics, registry, vendor, "", "", nil)
}

func (c *SNMPCollector) collectCPUWithDeviceContext(
	target snmpClient,
	metrics *SNMPMetrics,
	registry *snmpmib.Registry,
	vendor string,
	sysObjectID string,
	sysDescr string,
	diag *SNMPCollectionDiagnostics,
) {
	_ = registry
	candidates := c.resolveMetricCandidatesForDevice("cpu_usage", vendor, sysObjectID, sysDescr)
	metrics.CPUUsage = collectCPUFromCandidatesWithDiagnostics(target, candidates, c.logger, diag)
}

func (c *SNMPCollector) collectMemory(
	target snmpClient,
	metrics *SNMPMetrics,
	registry *snmpmib.Registry,
	vendor string,
) {
	c.collectMemoryWithDeviceContext(target, metrics, registry, vendor, "", "", nil)
}

func (c *SNMPCollector) collectMemoryWithDeviceContext(
	target snmpClient,
	metrics *SNMPMetrics,
	registry *snmpmib.Registry,
	vendor string,
	sysObjectID string,
	sysDescr string,
	diag *SNMPCollectionDiagnostics,
) {
	_ = registry
	candidates := c.resolveMetricCandidatesForDevice("memory_usage", vendor, sysObjectID, sysDescr)
	metrics.MemoryUsage, metrics.MemoryTotal, metrics.MemoryUsed = collectMemoryFromCandidatesWithDiagnostics(
		target,
		candidates,
		c.logger,
		diag,
	)
}

func (c *SNMPCollector) collectTemperature(
	target snmpClient,
	metrics *SNMPMetrics,
	registry *snmpmib.Registry,
	vendor string,
) {
	c.collectTemperatureWithDeviceContext(target, metrics, registry, vendor, "", "", nil)
}

func (c *SNMPCollector) collectTemperatureWithDeviceContext(
	target snmpClient,
	metrics *SNMPMetrics,
	registry *snmpmib.Registry,
	vendor string,
	sysObjectID string,
	sysDescr string,
	diag *SNMPCollectionDiagnostics,
) {
	_ = registry
	candidates := c.resolveMetricCandidatesForDevice("temperature", vendor, sysObjectID, sysDescr)
	metrics.Temperature = collectTemperatureFromCandidatesWithDiagnostics(target, candidates, diag)
}

func (c *SNMPCollector) collectBGP(
	target snmpClient,
	metrics *SNMPMetrics,
	registry *snmpmib.Registry,
	vendor string,
) {
	c.collectBGPWithDeviceContext(target, metrics, registry, vendor, "", "", nil)
}

func (c *SNMPCollector) collectBGPWithDeviceContext(
	target snmpClient,
	metrics *SNMPMetrics,
	registry *snmpmib.Registry,
	vendor string,
	sysObjectID string,
	sysDescr string,
	diag *SNMPCollectionDiagnostics,
) {
	metrics.BGPPeers = collectBGPPeersFromCatalogWithDiagnostics(
		target,
		registry.CatalogEntriesForDevice(vendor, "bgp", sysObjectID, sysDescr),
		diag,
	)
}

func (c *SNMPCollector) collectOptical(
	target snmpClient,
	metrics *SNMPMetrics,
	registry *snmpmib.Registry,
	vendor string,
) {
	c.collectOpticalWithDeviceContext(target, metrics, registry, vendor, "", "", nil)
}

func (c *SNMPCollector) collectOpticalWithDeviceContext(
	target snmpClient,
	metrics *SNMPMetrics,
	registry *snmpmib.Registry,
	vendor string,
	sysObjectID string,
	sysDescr string,
	diag *SNMPCollectionDiagnostics,
) {
	metrics.OpticalTransceivers = collectOpticalTransceiversFromCatalogWithDiagnostics(
		target,
		registry.CatalogEntriesForDevice(vendor, "optical", sysObjectID, sysDescr),
		diag,
	)
}

const (
	maxInterfaceDescriptionBytes = 255
)

// decodeSNMPTextValue 将 SNMP OctetString 解码为 UTF-8 文本；非 UTF-8 字节按 GBK 尝试解码（兼容中文设备描述）。
func decodeSNMPTextValue(value interface{}) string {
	switch raw := value.(type) {
	case []byte:
		trimmed := bytes.Trim(raw, "\x00")
		if len(trimmed) == 0 {
			return ""
		}
		if utf8.Valid(trimmed) {
			return string(trimmed)
		}
		decoded, err := simplifiedchinese.GBK.NewDecoder().Bytes(trimmed)
		if err != nil || !utf8.Valid(decoded) {
			return ""
		}
		return string(decoded)
	case string:
		return raw
	default:
		return ""
	}
}

// SanitizeInterfaceDescription 清洗接口描述（ifAlias）：规范化制表/换行，拦截控制字符并按 UTF-8 rune 边界截断至 255 字节。
func SanitizeInterfaceDescription(value string) string {
	trimmed := strings.Trim(value, "\x00")
	if trimmed == "" || !utf8.ValidString(trimmed) {
		return ""
	}
	var b strings.Builder
	b.Grow(len(trimmed))
	prevSpace := false
	for _, r := range trimmed {
		if r == '\r' || r == '\n' || r == '\t' {
			if !prevSpace {
				b.WriteByte(' ')
				prevSpace = true
			}
			continue
		}
		if r < 0x20 || r == 0x7f {
			return ""
		}
		b.WriteRune(r)
		prevSpace = r == ' '
	}
	cleaned := strings.TrimSpace(b.String())
	if cleaned == "" {
		return ""
	}
	return truncateUTF8Bytes(cleaned, maxInterfaceDescriptionBytes)
}

func truncateUTF8Bytes(s string, maxBytes int) string {
	if maxBytes <= 0 || len(s) <= maxBytes {
		return s
	}
	end := 0
	for idx, r := range s {
		runeLen := utf8.RuneLen(r)
		if idx+runeLen > maxBytes {
			break
		}
		end = idx + runeLen
	}
	return strings.TrimSpace(s[:end])
}

func fillMissingInterfaceNames(target snmpClient, interfaces map[int]*InterfaceMetrics, rawOID string) {
	ifNameOID := strings.TrimSpace(rawOID)
	if ifNameOID == "" || len(interfaces) == 0 {
		return
	}
	needsFallback := false
	for _, iface := range interfaces {
		if strings.TrimSpace(iface.Description) == "" {
			needsFallback = true
			break
		}
	}
	if !needsFallback {
		return
	}
	rows, err := target.BulkWalkAll(ifNameOID)
	if err != nil || len(rows) == 0 {
		return
	}
	for _, v := range rows {
		if v.Type != gosnmp.OctetString {
			continue
		}
		idx, err := strconv.Atoi(extractOIDIndexSuffix(v.Name, ifNameOID))
		if err != nil || idx <= 0 {
			continue
		}
		if iface, exists := interfaces[idx]; exists && strings.TrimSpace(iface.Description) == "" {
			if name := strings.TrimSpace(formatSNMPValue(v.Value)); name != "" {
				iface.Description = name
			}
		}
	}
}

func collectInterfacePortDescriptions(target snmpClient, interfaces map[int]*InterfaceMetrics, rawOID string) {
	ifAliasOID := strings.TrimSpace(rawOID)
	if ifAliasOID == "" || len(interfaces) == 0 {
		return
	}
	rows, err := target.BulkWalkAll(ifAliasOID)
	if err != nil {
		return
	}
	aliasByIndex := make(map[int]string, len(rows))
	for _, v := range rows {
		if v.Type != gosnmp.OctetString {
			continue
		}
		idx, err := strconv.Atoi(extractOIDIndexSuffix(v.Name, ifAliasOID))
		if err != nil || idx <= 0 {
			continue
		}
		aliasByIndex[idx] = SanitizeInterfaceDescription(decodeSNMPTextValue(v.Value))
	}
	for idx, iface := range interfaces {
		desc := aliasByIndex[idx]
		iface.PortDescription = &desc
	}
}

// walkInterfaceValues 按接口索引 walk 一个 OID，并用 assign 把值写入对应接口。
//
// OID 为空（registry 未定义该项）或 walk 失败时静默返回：接口健康类 OID 都是
// 可选能力，老设备与精简 agent 不上报属预期，不应影响其余字段的采集，更不该
// 让整个接口采集中断。
//
// 抽出此函数是新增 8 个接口 OID 的前提——逐个内联展开会让 collectInterfaces
// 从 200 行涨到 300 行以上，且 8 段代码只有赋值目标不同。
func walkInterfaceValues(
	target snmpClient,
	oid string,
	interfaces map[int]*InterfaceMetrics,
	assign func(iface *InterfaceMetrics, value uint64),
) {
	if strings.TrimSpace(oid) == "" {
		return
	}
	result, err := target.BulkWalkAll(oid)
	if err != nil {
		return
	}
	for _, v := range result {
		idx := extractIndexFromOID(v.Name)
		iface, exists := interfaces[idx]
		if !exists {
			continue
		}
		assign(iface, gosnmp.ToBigInt(v.Value).Uint64())
	}
}

// collectComponents 采集风扇、电源、单板的原始状态码（catalog 分类 environment）。
// 仅华为与 H3C 定义了对应 OID，其他厂商采不到属预期，由检查项判 skip。
func (c *SNMPCollector) collectComponents(
	target snmpClient,
	metrics *SNMPMetrics,
	registry *snmpmib.Registry,
	vendor string,
) {
	c.collectComponentsWithCatalog(target, metrics, registry, vendor, newEntityCatalog(target, registry))
}

func (c *SNMPCollector) collectComponentsWithCatalog(
	target snmpClient,
	metrics *SNMPMetrics,
	registry *snmpmib.Registry,
	vendor string,
	catalog *entityCatalog,
) {
	c.collectComponentsWithDeviceContext(target, metrics, registry, vendor, "", "", catalog, nil)
}

func (c *SNMPCollector) collectComponentsWithDeviceContext(
	target snmpClient,
	metrics *SNMPMetrics,
	registry *snmpmib.Registry,
	vendor string,
	sysObjectID string,
	sysDescr string,
	catalog *entityCatalog,
	diag *SNMPCollectionDiagnostics,
) {
	effectiveVendor := vendor
	if registry != nil {
		effectiveVendor = registry.ResolveVendorByContext(vendor, sysObjectID, sysDescr)
	}
	envEntries := registry.CatalogEntriesForDevice(vendor, "environment", sysObjectID, sysDescr)
	raw := collectComponentsFromCatalogWithDiagnostics(
		target,
		envEntries,
		diag,
	)
	metrics.Components = enrichComponentsWithFaultLights(target, enrichComponents(raw, effectiveVendor, catalog), envEntries)
}

// collectPoE 采集 PoE 供电概况（catalog 分类 poe）。非 PoE 设备返回零值。
func (c *SNMPCollector) collectPoE(
	target snmpClient,
	metrics *SNMPMetrics,
	registry *snmpmib.Registry,
	vendor string,
) {
	c.collectPoEWithDeviceContext(target, metrics, registry, vendor, "", "", nil)
}

func (c *SNMPCollector) collectPoEWithDeviceContext(
	target snmpClient,
	metrics *SNMPMetrics,
	registry *snmpmib.Registry,
	vendor string,
	sysObjectID string,
	sysDescr string,
	diag *SNMPCollectionDiagnostics,
) {
	metrics.PoE = collectPoEFromCatalogWithDiagnostics(
		target,
		registry.CatalogEntriesForDevice(vendor, "poe", sysObjectID, sysDescr),
		diag,
	)
}

func (c *SNMPCollector) collectInterfaces(
	target snmpClient,
	ipAddress string,
	metrics *SNMPMetrics,
	registry *snmpmib.Registry,
) {
	descrResult, err := target.BulkWalkAll(registry.Common.Interfaces.IfDescr.OID)
	if err != nil {
		return
	}

	interfaces := make(map[int]*InterfaceMetrics)
	for _, v := range descrResult {
		if v.Type != gosnmp.OctetString {
			continue
		}
		idx := extractIndexFromOID(v.Name)
		if idx <= 0 {
			continue
		}
		descr := formatSNMPValue(v.Value)
		interfaces[idx] = &InterfaceMetrics{
			Name:        fmt.Sprintf("if%d", idx),
			Description: descr,
		}
	}

	if len(interfaces) == 0 {
		return
	}

	fillMissingInterfaceNames(target, interfaces, registry.Common.Interfaces.IfName.OID)
	collectInterfacePortDescriptions(target, interfaces, registry.Common.Interfaces.IfAlias.OID)

	speedResult, _ := target.BulkWalkAll(registry.Common.Interfaces.IfHighSpeed.OID)
	for _, v := range speedResult {
		speed, ok := numericPDUInt64(v)
		if !ok {
			continue
		}
		idx := extractIndexFromOID(v.Name)
		if iface, exists := interfaces[idx]; exists {
			iface.Speed = &speed
		}
	}

	// ifHighSpeed（Mbps，RFC2863）是首选；不上报该 OID 的老设备回退 ifSpeed（bps）补齐，
	// 否则这些接口会因缺少容量基线而无法参与利用率评估。
	collectLegacyIfSpeed(target, interfaces, registry)

	// 采集接口运行状态 IfOperStatus（1=up, 2=down, ...），用于 device_interfaces.is_up
	if statusOID := registry.Common.Interfaces.IfOperStatus.OID; statusOID != "" {
		statusResult, _ := target.BulkWalkAll(statusOID)
		for _, v := range statusResult {
			status, ok := numericPDUInt64(v)
			if !ok {
				continue
			}
			idx := extractIndexFromOID(v.Name)
			if iface, exists := interfaces[idx]; exists {
				up := status == 1
				iface.IsUp = &up
			}
		}
	}

	// 接口健康类指标。四类数据回答四个不同问题：
	// admin 状态区分「人为 shutdown」与「链路故障」；错包指向物理层劣化；
	// 丢弃指向拥塞与 ACL/QoS 配置；双工解释错包为何升高（半双工协商失败）。
	// 包计数是错包率与丢弃率的分母。
	ifaceOIDs := registry.Common.Interfaces
	walkInterfaceValues(target, ifaceOIDs.IfAdminStatus.OID, interfaces, func(iface *InterfaceMetrics, value uint64) {
		up := value == 1
		iface.AdminUp = &up
	})
	walkInterfaceValues(target, ifaceOIDs.IfInErrors.OID, interfaces, func(iface *InterfaceMetrics, value uint64) {
		v := value
		iface.InErrors = &v
	})
	walkInterfaceValues(target, ifaceOIDs.IfOutErrors.OID, interfaces, func(iface *InterfaceMetrics, value uint64) {
		v := value
		iface.OutErrors = &v
	})
	walkInterfaceValues(target, ifaceOIDs.IfInDiscards.OID, interfaces, func(iface *InterfaceMetrics, value uint64) {
		v := value
		iface.InDiscards = &v
	})
	walkInterfaceValues(target, ifaceOIDs.IfOutDiscards.OID, interfaces, func(iface *InterfaceMetrics, value uint64) {
		v := value
		iface.OutDiscards = &v
	})
	walkInterfaceValues(target, ifaceOIDs.IfInUcastPkts.OID, interfaces, func(iface *InterfaceMetrics, value uint64) {
		v := value
		iface.InUcastPkts = &v
	})
	walkInterfaceValues(target, ifaceOIDs.IfOutUcastPkts.OID, interfaces, func(iface *InterfaceMetrics, value uint64) {
		v := value
		iface.OutUcastPkts = &v
	})
	walkInterfaceValues(target, ifaceOIDs.IfInNUcastPkts.OID, interfaces, func(iface *InterfaceMetrics, value uint64) {
		v := value
		iface.InNUcastPkts = &v
	})
	walkInterfaceValues(target, ifaceOIDs.IfOutNUcastPkts.OID, interfaces, func(iface *InterfaceMetrics, value uint64) {
		v := value
		iface.OutNUcastPkts = &v
	})
	// 双工取自 EtherLike-MIB（非 IF-MIB），仅以太网口有意义，其余接口取不到属预期
	walkInterfaceValues(target, registry.Common.Ethernet.Dot3DuplexStatus.OID, interfaces, func(iface *InterfaceMetrics, value uint64) {
		duplex := int(value)
		iface.DuplexStatus = &duplex
	})

	now := time.Now()
	inResult, _ := target.BulkWalkAll(registry.Common.Interfaces.IfHCInOctets.OID)
	outResult, _ := target.BulkWalkAll(registry.Common.Interfaces.IfHCOutOctets.OID)
	if len(inResult) == 0 {
		inResult, _ = target.BulkWalkAll(registry.Common.Interfaces.IfInOctets.OID)
	}
	if len(outResult) == 0 {
		outResult, _ = target.BulkWalkAll(registry.Common.Interfaces.IfOutOctets.OID)
	}

	for _, v := range inResult {
		idx := extractIndexFromOID(v.Name)
		if iface, exists := interfaces[idx]; exists {
			octets := gosnmp.ToBigInt(v.Value).Uint64()
			iface.InOctets = &octets
		}
	}

	for _, v := range outResult {
		idx := extractIndexFromOID(v.Name)
		if iface, exists := interfaces[idx]; exists {
			octets := gosnmp.ToBigInt(v.Value).Uint64()
			iface.OutOctets = &octets
		}
	}

	c.mu.Lock()
	if c.lastOctets[ipAddress] == nil {
		c.lastOctets[ipAddress] = make(map[int]octetsCache)
	}
	lastCache := c.lastOctets[ipAddress]

	var totalInRate float64
	var totalOutRate float64
	ratedInterfaces := 0
	for idx, iface := range interfaces {
		if iface.InOctets == nil || iface.OutOctets == nil {
			continue
		}

		if last, ok := lastCache[idx]; ok {
			gap := now.Sub(last.timestamp)
			elapsed := gap.Seconds()
			if rateSampleUsable(gap) {
				if *iface.InOctets < last.inOctets || *iface.OutOctets < last.outOctets {
					lastCache[idx] = octetsCache{
						inOctets:  *iface.InOctets,
						outOctets: *iface.OutOctets,
						timestamp: now,
					}
					continue
				}

				inDiff := *iface.InOctets - last.inOctets
				outDiff := *iface.OutOctets - last.outOctets
				inRateBps := (float64(inDiff) / elapsed) * 8
				outRateBps := (float64(outDiff) / elapsed) * 8

				if inRateBps > MaxReasonableBandwidthBps || outRateBps > MaxReasonableBandwidthBps {
					if c.logger != nil {
						c.logger.Warn("unreasonable bandwidth detected, skipping sample",
							zap.String("interface", iface.Description),
							zap.Float64("in_rate_bps", inRateBps),
							zap.Float64("in_rate_gbps", inRateBps/1_000_000_000),
							zap.Float64("out_rate_bps", outRateBps),
							zap.Float64("out_rate_gbps", outRateBps/1_000_000_000),
							zap.Float64("threshold_gbps", float64(MaxReasonableBandwidthBps)/1_000_000_000))
					}
					lastCache[idx] = octetsCache{
						inOctets:  *iface.InOctets,
						outOctets: *iface.OutOctets,
						timestamp: now,
					}
					continue
				}

				if iface.Speed != nil && *iface.Speed > 0 {
					maxSpeedBps := float64(*iface.Speed) * 1_000_000
					if inRateBps > maxSpeedBps*1.2 || outRateBps > maxSpeedBps*1.2 {
						if c.logger != nil {
							c.logger.Warn("bandwidth exceeds interface speed, skipping sample",
								zap.String("interface", iface.Description),
								zap.Float64("in_rate_bps", inRateBps),
								zap.Float64("out_rate_bps", outRateBps),
								zap.Float64("interface_speed_bps", maxSpeedBps),
								zap.Float64("threshold_bps", maxSpeedBps*1.2))
						}
						lastCache[idx] = octetsCache{
							inOctets:  *iface.InOctets,
							outOctets: *iface.OutOctets,
							timestamp: now,
						}
						continue
					}
				}

				iface.InRate = &inRateBps
				iface.OutRate = &outRateBps
				if !IsAggregateExcludedInterface(iface.Description) {
					totalInRate += inRateBps
					totalOutRate += outRateBps
					ratedInterfaces++
				}
			}
		} else {
			lastCache[idx] = octetsCache{
				inOctets:  *iface.InOctets,
				outOctets: *iface.OutOctets,
				timestamp: now,
			}
			continue
		}

		lastCache[idx] = octetsCache{
			inOctets:  *iface.InOctets,
			outOctets: *iface.OutOctets,
			timestamp: now,
		}
	}
	c.mu.Unlock()

	// 没有任何接口算出速率（重启后首轮、长时间未采集后重建基线、计数器回绕）时不写总带宽：
	// 写 0 会把「本轮没有数据」伪装成「流量为 0」，聚合流量图在这些时间点掉到 0。
	if ratedInterfaces > 0 {
		metrics.BandwidthIn = &totalInRate
		metrics.BandwidthOut = &totalOutRate
	}

	for _, iface := range interfaces {
		metrics.Interfaces = append(metrics.Interfaces, *iface)
	}
}

// legacyIfSpeedCapMbps 是 ifSpeed（32 位 Gauge，单位 bps）能表达的速率上限约 4.29Gbps
// 换算成 Mbps 的取值。达到该量级说明数值已被 32 位封顶（万兆及以上接口的典型表现），
// 此时按封顶值计算利用率会虚高数倍，宁可不写入速率——让该接口判"无法评估"，
// 也好过误报链路拥塞。
const legacyIfSpeedCapMbps = 4294

// collectLegacyIfSpeed 用 ifSpeed 补齐 ifHighSpeed 未覆盖的接口速率。
// 仅在确有接口缺速率时才发起额外 walk，避免给正常设备增加一次无谓的 SNMP 往返。
func collectLegacyIfSpeed(target snmpClient, interfaces map[int]*InterfaceMetrics, registry *snmpmib.Registry) {
	speedOID := registry.Common.Interfaces.IfSpeed.OID
	if speedOID == "" {
		return
	}

	needFallback := false
	for _, iface := range interfaces {
		if iface.Speed == nil {
			needFallback = true
			break
		}
	}
	if !needFallback {
		return
	}

	legacyResult, _ := target.BulkWalkAll(speedOID)
	for _, v := range legacyResult {
		bps, ok := numericPDUInt64(v)
		if !ok || bps <= 0 {
			continue
		}
		idx := extractIndexFromOID(v.Name)
		iface, exists := interfaces[idx]
		if !exists || iface.Speed != nil {
			continue
		}
		mbps := bps / 1_000_000
		if mbps <= 0 || mbps >= legacyIfSpeedCapMbps {
			continue
		}
		iface.Speed = &mbps
	}
}

// 从 sysDescr 兜底解析型号与版本的模式。
// 华为 VRP 典型串："...Software VRP (R) software, Version 5.170 (S5700-28P-LI-AC V200R019C00SPC500) Copyright..."
// 括号内「型号 版本」成对出现，是可信度最高的兜底来源。
var (
	sysDescrModelVersionRe = regexp.MustCompile(`\((?:(?i:CloudEngine|Quidway|FutureMatrix)\s+)?([A-Za-z][A-Za-z0-9][A-Za-z0-9\-_/.]{1,40})\s+(V\d+R\d+[A-Za-z0-9]*)\)`)
	sysDescrVRPVersionRe   = regexp.MustCompile(`\b(V\d+R\d+[A-Za-z0-9]*)\b`)
	sysDescrVersionRe      = regexp.MustCompile(`(?i)\bversion\s+([A-Za-z0-9][A-Za-z0-9._-]{0,30})`)
	huaweiV600PlatformRe   = regexp.MustCompile(`(?i)\bV600(?:R\d+[A-Za-z0-9]*)?\b`)
	huaweiV200PlatformRe   = regexp.MustCompile(`(?i)\bV200(?:R\d+[A-Za-z0-9]*)?\b`)
	// 型号样式：字母开头、无空格、且至少含一段 -/_ 分隔的后缀（板型标识），
	// 例如 S5700-28C-HI、AR2220-S。要求分隔后缀是为了把 "Linux"、"Huawei"
	// 这类首行普通单词挡在外面。
	sysDescrModelLineRe = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9]*(?:[-_/][A-Za-z0-9]+)+$`)
	// entPhysicalSoftwareRev 常见形如 "Version 3.30 V200R001C00"，
	// 开头的 "Version" 是描述词而非版本内容，去掉后档案更干净。
	identityVersionPrefixRe = regexp.MustCompile(`(?i)^\s*(software\s+version|version|ver)\s*[:：]?\s*`)

	// 补丁提取规则：显式声明、热补丁标识、H3C/锐捷 Release 内嵌补丁（华为 SPCxxx 属于基础软件服务包，不视为热补丁）
	patchExplicitRe        = regexp.MustCompile(`(?i)(?:patch\s+version|patch|补丁版本|补丁)\s*[:：=]\s*([A-Za-z0-9][A-Za-z0-9._-]*)`)
	patchHotfixTokenRe     = regexp.MustCompile(`(?i)\b(V\d+R\d+[A-Za-z0-9]*SPH\d+[A-Za-z0-9]*|SPH\d+[A-Za-z0-9]*|HP\d{3,}[A-Za-z0-9]*)\b`)
	patchEmbeddedReleaseRe = regexp.MustCompile(`(?i)(?:\b(?:release|ess)\s+[A-Za-z0-9]*?\d+(P\d+[A-Za-z0-9]*)\b|\b\d+\.\d+\([^)]+\)[A-Za-z0-9]+?(P\d+[A-Za-z0-9]*)\b)`)
	patchVRPTokenRe        = regexp.MustCompile(`(?i)\bV\d+R\d+[A-Za-z0-9]*\b`)
	patchHuaweiSPCRe       = regexp.MustCompile(`(?i)^SPC\d+[A-Za-z0-9]*$`)
)

// sanitizeIdentityValue 清理设备自报字符串的冗余前缀与空白。
// 只剥离描述性前缀，不改写版本内容本身；剥离后为空则保留原值，
// 避免把一个信息量虽低但真实的取值抹成空。
func sanitizeIdentityValue(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	cleaned := strings.TrimSpace(identityVersionPrefixRe.ReplaceAllString(trimmed, ""))
	if cleaned == "" {
		return trimmed
	}
	return cleaned
}

// parseDeviceIdentityFromSysDescr 从 sysDescr 兜底提取型号与软件版本。
// 纯函数，便于测试。只在能高置信匹配时才返回型号——sysDescr 是自由文本，
// 宁可留空让用户手填，也不要往设备档案里写一个猜错的型号。
//
// 型号优先取开头：华为 VRP 的 sysDescr 常把**带板型后缀的完整型号**放在最前
// （"S5700-28C-HI\r\nHuawei Versatile Routing Platform..."），而括号内的
// "(S5700 V200R001C00)" 只是产品系列简称。实测 S5700-28C-HI 上
// entPhysicalModelName 整列为空，sysDescr 开头是唯一能拿到完整型号的来源。
func parseDeviceIdentityFromSysDescr(sysDescr string) (model string, version string) {
	text := strings.TrimSpace(sysDescr)
	if text == "" {
		return "", ""
	}

	model = extractModelFromSysDescrHead(text)

	if m := sysDescrModelVersionRe.FindStringSubmatch(text); len(m) == 3 {
		if model == "" {
			model = strings.TrimSpace(m[1])
		}
		return model, strings.TrimSpace(m[2])
	}

	if m := sysDescrVRPVersionRe.FindStringSubmatch(text); len(m) == 2 {
		return model, strings.TrimSpace(m[1])
	}
	if m := sysDescrVersionRe.FindStringSubmatch(text); len(m) == 2 {
		return model, strings.TrimSpace(strings.TrimRight(m[1], ",;"))
	}
	return model, ""
}

// DetectHuaweiPlatform 根据软件版本或 sysDescr 识别华为软件平台（"V600" / "V200" / ""）。
func DetectHuaweiPlatform(version, sysDescr string) string {
	for _, candidate := range []string{version, sysDescr} {
		trimmed := strings.TrimSpace(candidate)
		if trimmed == "" {
			continue
		}
		if huaweiV600PlatformRe.MatchString(trimmed) {
			return "V600"
		}
		if huaweiV200PlatformRe.MatchString(trimmed) {
			return "V200"
		}
	}
	return ""
}

// extractModelFromSysDescrHead 在 sysDescr 开头形如型号时返回它，否则返回空。
//
// 取"首个空白分隔的 token"（遇到 CloudEngine / Quidway 品牌前缀时取第二个 token）
// 而非严格意义的首行：sysDescr 经 formatSNMPValue 会把 \r\n 压成空格（probe.go 为单行展示
// 做的清洗），换行边界已不可依赖，但完整型号仍稳定处在最前。Cisco/Linux 那类开头是普通单词
// （"Cisco"、"Linux"）的设备会因缺少 -/_ 板型后缀而落空，回退其它策略。
func extractModelFromSysDescrHead(sysDescr string) string {
	head := sysDescr
	if idx := strings.IndexAny(head, "\r\n"); idx >= 0 {
		head = head[:idx]
	}
	fields := strings.Fields(head)
	if len(fields) == 0 {
		return ""
	}
	candidate := fields[0]
	if isHuaweiModelBrandPrefix(candidate) && len(fields) >= 2 {
		candidate = fields[1]
	}
	if len(candidate) < 2 || len(candidate) > 40 {
		return ""
	}
	if !sysDescrModelLineRe.MatchString(candidate) {
		return ""
	}
	return candidate
}

func isHuaweiModelBrandPrefix(token string) bool {
	return strings.EqualFold(token, "CloudEngine") ||
		strings.EqualFold(token, "Quidway") ||
		strings.EqualFold(token, "FutureMatrix")
}

// firstNonEmptyWalkValue 返回 walk 结果中第一个非空字符串值。
// ENTITY-MIB 会把每个物理实体（机框/单板/风扇/光模块）都列一行，多数行的
// 型号与版本字段为空，取首个非空值即整机或主控信息。
func firstNonEmptyWalkValue(client snmpClient, oid string) string {
	if strings.TrimSpace(oid) == "" {
		return ""
	}
	rows, err := client.BulkWalkAll(oid)
	if err != nil {
		return ""
	}
	for _, v := range rows {
		if v.Type != gosnmp.OctetString {
			continue
		}
		if value := strings.TrimSpace(formatSNMPValue(v.Value)); value != "" {
			return value
		}
	}
	return ""
}

// isNonePatchValue 判定是否为显式声明的“无补丁”占位文案。
func isNonePatchValue(v string) bool {
	lower := strings.ToLower(strings.TrimSpace(v))
	return lower == "" || lower == "none" || lower == "null" || lower == "n/a" || lower == "nil" || lower == "无"
}

// IsHuaweiSPCSegment 判断 patch 是否为误从华为 VRP 软件版本号中截出的 SPCxxx 服务包后缀。
func IsHuaweiSPCSegment(patch, softwareVersion string) bool {
	trimmedPatch := strings.TrimSpace(patch)
	if !patchHuaweiSPCRe.MatchString(trimmedPatch) {
		return false
	}
	upperPatch := strings.ToUpper(trimmedPatch)
	for _, token := range patchVRPTokenRe.FindAllString(softwareVersion, -1) {
		if strings.Contains(strings.ToUpper(token), upperPatch) {
			return true
		}
	}
	return false
}

// extractEmbeddedPatch 从固件版本或 sysDescr 文本中提取内嵌的补丁标识（H3C/锐捷 Pxx）。
func extractEmbeddedPatch(text string) string {
	if m := patchEmbeddedReleaseRe.FindStringSubmatch(text); len(m) >= 2 {
		val := m[1]
		if val == "" && len(m) > 2 {
			val = m[2]
		}
		if trimmed := strings.Trim(val, " \t\r\n,;:.()[]"); trimmed != "" {
			return trimmed
		}
	}
	return ""
}

// ExtractPatchVersion 从 sysDescr 与固件版本字符串中提取补丁版本号。
// 纯函数，供 devices 采集、handlers 巡检判定及 reports 报告渲染共用。
func ExtractPatchVersion(sysDescr string, firmwareVersion string) string {
	texts := []string{firmwareVersion, sysDescr}

	// 1. 显式声明：Patch Version: xxx / 补丁版本: xxx
	for _, text := range texts {
		if text == "" {
			continue
		}
		if m := patchExplicitRe.FindStringSubmatch(text); len(m) == 2 {
			val := strings.Trim(m[1], " \t\r\n,;:.()[]")
			if !isNonePatchValue(val) {
				return val
			}
		}
	}

	// 2. 独立热补丁标识：如 V200R019SPH020、SPH020、HPxxx
	for _, text := range texts {
		if text == "" {
			continue
		}
		if m := patchHotfixTokenRe.FindStringSubmatch(text); len(m) == 2 {
			val := strings.Trim(m[1], " \t\r\n,;:.()[]")
			if val != "" {
				return val
			}
		}
	}

	// 3. 固件版本内嵌补丁号：如 H3C Release 2612P08 -> P08、锐捷 P2
	for _, text := range texts {
		if text == "" {
			continue
		}
		if val := extractEmbeddedPatch(text); val != "" {
			return val
		}
	}

	return ""
}

const (
	huaweiPatchVersionOID         = "1.3.6.1.4.1.2011.5.25.19.1.8.5.1.1.4"
	huaweiPatchOperateStateOID    = "1.3.6.1.4.1.2011.5.25.19.1.8.5.1.1.14"
	huaweiPatchUsedFileNameOID    = "1.3.6.1.4.1.2011.5.25.19.1.8.5.1.1.3"
	huaweiSysCurPatchFileIndexOID = "1.3.6.1.4.1.2011.5.25.19.1.2.1.1.6"
	huaweiPatchFileVersionOID     = "1.3.6.1.4.1.2011.5.25.19.1.8.2.1.5"
	huaweiPatchFileNameOID        = "1.3.6.1.4.1.2011.5.25.19.1.8.2.1.2"
	maxPatchVersionLen            = 255
)

func sanitizePatchVersion(raw string) string {
	cleaned := strings.TrimSpace(strings.Trim(raw, "\x00\"'"))
	if cleaned == "" || len(cleaned) > maxPatchVersionLen {
		return ""
	}
	for _, r := range cleaned {
		if r < 0x20 || r >= 0x7f {
			return ""
		}
	}
	if m := patchExplicitRe.FindStringSubmatch(cleaned); len(m) == 2 {
		cleaned = m[1]
	}
	cleaned = sanitizeIdentityValue(cleaned)
	lower := strings.ToLower(strings.TrimSpace(cleaned))
	if isNonePatchValue(cleaned) || lower == "no patch" || lower == "no patch exists" || lower == "-" || lower == "0" {
		return ""
	}
	return cleaned
}

func extractPatchFromFilename(raw string) string {
	cleaned := sanitizePatchVersion(raw)
	if cleaned == "" {
		return ""
	}
	if m := patchHotfixTokenRe.FindStringSubmatch(cleaned); len(m) == 2 {
		return m[1]
	}
	if idx := strings.LastIndexAny(cleaned, "/\\:"); idx >= 0 {
		cleaned = cleaned[idx+1:]
	}
	if strings.HasSuffix(strings.ToLower(cleaned), ".pat") {
		cleaned = cleaned[:len(cleaned)-4]
	}
	return sanitizePatchVersion(cleaned)
}

func walkPatchStringMap(target snmpClient, oid string, transform func(string) string) map[string]string {
	rows, err := target.BulkWalkAll(oid)
	if err != nil || len(rows) == 0 {
		return nil
	}
	out := make(map[string]string, len(rows))
	for _, pdu := range rows {
		if pdu.Type != gosnmp.OctetString {
			continue
		}
		rawVal, ok := rawSNMPSerialString(pdu.Value)
		if !ok {
			continue
		}
		val := transform(rawVal)
		if val == "" {
			continue
		}
		suffix := extractOIDIndexSuffix(pdu.Name, oid)
		out[suffix] = val
	}
	return out
}

func walkPatchIntMap(target snmpClient, oid string) map[string]int64 {
	rows, err := target.BulkWalkAll(oid)
	if err != nil || len(rows) == 0 {
		return nil
	}
	out := make(map[string]int64, len(rows))
	for _, pdu := range rows {
		val, ok := numericPDUInt64(pdu)
		if !ok {
			continue
		}
		out[extractOIDIndexSuffix(pdu.Name, oid)] = val
	}
	return out
}

func pickHuaweiPatchByState(states map[string]int64, versions, files map[string]string) string {
	if len(states) == 0 {
		keys := make([]string, 0, len(versions))
		for k := range versions {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			if v := versions[k]; v != "" {
				return v
			}
		}
		return ""
	}
	keys := make([]string, 0, len(states))
	for k := range states {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, wantState := range []int64{1, 2} { // 1=patchRunning, 2=patchActive
		for _, k := range keys {
			if states[k] != wantState {
				continue
			}
			if v := versions[k]; v != "" {
				return v
			}
			if f := files[k]; f != "" {
				return f
			}
		}
	}
	return ""
}

func hasRunningOrActivePatchState(states map[string]int64) bool {
	for _, s := range states {
		if s == 1 || s == 2 {
			return true
		}
	}
	return false
}

func collectHuaweiPatchFromFileTable(target snmpClient, rewrite func(string) string) string {
	curIdxMap := walkPatchIntMap(target, rewrite(huaweiSysCurPatchFileIndexOID))
	curIdx := int64(0)
	keys := make([]string, 0, len(curIdxMap))
	for k := range curIdxMap {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		if curIdxMap[k] > 0 {
			curIdx = curIdxMap[k]
			break
		}
	}
	if curIdx <= 0 {
		return ""
	}
	key := strconv.FormatInt(curIdx, 10)
	if fileVersions := walkPatchStringMap(target, rewrite(huaweiPatchFileVersionOID), sanitizePatchVersion); fileVersions[key] != "" {
		return fileVersions[key]
	}
	if fileNames := walkPatchStringMap(target, rewrite(huaweiPatchFileNameOID), extractPatchFromFilename); fileNames[key] != "" {
		return fileNames[key]
	}
	return ""
}

// collectHuaweiPatchVersionForDevice 通过 HUAWEI-SYS-MAN-MIB 采集华为/FutureMatrix 设备的运行态热补丁版本。
func collectHuaweiPatchVersionForDevice(target snmpClient, registry *snmpmib.Registry, vendor, sysObjectID, sysDescr string) string {
	if registry == nil || registry.ResolveVendorByContext(vendor, sysObjectID, sysDescr) != "huawei" {
		return ""
	}
	rewrite := func(oid string) string {
		return registry.RewriteVendorOID(vendor, sysObjectID, oid, sysDescr)
	}

	versions := walkPatchStringMap(target, rewrite(huaweiPatchVersionOID), sanitizePatchVersion)
	states := walkPatchIntMap(target, rewrite(huaweiPatchOperateStateOID))
	var files map[string]string
	if patch := pickHuaweiPatchByState(states, versions, files); patch != "" {
		return patch
	}
	if hasRunningOrActivePatchState(states) {
		files = walkPatchStringMap(target, rewrite(huaweiPatchUsedFileNameOID), extractPatchFromFilename)
		if patch := pickHuaweiPatchByState(states, versions, files); patch != "" {
			return patch
		}
	}
	return collectHuaweiPatchFromFileTable(target, rewrite)
}

// collectDeviceIdentity 采集设备型号与软件版本。
// 优先 ENTITY-MIB（标准、结构化），缺失时回退解析 sysDescr。
func (c *SNMPCollector) collectDeviceIdentity(target snmpClient, metrics *SNMPMetrics, registry *snmpmib.Registry) {
	c.collectDeviceIdentityWithSysDescr(target, metrics, registry, "", false)
}

func (c *SNMPCollector) collectDeviceIdentityWithSysDescr(
	target snmpClient,
	metrics *SNMPMetrics,
	registry *snmpmib.Registry,
	cachedSysDescr string,
	sysDescrCached bool,
) {
	c.collectDeviceIdentityWithContext(target, metrics, registry, cachedSysDescr, sysDescrCached, "", false)
}

func (c *SNMPCollector) collectDeviceIdentityWithContext(
	target snmpClient,
	metrics *SNMPMetrics,
	registry *snmpmib.Registry,
	cachedSysDescr string,
	sysDescrCached bool,
	cachedSysObjectID string,
	sysObjectIDCached bool,
) {
	c.collectDeviceIdentityWithCatalog(
		target,
		metrics,
		registry,
		cachedSysDescr,
		sysDescrCached,
		cachedSysObjectID,
		sysObjectIDCached,
		newEntityCatalog(target, registry),
	)
}

func (c *SNMPCollector) collectDeviceIdentityWithCatalog(
	target snmpClient,
	metrics *SNMPMetrics,
	registry *snmpmib.Registry,
	cachedSysDescr string,
	sysDescrCached bool,
	cachedSysObjectID string,
	sysObjectIDCached bool,
	catalog *entityCatalog,
) {
	c.collectDeviceIdentityWithDeviceContext(
		target,
		metrics,
		registry,
		"",
		cachedSysDescr,
		sysDescrCached,
		cachedSysObjectID,
		sysObjectIDCached,
		catalog,
	)
}

func (c *SNMPCollector) collectDeviceIdentityWithDeviceContext(
	target snmpClient,
	metrics *SNMPMetrics,
	registry *snmpmib.Registry,
	vendor string,
	cachedSysDescr string,
	sysDescrCached bool,
	cachedSysObjectID string,
	sysObjectIDCached bool,
	catalog *entityCatalog,
) {
	model := firstNonEmptyWalkValue(target, registry.Common.System.EntPhysicalModelName.OID)
	version := firstNonEmptyWalkValue(target, registry.Common.System.EntPhysicalSoftwareRev.OID)

	if isGenericModelPlaceholder(model) {
		model = ""
	}

	descr := cachedSysDescr
	sysObjID := snmpmib.NormalizeOID(cachedSysObjectID)
	sysDescrModel := ""
	sysDescrVersion := ""
	if model == "" || version == "" {
		if !sysDescrCached && descr == "" {
			descr = c.readSysDescr(target, registry)
		}
		if descr != "" {
			sysDescrModel, sysDescrVersion = parseDeviceIdentityFromSysDescr(descr)
		}
	}

	if model == "" && registry != nil {
		if !sysObjectIDCached && sysObjID == "" {
			sysObjID = snmpmib.NormalizeOID(readStringScalar(target, registry.Common.System.SysObjectID.OID))
		}
		if registry.ResolveVendorByContext(vendor, sysObjID, descr) == "huawei" {
			// 仅当 sysDescr 也未能解析出整机型号时，才允许回退到 hwEntityBoardName
			model = collectHuaweiEntityModelFallbackForDevice(target, registry, catalog, sysDescrModel == "", vendor, sysObjID, descr)
		}
	}

	if model == "" && sysDescrModel != "" {
		model = sysDescrModel
	}
	if version == "" && sysDescrVersion != "" {
		version = sysDescrVersion
	}

	// 仍为空时回退 entPhysicalDescr（部分设备只填这一列）
	if model == "" {
		if candidate := firstNonEmptyWalkValue(target, registry.Common.System.EntPhysicalDescr.OID); !isGenericModelPlaceholder(candidate) {
			model = candidate
		}
	}

	// 若 ENTITY-MIB 与 sysDescr 均未给出型号，按 sysObjectID 查华为型号知识库兜底
	if model == "" {
		if !sysObjectIDCached && sysObjID == "" {
			sysObjID = snmpmib.NormalizeOID(readStringScalar(target, registry.Common.System.SysObjectID.OID))
		}
		if sysObjID != "" {
			if modelCatalog, err := snmpmib.DefaultHuaweiModelCatalog(); err == nil && modelCatalog != nil {
				if profile, ok := modelCatalog.LookupBySysObjectID(sysObjID); ok {
					model = profile.Series
				}
			}
		}
	}

	if model != "" {
		model = sanitizeIdentityValue(model)
		metrics.Model = &model
	}
	if version != "" {
		version = sanitizeIdentityValue(version)
		metrics.FirmwareVersion = &version
	}

	if !sysObjectIDCached && sysObjID == "" && registry != nil {
		sysObjID = snmpmib.NormalizeOID(readStringScalar(target, registry.Common.System.SysObjectID.OID))
	}
	patch := collectHuaweiPatchVersionForDevice(target, registry, vendor, sysObjID, descr)
	if patch == "" {
		patch = ExtractPatchVersion(descr, version)
		if patch == "" && descr == "" && !sysDescrCached {
			if d := c.readSysDescr(target, registry); d != "" {
				descr = d
				patch = ExtractPatchVersion(descr, version)
			}
		}
	}
	if patch != "" {
		metrics.PatchVersion = &patch
	}
	if serial := collectDeviceSerialNumberForDevice(target, registry, catalog, vendor, sysObjID, descr); serial != "" {
		metrics.SerialNumber = &serial
	}
}

var genericModelPlaceholders = map[string]struct{}{
	"switch": {}, "chassis": {}, "unknown": {}, "none": {}, "n/a": {}, "na": {}, "default": {}, "null": {}, "huawei": {}, "futurematrix": {},
}

func isGenericModelPlaceholder(value string) bool {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return true
	}
	_, ok := genericModelPlaceholders[strings.ToLower(trimmed)]
	return ok
}

const (
	huaweiEntityBoardNameOID = "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.43"
	huaweiDeviceESNOID       = "1.3.6.1.4.1.2011.5.25.188.1.1"
)

var nonChassisComponentPrefixes = []string{
	"PWR", "PSU", "PAC", "PDC", "POWER",
	"FAN", "SFP", "QSFP", "XFP", "CFP", "OSFP", "OPTICAL",
	"BATTERY", "SUBCARD", "TRANSC", "CABLE",
}

func isNonChassisComponentModel(value string) bool {
	upper := strings.ToUpper(strings.TrimSpace(value))
	if upper == "" {
		return true
	}
	for _, prefix := range nonChassisComponentPrefixes {
		if strings.HasPrefix(upper, prefix) {
			return true
		}
	}
	return false
}

func entityClassModelPriority(class int64) (int, bool) {
	switch class {
	case entPhysicalClassChassis:
		return 1, true
	case entPhysicalClassStack:
		return 2, true
	case entPhysicalClassModule:
		return 3, true
	default:
		return 0, false
	}
}

func isCleanModelOctetString(raw string) (string, bool) {
	cleaned := strings.TrimSpace(strings.Trim(raw, "\x00"))
	if cleaned == "" || len(cleaned) > maxSerialNumberLen {
		return "", false
	}
	for _, r := range cleaned {
		if r < 0x20 || r >= 0x7f {
			return "", false
		}
	}
	cleaned = sanitizeIdentityValue(cleaned)
	if isGenericModelPlaceholder(cleaned) || isNonChassisComponentModel(cleaned) {
		return "", false
	}
	return cleaned, true
}

func selectHuaweiModelCandidate(rows []gosnmp.SnmpPDU, baseOID string, classByIndex map[int]int64, allowScalar bool) string {
	hasBest := false
	bestPrio := 0
	bestIdx := 0
	bestVal := ""
	for _, pdu := range rows {
		if pdu.Type != gosnmp.OctetString {
			continue
		}
		rawVal, ok := rawSNMPSerialString(pdu.Value)
		if !ok {
			continue
		}
		candidate, ok := isCleanModelOctetString(rawVal)
		if !ok {
			continue
		}
		idx, err := strconv.Atoi(extractOIDIndexSuffix(pdu.Name, baseOID))
		if err != nil || idx < 0 || (!allowScalar && idx == 0) {
			continue
		}
		prio := 4
		if len(classByIndex) > 0 && idx > 0 {
			class, exists := classByIndex[idx]
			if !exists {
				continue
			}
			var allowed bool
			prio, allowed = entityClassModelPriority(class)
			if !allowed {
				continue
			}
		}
		if !hasBest || prio < bestPrio || (prio == bestPrio && idx < bestIdx) {
			hasBest = true
			bestPrio = prio
			bestIdx = idx
			bestVal = candidate
		}
	}
	return bestVal
}

// collectHuaweiEntityModelFallback 在华为电子标签 3.0 设备上读取 hwEntityBoardType -> hwEntityModel -> hwEntityBoardName。
func collectHuaweiEntityModelFallback(target snmpClient, registry *snmpmib.Registry, catalog *entityCatalog, allowBoardName bool) string {
	return collectHuaweiEntityModelFallbackForDevice(target, registry, catalog, allowBoardName, "huawei", "", "")
}

func collectHuaweiEntityModelFallbackForDevice(
	target snmpClient,
	registry *snmpmib.Registry,
	catalog *entityCatalog,
	allowBoardName bool,
	vendor string,
	sysObjectID string,
	sysDescr string,
) string {
	entries := []snmpmib.CatalogOID{
		{ID: "huawei_entity_board_type", OID: "1.3.6.1.4.1.2011.5.25.31.1.1.2.1.11"},
		{ID: "huawei_entity_model", OID: "1.3.6.1.4.1.2011.5.25.31.1.1.2.1.13"},
		{ID: "huawei_entity_board_name", OID: huaweiEntityBoardNameOID},
	}
	rewrittenBoardNameOID := huaweiEntityBoardNameOID
	if registry != nil {
		rewrittenBoardNameOID = registry.RewriteVendorOID(vendor, sysObjectID, huaweiEntityBoardNameOID, sysDescr)
		lookupVendor := vendor
		if strings.TrimSpace(lookupVendor) == "" {
			lookupVendor = "huawei"
		}
		if catalogEntries := registry.CatalogEntriesForDevice(lookupVendor, "identity", sysObjectID, sysDescr); len(catalogEntries) > 0 {
			entries = catalogEntries
		}
	}
	var classByIndex map[int]int64
	if catalog != nil {
		classByIndex = catalog.classes()
	}
	for _, entry := range entries {
		if entry.ID == "huawei_device_esn" {
			continue
		}
		oid := snmpmib.NormalizeOID(entry.OID)
		if oid == "" {
			continue
		}
		if !allowBoardName && (entry.ID == "huawei_entity_board_name" ||
			entry.ID == "huawei_compatible_product_name" ||
			oid == huaweiEntityBoardNameOID ||
			oid == rewrittenBoardNameOID) {
			continue
		}
		isCompatScalar := entry.ID == "huawei_compatible_product_name"
		rows, err := target.BulkWalkAll(oid)
		if isCompatScalar && (err != nil || len(rows) == 0) {
			if pkt, getErr := target.Get([]string{oid + ".0"}); getErr == nil && pkt != nil && len(pkt.Variables) > 0 {
				rows = pkt.Variables
				err = nil
			}
		}
		if err != nil || len(rows) == 0 {
			continue
		}
		if candidate := selectHuaweiModelCandidate(rows, oid, classByIndex, isCompatScalar); candidate != "" {
			return candidate
		}
	}
	return ""
}

const (
	minSerialNumberLen = 3
	maxSerialNumberLen = 128

	entPhysicalClassOther       int64 = 1
	entPhysicalClassUnknown     int64 = 2
	entPhysicalClassChassis     int64 = 3
	entPhysicalClassBackplane   int64 = 4
	entPhysicalClassContainer   int64 = 5
	entPhysicalClassPowerSupply int64 = 6
	entPhysicalClassFan         int64 = 7
	entPhysicalClassSensor      int64 = 8
	entPhysicalClassModule      int64 = 9
	entPhysicalClassPort        int64 = 10
	entPhysicalClassStack       int64 = 11
	entPhysicalClassCPU         int64 = 12
)

var serialPlaceholderSentinels = map[string]struct{}{
	"none":                   {},
	"null":                   {},
	"n/a":                    {},
	"na":                     {},
	"nil":                    {},
	"unknown":                {},
	"default":                {},
	"not applicable":         {},
	"to be filled by o.e.m.": {},
	"empty":                  {},
	"uninitialized":          {},
	"无":                      {},
}

type entitySerialCandidate struct {
	index  int
	serial string
}

// SanitizeSerialNumber 清洗设备序列号并拦截占位文本、控制字符、非 ASCII 与全分隔符伪值。
// 仅裁剪首尾 NUL 填充与空白，保留中间 NUL 交由控制字符检查拒绝，防止二进制脏数据绕过。
func SanitizeSerialNumber(value string) string {
	cleaned := strings.TrimSpace(strings.Trim(value, "\x00"))
	if cleaned == "" {
		return ""
	}
	if _, isPlaceholder := serialPlaceholderSentinels[strings.ToLower(cleaned)]; isPlaceholder {
		return ""
	}
	if len(cleaned) < minSerialNumberLen || len(cleaned) > maxSerialNumberLen {
		return ""
	}
	hasMeaningfulChar := false
	for _, r := range cleaned {
		if r < 0x20 || r >= 0x7f {
			return ""
		}
		if r != '0' && r != '-' && r != '_' && r != '.' && r != ' ' {
			hasMeaningfulChar = true
		}
	}
	if !hasMeaningfulChar {
		return ""
	}
	return cleaned
}

func sanitizeSerialNumber(value string) string {
	return SanitizeSerialNumber(value)
}

// rawSNMPSerialString 保留 OctetString 原始字节语义，避免 formatSNMPValue 静默剥离控制/非 ASCII 字节。
func rawSNMPSerialString(value interface{}) (string, bool) {
	switch raw := value.(type) {
	case []byte:
		return string(raw), true
	case string:
		return raw, true
	default:
		return "", false
	}
}

// entityClassSerialPriority 定义 RFC 4133 / RFC 6933 物理实体类型的序列号优先级。
func entityClassSerialPriority(class int64) (int, bool) {
	switch class {
	case entPhysicalClassChassis:
		return 1, true
	case entPhysicalClassStack:
		return 2, true
	case entPhysicalClassModule:
		return 3, true
	case entPhysicalClassBackplane:
		return 4, true
	case entPhysicalClassOther, entPhysicalClassUnknown:
		return 5, true
	default:
		return 0, false
	}
}

// selectBestEntitySerialNumber 按实体类型优先级和最小索引确定性择优整机序列号。
func selectBestEntitySerialNumber(candidates []entitySerialCandidate, classByIndex map[int]int64) string {
	if len(candidates) == 0 {
		return ""
	}
	if len(classByIndex) == 0 {
		best := candidates[0]
		for _, c := range candidates[1:] {
			if c.index < best.index {
				best = c
			}
		}
		return best.serial
	}

	hasBest := false
	bestPrio := 0
	var best entitySerialCandidate
	for _, c := range candidates {
		class, ok := classByIndex[c.index]
		if !ok {
			continue
		}
		prio, allowed := entityClassSerialPriority(class)
		if !allowed {
			continue
		}
		if !hasBest || prio < bestPrio || (prio == bestPrio && c.index < best.index) {
			best = c
			bestPrio = prio
			hasBest = true
		}
	}
	if !hasBest {
		return ""
	}
	return best.serial
}

// collectDeviceSerialNumber 从 ENTITY-MIB 采集并筛选整机序列号；无有效序列号时不额外 walk entPhysicalClass。
func collectDeviceSerialNumber(target snmpClient, registry *snmpmib.Registry) string {
	return collectDeviceSerialNumberWithCatalog(target, registry, newEntityCatalog(target, registry))
}

func collectDeviceSerialNumberWithCatalog(target snmpClient, registry *snmpmib.Registry, catalog *entityCatalog) string {
	if registry == nil {
		return ""
	}
	serialOID := strings.TrimSpace(registry.Common.System.EntPhysicalSerialNum.OID)
	if serialOID == "" {
		return ""
	}
	rows, err := target.BulkWalkAll(serialOID)
	if err != nil || len(rows) == 0 {
		return ""
	}

	candidates := make([]entitySerialCandidate, 0, len(rows))
	for _, v := range rows {
		if v.Type != gosnmp.OctetString {
			continue
		}
		idx, err := strconv.Atoi(extractOIDIndexSuffix(v.Name, serialOID))
		if err != nil || idx <= 0 {
			continue
		}
		rawSerial, ok := rawSNMPSerialString(v.Value)
		if !ok {
			continue
		}
		if serial := SanitizeSerialNumber(rawSerial); serial != "" {
			candidates = append(candidates, entitySerialCandidate{index: idx, serial: serial})
		}
	}
	if len(candidates) == 0 {
		return ""
	}

	var classByIndex map[int]int64
	if catalog != nil {
		classByIndex = catalog.classes()
	} else {
		classByIndex = collectEntityClassMap(target, registry.Common.System.EntPhysicalClass.OID)
	}
	return selectBestEntitySerialNumber(candidates, classByIndex)
}

func collectDeviceSerialNumberForDevice(
	target snmpClient,
	registry *snmpmib.Registry,
	catalog *entityCatalog,
	vendor string,
	sysObjectID string,
	sysDescr string,
) string {
	if serial := collectDeviceSerialNumberWithCatalog(target, registry, catalog); serial != "" {
		return serial
	}
	if registry == nil || registry.ResolveVendorByContext(vendor, sysObjectID, sysDescr) != "huawei" {
		return ""
	}
	esnOID := registry.RewriteVendorOID(vendor, sysObjectID, huaweiDeviceESNOID, sysDescr)
	if esnOID == "" {
		return ""
	}
	if serial := readHuaweiDeviceESN(target, esnOID); serial != "" {
		return serial
	}
	return readHuaweiDeviceESN(target, esnOID+".0")
}

func readHuaweiDeviceESN(target snmpClient, oid string) string {
	packet, err := target.Get([]string{oid})
	if err != nil || packet == nil {
		return ""
	}
	for _, variable := range packet.Variables {
		if variable.Type != gosnmp.OctetString {
			continue
		}
		rawSerial, ok := rawSNMPSerialString(variable.Value)
		if !ok {
			continue
		}
		if serial := SanitizeSerialNumber(rawSerial); serial != "" {
			return serial
		}
	}
	return ""
}

type entityCatalog struct {
	target       snmpClient
	registry     *snmpmib.Registry
	classLoaded  bool
	classByIndex map[int]int64
	nameLoaded   bool
	nameByIndex  map[int]string
	descrLoaded  bool
	descrByIndex map[int]string
}

func newEntityCatalog(target snmpClient, registry *snmpmib.Registry) *entityCatalog {
	return &entityCatalog{target: target, registry: registry}
}

func (c *entityCatalog) classes() map[int]int64 {
	if c == nil {
		return nil
	}
	if !c.classLoaded {
		c.classLoaded = true
		if c.target != nil && c.registry != nil {
			c.classByIndex = collectEntityClassMap(c.target, c.registry.Common.System.EntPhysicalClass.OID)
		}
	}
	return c.classByIndex
}

func (c *entityCatalog) names() map[int]string {
	if c == nil {
		return nil
	}
	if !c.nameLoaded {
		c.nameLoaded = true
		if c.target != nil && c.registry != nil {
			c.nameByIndex = collectEntityTextMap(c.target, c.registry.Common.System.EntPhysicalName.OID)
		}
	}
	return c.nameByIndex
}

func (c *entityCatalog) descrs() map[int]string {
	if c == nil {
		return nil
	}
	if !c.descrLoaded {
		c.descrLoaded = true
		if c.target != nil && c.registry != nil {
			c.descrByIndex = collectEntityTextMap(c.target, c.registry.Common.System.EntPhysicalDescr.OID)
		}
	}
	return c.descrByIndex
}

func (c *entityCatalog) lookupName(idx int) string {
	if c == nil || idx <= 0 {
		return ""
	}
	if name := c.names()[idx]; name != "" {
		return name
	}
	return c.descrs()[idx]
}

func collectEntityTextMap(target snmpClient, rawOID string) map[int]string {
	oid := strings.TrimSpace(rawOID)
	if oid == "" {
		return nil
	}
	rows, err := target.BulkWalkAll(oid)
	if err != nil || len(rows) == 0 {
		return nil
	}
	out := make(map[int]string, len(rows))
	for _, v := range rows {
		if v.Type != gosnmp.OctetString {
			continue
		}
		idx, err := strconv.Atoi(extractOIDIndexSuffix(v.Name, oid))
		if err != nil || idx <= 0 {
			continue
		}
		if cleaned := SanitizeInterfaceDescription(decodeSNMPTextValue(v.Value)); cleaned != "" {
			out[idx] = cleaned
		}
	}
	return out
}

func buildInterfaceNameIndex(interfaces []InterfaceMetrics) map[int]string {
	if len(interfaces) == 0 {
		return nil
	}
	out := make(map[int]string, len(interfaces))
	for _, iface := range interfaces {
		trimmed := strings.TrimSpace(iface.Name)
		if !strings.HasPrefix(strings.ToLower(trimmed), "if") {
			continue
		}
		idx, err := strconv.Atoi(trimmed[2:])
		if err != nil || idx <= 0 {
			continue
		}
		if desc := strings.TrimSpace(iface.Description); desc != "" {
			out[idx] = desc
		}
	}
	return out
}

func isValidOpticalReading(val *float64, unit string) bool {
	if val == nil || math.IsNaN(*val) || math.IsInf(*val, 0) {
		return false
	}
	normalized := strings.ToLower(strings.TrimSpace(unit))
	if normalized == "" || normalized == "dbm" {
		return true
	}
	return *val > 0
}

func isValidOpticalTemperature(temp *float64) bool {
	return temp != nil && !math.IsNaN(*temp) && !math.IsInf(*temp, 0) &&
		*temp > -50 && *temp < 150 && *temp != 0 && *temp != snmpPercentInvalidSentinel
}

func hasActiveOpticalReading(item OpticalTransceiverMetrics) bool {
	return isValidOpticalReading(item.Voltage, item.VoltageUnit) ||
		isValidOpticalReading(item.BiasCurrent, item.BiasCurrentUnit) ||
		isValidOpticalReading(item.TxPower, item.TxPowerUnit) ||
		isValidOpticalReading(item.RxPower, item.RxPowerUnit) ||
		isValidOpticalTemperature(item.Temperature)
}

func lookupOpticalEntityName(catalog *entityCatalog, idx int) string {
	if catalog == nil || idx <= 0 {
		return ""
	}
	if classByIndex := catalog.classes(); len(classByIndex) > 0 {
		if class, ok := classByIndex[idx]; ok && class != entPhysicalClassPort && class != entPhysicalClassModule {
			return ""
		}
	}
	return catalog.lookupName(idx)
}

func resolveOpticalPortName(
	vendor string,
	idx int,
	catalog *entityCatalog,
	ifaceNameByIndex map[int]string,
) string {
	if idx <= 0 {
		return ""
	}
	if normalizeCollectorToken(vendor) == "h3c" {
		// H3C hh3cTransceiverInfoTable 按 ifIndex 索引，优先匹配接口表避免撞上同编号的机框/风扇实体。
		if ifaceName := strings.TrimSpace(ifaceNameByIndex[idx]); ifaceName != "" {
			return ifaceName
		}
		return lookupOpticalEntityName(catalog, idx)
	}
	if name := lookupOpticalEntityName(catalog, idx); name != "" {
		return name
	}
	return strings.TrimSpace(ifaceNameByIndex[idx])
}

// enrichOpticalTransceivers 过滤全零未插光口占位行，并按厂商索引空间（entPhysicalIndex / ifIndex）补齐端口展示名称。
func enrichOpticalTransceivers(
	items []OpticalTransceiverMetrics,
	vendor string,
	catalog *entityCatalog,
	ifaceNameByIndex map[int]string,
) []OpticalTransceiverMetrics {
	if len(items) == 0 {
		return nil
	}
	out := make([]OpticalTransceiverMetrics, 0, len(items))
	for _, item := range items {
		if !hasActiveOpticalReading(item) {
			continue
		}
		if strings.TrimSpace(item.Name) == "" {
			if idx, err := strconv.Atoi(strings.TrimSpace(item.Index)); err == nil && idx > 0 {
				item.Name = resolveOpticalPortName(vendor, idx, catalog, ifaceNameByIndex)
			}
		}
		out = append(out, item)
	}
	if len(out) == 0 {
		return nil
	}
	sort.SliceStable(out, func(i, j int) bool {
		aEmpty := strings.TrimSpace(out[i].Name) == ""
		bEmpty := strings.TrimSpace(out[j].Name) == ""
		if aEmpty != bEmpty {
			return !aEmpty
		}
		if out[i].Name != out[j].Name {
			return out[i].Name < out[j].Name
		}
		return out[i].Index < out[j].Index
	})
	return out
}

// enrichComponents 过滤板卡噪声实体，补齐人类可读名称，并映射厂商语义状态与等级。
func enrichComponents(
	items []ComponentStatusMetrics,
	vendor string,
	catalog *entityCatalog,
) []ComponentStatusMetrics {
	if len(items) == 0 {
		return nil
	}
	hasDedicatedPower, hasDedicatedFan := false, false
	for _, comp := range items {
		switch strings.ToLower(strings.TrimSpace(comp.Kind)) {
		case "power":
			hasDedicatedPower = true
		case "fan":
			hasDedicatedFan = true
		}
	}
	var classByIndex map[int]int64
	if catalog != nil && hasNumericBoardIndex(items) {
		classByIndex = catalog.classes()
	}

	out := make([]ComponentStatusMetrics, 0, len(items))
	for _, comp := range items {
		if !shouldKeepBoardComponent(comp, classByIndex) {
			continue
		}
		comp.Name = resolveComponentName(comp, catalog)
		reclassifiedFromBoard := false
		if comp.Kind == "board" {
			switch inferBoardSubcomponentKind(comp.Name) {
			case "power":
				if hasDedicatedPower {
					continue
				}
				comp.Kind = "power"
				reclassifiedFromBoard = true
			case "fan":
				if hasDedicatedFan {
					continue
				}
				comp.Kind = "fan"
				reclassifiedFromBoard = true
			}
		}
		if comp.State != nil {
			if reclassifiedFromBoard && normalizeCollectorToken(vendor) == "huawei" {
				comp.StatusLabel, comp.StatusLevel = resolveHuaweiBoardSubcomponentStatus(comp.Kind, *comp.State)
			} else {
				comp.StatusLabel, comp.StatusLevel = resolveComponentStatus(vendor, comp.Kind, *comp.State)
			}
		}
		out = append(out, comp)
	}
	if len(out) == 0 {
		return nil
	}
	sort.SliceStable(out, func(i, j int) bool {
		oi, oj := componentKindOrder(out[i].Kind), componentKindOrder(out[j].Kind)
		if oi != oj {
			return oi < oj
		}
		aiEmpty := strings.TrimSpace(out[i].Name) == ""
		ajEmpty := strings.TrimSpace(out[j].Name) == ""
		if aiEmpty != ajEmpty {
			return !aiEmpty
		}
		if out[i].Name != out[j].Name {
			return out[i].Name < out[j].Name
		}
		return out[i].Index < out[j].Index
	})
	return out
}

func hasNumericBoardIndex(items []ComponentStatusMetrics) bool {
	for _, comp := range items {
		if comp.Kind != "board" {
			continue
		}
		if idx, err := strconv.Atoi(strings.TrimSpace(comp.Index)); err == nil && idx > 0 {
			return true
		}
	}
	return false
}

func shouldKeepBoardComponent(comp ComponentStatusMetrics, classByIndex map[int]int64) bool {
	if comp.Kind != "board" || len(classByIndex) == 0 {
		return true
	}
	idx, err := strconv.Atoi(strings.TrimSpace(comp.Index))
	if err != nil || idx <= 0 {
		return true
	}
	class, ok := classByIndex[idx]
	if !ok {
		return true
	}
	return class == entPhysicalClassChassis ||
		class == entPhysicalClassBackplane ||
		class == entPhysicalClassModule ||
		class == entPhysicalClassStack
}

func resolveComponentName(comp ComponentStatusMetrics, catalog *entityCatalog) string {
	if existing := strings.TrimSpace(comp.Name); existing != "" {
		return existing
	}
	idxStr := strings.TrimSpace(comp.Index)
	if idx, err := strconv.Atoi(idxStr); err == nil && idx > 0 {
		if name := catalog.lookupName(idx); name != "" {
			return name
		}
		if len(idxStr) <= 4 {
			return fmt.Sprintf("%s %s", kindLabelZH(comp.Kind), idxStr)
		}
		return ""
	}
	parts := strings.Split(idxStr, ".")
	if len(parts) == 2 {
		slot, err1 := strconv.Atoi(parts[0])
		subID, err2 := strconv.Atoi(parts[1])
		if err1 == nil && err2 == nil && slot >= 0 && subID >= 0 {
			return fmt.Sprintf("槽位 %s · %s %s", parts[0], kindLabelZH(comp.Kind), parts[1])
		}
	}
	return ""
}

func kindLabelZH(kind string) string {
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case "fan":
		return "风扇"
	case "power":
		return "电源"
	case "board":
		return "单板"
	default:
		return "部件"
	}
}

func componentKindOrder(kind string) int {
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case "fan":
		return 1
	case "power":
		return 2
	case "board":
		return 3
	default:
		return 4
	}
}

func resolveComponentStatus(vendor, kind string, state int64) (string, string) {
	v := normalizeCollectorToken(vendor)
	k := strings.ToLower(strings.TrimSpace(kind))
	switch v {
	case "huawei":
		return resolveHuaweiComponentStatus(k, state)
	case "h3c":
		return resolveH3CComponentStatus(k, state)
	default:
		return resolveDefaultComponentStatus(state)
	}
}

var (
	boardPowerNamePrefixes = []string{"POWER", "PWR", "PSU", "PAC", "PDC"}
	boardFanNamePrefixes   = []string{"FAN"}
)

func inferBoardSubcomponentKind(name string) string {
	upper := strings.ToUpper(strings.TrimSpace(name))
	if upper == "" {
		return ""
	}
	for _, prefix := range boardPowerNamePrefixes {
		if strings.HasPrefix(upper, prefix) {
			return "power"
		}
	}
	for _, prefix := range boardFanNamePrefixes {
		if strings.HasPrefix(upper, prefix) {
			return "fan"
		}
	}
	return ""
}

func resolveHuaweiBoardSubcomponentStatus(kind string, state int64) (string, string) {
	if kind != "power" && kind != "fan" {
		return resolveHuaweiComponentStatus(kind, state)
	}
	switch state {
	case 3, 11, 13, 15, 16, 18:
		if kind == "power" {
			return "正常供电", "normal"
		}
		return "正常", "normal"
	case 2, 4, 12, 17:
		if kind == "power" {
			return "未供电/异常", "critical"
		}
		return "异常", "critical"
	case 1, 19:
		return "未安装/不支持", "unknown"
	default:
		return fmt.Sprintf("状态 %d", state), "unknown"
	}
}

func resolveHuaweiComponentStatus(kind string, state int64) (string, string) {
	switch kind {
	case "board":
		switch state {
		case 3, 11, 13, 15, 16, 18:
			return "正常", "normal"
		case 2, 4, 12, 17:
			return "异常/离线", "critical"
		case 1, 19:
			return "未安装/不支持", "unknown"
		default:
			return fmt.Sprintf("状态 %d", state), "unknown"
		}
	case "fan":
		switch state {
		case 1:
			return "正常", "normal"
		case 2:
			return "异常", "critical"
		default:
			return fmt.Sprintf("状态 %d", state), "unknown"
		}
	case "power":
		switch state {
		case 1:
			return "正常供电", "normal"
		case 2:
			return "未供电/异常", "critical"
		case 3:
			return "休眠/备用", "warning"
		case 4:
			return "未知", "unknown"
		default:
			return fmt.Sprintf("状态 %d", state), "unknown"
		}
	default:
		return resolveDefaultComponentStatus(state)
	}
}

func resolveH3CComponentStatus(kind string, state int64) (string, string) {
	if kind == "fan" || kind == "power" {
		switch state {
		case 1:
			return "正常", "normal"
		case 2:
			return "故障", "critical"
		case 3:
			return "未安装", "unknown"
		case 4:
			return "不支持", "unknown"
		default:
			return fmt.Sprintf("状态 %d", state), "unknown"
		}
	}
	return resolveDefaultComponentStatus(state)
}

func resolveDefaultComponentStatus(state int64) (string, string) {
	switch state {
	case 1:
		return "正常", "normal"
	case 2:
		return "异常", "critical"
	default:
		return fmt.Sprintf("状态 %d", state), "unknown"
	}
}

func collectEntityClassMap(target snmpClient, rawOID string) map[int]int64 {
	classOID := strings.TrimSpace(rawOID)
	if classOID == "" {
		return nil
	}
	rows, err := target.BulkWalkAll(classOID)
	if err != nil || len(rows) == 0 {
		return nil
	}
	classByIndex := make(map[int]int64, len(rows))
	for _, v := range rows {
		idx, err := strconv.Atoi(extractOIDIndexSuffix(v.Name, classOID))
		if err != nil || idx <= 0 {
			continue
		}
		if classVal, ok := numericPDUInt64(v); ok {
			classByIndex[idx] = classVal
		}
	}
	return classByIndex
}

// readSysDescr 读取 sysDescr（1.3.6.1.2.1.1.1.0），失败返回空串。
func (c *SNMPCollector) readSysDescr(target snmpClient, registry *snmpmib.Registry) string {
	oid := strings.TrimSpace(registry.Common.Probe.SysDescr.OID)
	if oid == "" {
		return ""
	}
	packet, err := target.Get([]string{oid})
	if err != nil || packet == nil || len(packet.Variables) == 0 {
		return ""
	}
	return strings.TrimSpace(formatSNMPValue(packet.Variables[0].Value))
}

func sysDescrHead(sysDescr string) string {
	trimmed := strings.TrimSpace(sysDescr)
	if trimmed == "" {
		return ""
	}
	if idx := strings.IndexAny(trimmed, "\r\n"); idx >= 0 {
		trimmed = strings.TrimSpace(trimmed[:idx])
	}
	const maxHeadLen = 120
	if len(trimmed) > maxHeadLen {
		return trimmed[:maxHeadLen]
	}
	return trimmed
}

// collectDeviceClassification 采集设备分类信号并推断类型。
// 各信号独立获取、缺失即置零值：老设备没有 LLDP、精简 agent 不上报 sysServices 都属预期。
func (c *SNMPCollector) collectDeviceClassification(target snmpClient, metrics *SNMPMetrics, registry *snmpmib.Registry) {
	c.collectDeviceClassificationWithSysDescr(target, metrics, registry, "", false)
}

func (c *SNMPCollector) collectDeviceClassificationWithSysDescr(
	target snmpClient,
	metrics *SNMPMetrics,
	registry *snmpmib.Registry,
	cachedSysDescr string,
	sysDescrCached bool,
) {
	sysDescr := cachedSysDescr
	if !sysDescrCached && sysDescr == "" {
		sysDescr = c.readSysDescr(target, registry)
	}

	sysServices := 0
	if oid := strings.TrimSpace(registry.Common.System.SysServices.OID); oid != "" {
		if packet, err := target.Get([]string{oid}); err == nil && packet != nil && len(packet.Variables) > 0 {
			if value, ok := numericPDUInt64(packet.Variables[0]); ok {
				sysServices = int(value)
			}
		}
	}

	var lldpCaps []byte
	if oid := strings.TrimSpace(registry.Common.LLDP.LocSysCapEnabled.OID); oid != "" {
		if packet, err := target.Get([]string{oid}); err == nil && packet != nil && len(packet.Variables) > 0 {
			if raw, ok := packet.Variables[0].Value.([]byte); ok {
				lldpCaps = raw
			}
		}
	}

	model := ""
	if metrics.Model != nil {
		model = *metrics.Model
	}
	if detected := classifyDeviceType(sysDescr, model, sysServices, lldpCaps); detected != "" {
		metrics.DetectedType = &detected
	}
}

// collectNeighbors 采集 LLDP 邻居与设备自身的 LLDP 身份。
// 只有 LLDP-MIB 判定可读（ok）时才下发邻居快照；mib_unreachable/disabled/未知 都保留旧邻居。
func (c *SNMPCollector) collectNeighbors(target snmpClient, metrics *SNMPMetrics, registry *snmpmib.Registry, vendor string) {
	c.collectNeighborsWithDeviceContext(target, metrics, registry, vendor, "", "", nil)
}

func (c *SNMPCollector) collectNeighborsWithDeviceContext(
	target snmpClient,
	metrics *SNMPMetrics,
	registry *snmpmib.Registry,
	vendor string,
	sysObjectID string,
	sysDescr string,
	diag *SNMPCollectionDiagnostics,
) {
	vendorEnableOID := ""
	if registry != nil {
		vendorEnableOID = registry.VendorLLDPEnableOIDForDevice(vendor, sysObjectID, sysDescr)
	}

	lldpStart := time.Now()
	result := collectLLDP(target, registry.Common.LLDP, vendorEnableOID)
	metrics.LLDPStatus = result.Status
	if result.Status == LLDPStatusOK {
		metrics.Neighbors = result.Neighbors
		metrics.LLDPAvailable = true
	}
	if diag != nil {
		status := "empty"
		if result.Status == LLDPStatusOK {
			status = "hit"
		} else if result.Status == LLDPStatusDisabled {
			status = "skipped"
		}
		diag.addCandidate(SNMPCandidateDiagnostic{
			Category:    "lldp",
			CandidateID: "lldp_neighbors",
			Method:      "bulkwalk",
			OID:         registry.Common.LLDP.RemSysName.OID,
			Status:      status,
			Rows:        len(result.Neighbors),
			ElapsedMs:   time.Since(lldpStart).Milliseconds(),
		})
	}

	if name := readStringScalar(target, registry.Common.System.SysName.OID); name != "" {
		metrics.SysName = &name
	}
	chassisID := result.LocalChassisID
	if chassisID == "" {
		chassisID = readBridgeMAC(target, registry.Common.System.Dot1dBaseBridgeAddress.OID)
	}
	if chassisID != "" {
		metrics.ChassisID = &chassisID
	}
}

// readStringScalar GET 单个字符串标量，失败或不可读返回空串。
func readStringScalar(client snmpClient, oid string) string {
	oid = strings.TrimSpace(oid)
	if oid == "" {
		return ""
	}
	packet, err := client.Get([]string{oid})
	if err != nil || packet == nil || len(packet.Variables) == 0 || isNoSuchPDU(packet.Variables[0]) {
		return ""
	}
	return strings.TrimSpace(formatSNMPValue(packet.Variables[0].Value))
}

// readBridgeMAC 读取 dot1dBaseBridgeAddress 并转成小写冒号十六进制；非 6 字节视为无效。
func readBridgeMAC(client snmpClient, oid string) string {
	oid = strings.TrimSpace(oid)
	if oid == "" {
		return ""
	}
	packet, err := client.Get([]string{oid})
	if err != nil || packet == nil || len(packet.Variables) == 0 {
		return ""
	}
	raw, ok := packet.Variables[0].Value.([]byte)
	if !ok || len(raw) != 6 {
		return ""
	}
	return formatMACBytes(raw)
}

type walkCacheEntry struct {
	pdus []gosnmp.SnmpPDU
	err  error
}

// walkCacheClient 仅在单轮调用作用域内缓存 BulkWalkAll 结果，避免候选回退时重复遍历同一实体表。
type walkCacheClient struct {
	inner snmpClient
	cache map[string]walkCacheEntry
}

func newWalkCacheClient(inner snmpClient) *walkCacheClient {
	return &walkCacheClient{
		inner: inner,
		cache: make(map[string]walkCacheEntry),
	}
}

func (w *walkCacheClient) Get(oids []string) (*gosnmp.SnmpPacket, error) {
	return w.inner.Get(oids)
}

func (w *walkCacheClient) BulkWalkAll(oid string) ([]gosnmp.SnmpPDU, error) {
	key := snmpmib.NormalizeOID(oid)
	if entry, ok := w.cache[key]; ok {
		return entry.pdus, entry.err
	}
	pdus, err := w.inner.BulkWalkAll(oid)
	w.cache[key] = walkCacheEntry{pdus: pdus, err: err}
	return pdus, err
}

type diagnosticSNMPClient struct {
	inner   snmpClient
	rows    int
	lastErr error
}

func newDiagnosticSNMPClient(inner snmpClient) *diagnosticSNMPClient {
	return &diagnosticSNMPClient{inner: inner}
}

func (d *diagnosticSNMPClient) Get(oids []string) (*gosnmp.SnmpPacket, error) {
	pkt, err := d.inner.Get(oids)
	if err != nil {
		d.lastErr = err
		return nil, err
	}
	if pkt != nil {
		for _, v := range pkt.Variables {
			if !isNoSuchPDU(v) {
				d.rows++
			}
		}
	}
	return pkt, nil
}

func (d *diagnosticSNMPClient) BulkWalkAll(oid string) ([]gosnmp.SnmpPDU, error) {
	pdus, err := d.inner.BulkWalkAll(oid)
	if err != nil {
		d.lastErr = err
		return nil, err
	}
	d.rows += len(pdus)
	return pdus, nil
}

func recordCandidateDiagnostic(
	diag *SNMPCollectionDiagnostics,
	category, id, method, oid string,
	hit bool,
	probe *diagnosticSNMPClient,
	elapsed time.Duration,
) {
	if diag == nil {
		return
	}
	status := "empty"
	errClass := ""
	if hit {
		status = "hit"
	} else if probe != nil && probe.lastErr != nil {
		status = "error"
		errClass = ClassifySNMPError(probe.lastErr)
	}
	rows := 0
	if probe != nil {
		rows = probe.rows
	}
	diag.addCandidate(SNMPCandidateDiagnostic{
		Category:    category,
		CandidateID: id,
		Method:      method,
		OID:         oid,
		Status:      status,
		Rows:        rows,
		ElapsedMs:   elapsed.Milliseconds(),
		ErrorClass:  errClass,
	})
}

func firstCandidateOID(oids []string) string {
	if len(oids) > 0 {
		return oids[0]
	}
	return ""
}

func collectCPUFromCandidates(
	client snmpClient,
	candidates []snmpmib.MetricCandidate,
	logger *zap.Logger,
) *float64 {
	return collectCPUFromCandidatesWithDiagnostics(client, candidates, logger, nil)
}

func collectCPUFromCandidatesWithDiagnostics(
	client snmpClient,
	candidates []snmpmib.MetricCandidate,
	logger *zap.Logger,
	diag *SNMPCollectionDiagnostics,
) *float64 {
	var zeroFallback *float64
	var zeroCandidateID string

	for _, candidate := range candidates {
		candStart := time.Now()
		probe := newDiagnosticSNMPClient(client)
		var value *float64
		switch candidate.Strategy {
		case "walk_percent_auto":
			value = collectWalkPercentValue(probe, candidate, true)
		case "walk_percent":
			value = collectWalkPercentValue(probe, candidate, false)
		case "get_percent":
			value = collectSinglePercent(probe, candidate.OIDs)
		case "get_percent_from_parts":
			value = collectPercentFromParts(probe, candidate.OIDs)
		}
		recordCandidateDiagnostic(diag, "cpu", candidate.ID, candidate.Method, firstCandidateOID(candidate.OIDs), value != nil, probe, time.Since(candStart))

		if value == nil {
			continue
		}
		if *value == 0 && usesNonZeroAverage(candidate.Aggregate) {
			if zeroFallback == nil {
				zeroFallback = value
				zeroCandidateID = candidate.ID
			}
			continue
		}
		if logger != nil {
			logger.Debug("collected CPU from registry candidate",
				zap.String("candidate", candidate.ID),
				zap.Float64("cpu_usage", *value))
		}
		return value
	}

	if zeroFallback != nil {
		if logger != nil {
			logger.Debug("collected zero CPU fallback from registry candidate",
				zap.String("candidate", zeroCandidateID),
				zap.Float64("cpu_usage", *zeroFallback))
		}
		return zeroFallback
	}
	return nil
}

type memoryCandidateResult struct {
	candidateID string
	usage       *float64
	total       *int64
	used        *int64
}

func evaluateMemoryCandidate(
	client snmpClient,
	candidate snmpmib.MetricCandidate,
) (*float64, *int64, *int64) {
	switch candidate.Strategy {
	case "walk_percent_with_optional_size_mb":
		return collectWalkPercentWithOptionalSize(client, candidate, 1024*1024)
	case "walk_percent_with_optional_size_bytes":
		return collectWalkPercentWithOptionalSize(client, candidate, 1)
	case "walk_percent_auto":
		return collectWalkPercentValue(client, candidate, true), nil, nil
	case "walk_percent_with_size_kb":
		return collectWalkPercentWithSize(client, candidate, 1024)
	case "walk_percent_with_size_bytes":
		return collectWalkPercentWithSize(client, candidate, 1)
	case "walk_percent_with_size_mb":
		return collectWalkPercentWithSize(client, candidate, 1024*1024)
	case "get_percent":
		return collectSinglePercent(client, candidate.OIDs), nil, nil
	case "get_percent_with_size_kb":
		return collectGetPercentWithSize(client, candidate.OIDs, 1024)
	case "get_used_free_bytes":
		return collectGetUsedFreeBytes(client, candidate.OIDs)
	case "host_resources_ram_storage":
		return collectHostResourcesMemory(client, candidate.OIDs)
	case "get_total_avail_kb":
		return collectGetTotalAvailKB(client, candidate.OIDs)
	case "walk_mem_size_free_bytes":
		return collectWalkMemSizeFree(client, candidate.OIDs)
	default:
		return nil, nil, nil
	}
}

func collectMemoryFromCandidates(
	client snmpClient,
	candidates []snmpmib.MetricCandidate,
	logger *zap.Logger,
) (*float64, *int64, *int64) {
	return collectMemoryFromCandidatesWithDiagnostics(client, candidates, logger, nil)
}

func collectMemoryFromCandidatesWithDiagnostics(
	client snmpClient,
	candidates []snmpmib.MetricCandidate,
	logger *zap.Logger,
	diag *SNMPCollectionDiagnostics,
) (*float64, *int64, *int64) {
	cachedClient := newWalkCacheClient(client)
	var usageOnlyFallback *memoryCandidateResult
	var zeroFallback *memoryCandidateResult

	for _, candidate := range candidates {
		candStart := time.Now()
		probe := newDiagnosticSNMPClient(cachedClient)
		usage, total, used := evaluateMemoryCandidate(probe, candidate)
		hit := usage != nil || total != nil || used != nil
		recordCandidateDiagnostic(diag, "memory", candidate.ID, candidate.Method, firstCandidateOID(candidate.OIDs), hit, probe, time.Since(candStart))
		if !hit {
			continue
		}

		// 全 0 占位行先暂存，避免阻断后续真实上报内存的候选（如旧款设备仅在 hwMemoryDevTable 上报）。
		if usage != nil && *usage == 0 && usesNonZeroAverage(candidate.Aggregate) {
			if zeroFallback == nil {
				zeroFallback = &memoryCandidateResult{candidateID: candidate.ID, usage: usage, total: total, used: used}
			}
			continue
		}

		if usage != nil && total == nil && used == nil {
			if usageOnlyFallback == nil {
				usageOnlyFallback = &memoryCandidateResult{candidateID: candidate.ID, usage: usage}
			}
			continue
		}

		logMemoryCandidate(logger, "collected memory from registry candidate", candidate.ID, usage, total, used)
		return usage, total, used
	}

	if usageOnlyFallback != nil {
		logMemoryCandidate(logger, "collected memory usage-only fallback from registry candidate",
			usageOnlyFallback.candidateID, usageOnlyFallback.usage, nil, nil)
		return usageOnlyFallback.usage, nil, nil
	}
	if zeroFallback != nil {
		logMemoryCandidate(logger, "collected zero memory fallback from registry candidate",
			zeroFallback.candidateID, zeroFallback.usage, zeroFallback.total, zeroFallback.used)
		return zeroFallback.usage, zeroFallback.total, zeroFallback.used
	}
	return nil, nil, nil
}

func logMemoryCandidate(logger *zap.Logger, msg, candidateID string, usage *float64, total, used *int64) {
	if logger == nil {
		return
	}
	fields := []zap.Field{zap.String("candidate", candidateID)}
	if usage != nil {
		fields = append(fields, zap.Float64("memory_usage", *usage))
	}
	if total != nil {
		fields = append(fields, zap.Int64("memory_total", *total))
	}
	if used != nil {
		fields = append(fields, zap.Int64("memory_used", *used))
	}
	logger.Debug(msg, fields...)
}

func collectTemperatureFromCandidates(
	client snmpClient,
	candidates []snmpmib.MetricCandidate,
) *float64 {
	return collectTemperatureFromCandidatesWithDiagnostics(client, candidates, nil)
}

func collectTemperatureFromCandidatesWithDiagnostics(
	client snmpClient,
	candidates []snmpmib.MetricCandidate,
	diag *SNMPCollectionDiagnostics,
) *float64 {
	for _, candidate := range candidates {
		candStart := time.Now()
		probe := newDiagnosticSNMPClient(client)
		var value *float64
		switch candidate.Strategy {
		case "walk_max_tenths_celsius":
			value = collectMaxTemperature(probe, candidate.OIDs, 10)
		case "walk_max_celsius":
			value = collectMaxTemperature(probe, candidate.OIDs, 1)
		}
		recordCandidateDiagnostic(diag, "temperature", candidate.ID, candidate.Method, firstCandidateOID(candidate.OIDs), value != nil, probe, time.Since(candStart))
		if value != nil {
			return value
		}
	}
	return nil
}

func collectBGPPeersFromCatalog(
	client snmpClient,
	entries []snmpmib.CatalogOID,
) []BGPNeighborMetrics {
	return collectBGPPeersFromCatalogWithDiagnostics(client, entries, nil)
}

func collectBGPPeersFromCatalogWithDiagnostics(
	client snmpClient,
	entries []snmpmib.CatalogOID,
	diag *SNMPCollectionDiagnostics,
) []BGPNeighborMetrics {
	if len(entries) == 0 {
		return nil
	}

	peers := make(map[string]*BGPNeighborMetrics)

	for _, entry := range entries {
		oid := strings.TrimSpace(entry.OID)
		if oid == "" {
			continue
		}

		candStart := time.Now()
		probe := newDiagnosticSNMPClient(client)
		result, err := probe.BulkWalkAll(oid)
		recordCandidateDiagnostic(diag, "bgp", entry.ID, entry.Method, oid, err == nil && len(result) > 0, probe, time.Since(candStart))
		if err != nil || len(result) == 0 {
			continue
		}

		for _, variable := range result {
			index := extractOIDIndexSuffix(variable.Name, oid)
			if index == "" {
				index = strings.TrimSpace(variable.Name)
			}

			peer := peers[index]
			if peer == nil {
				peer = &BGPNeighborMetrics{Index: index}
				peers[index] = peer
			}

			applyBGPCatalogValue(peer, entry, variable)
		}
	}

	if len(peers) == 0 {
		return nil
	}

	indexes := make([]string, 0, len(peers))
	for index := range peers {
		indexes = append(indexes, index)
	}
	sort.Strings(indexes)

	result := make([]BGPNeighborMetrics, 0, len(indexes))
	for _, index := range indexes {
		result = append(result, *peers[index])
	}

	return result
}

func collectOpticalTransceiversFromCatalog(
	client snmpClient,
	entries []snmpmib.CatalogOID,
) []OpticalTransceiverMetrics {
	return collectOpticalTransceiversFromCatalogWithDiagnostics(client, entries, nil)
}

func collectOpticalTransceiversFromCatalogWithDiagnostics(
	client snmpClient,
	entries []snmpmib.CatalogOID,
	diag *SNMPCollectionDiagnostics,
) []OpticalTransceiverMetrics {
	if len(entries) == 0 {
		return nil
	}

	items := make(map[string]*OpticalTransceiverMetrics)

	for _, entry := range entries {
		oid := strings.TrimSpace(entry.OID)
		if oid == "" {
			continue
		}

		candStart := time.Now()
		probe := newDiagnosticSNMPClient(client)
		result, err := probe.BulkWalkAll(oid)
		recordCandidateDiagnostic(diag, "optical", entry.ID, entry.Method, oid, err == nil && len(result) > 0, probe, time.Since(candStart))
		if err != nil || len(result) == 0 {
			continue
		}

		for _, variable := range result {
			index := extractOIDIndexSuffix(variable.Name, oid)
			if index == "" {
				index = strings.TrimSpace(variable.Name)
			}

			item := items[index]
			if item == nil {
				item = &OpticalTransceiverMetrics{Index: index}
				items[index] = item
			}

			applyOpticalCatalogValue(item, entry, variable)
		}
	}

	if len(items) == 0 {
		return nil
	}

	indexes := make([]string, 0, len(items))
	for index, item := range items {
		if item.TxPower == nil && item.RxPower == nil && item.BiasCurrent == nil && item.Voltage == nil && item.Temperature == nil {
			continue
		}
		indexes = append(indexes, index)
	}
	if len(indexes) == 0 {
		return nil
	}
	sort.Strings(indexes)

	result := make([]OpticalTransceiverMetrics, 0, len(indexes))
	for _, index := range indexes {
		result = append(result, *items[index])
	}

	return result
}

// componentKindFromCatalogID 从 catalog 条目 ID 推断部件类型。
// 华为与 H3C 的条目 ID 都含 fan / power 字样，用关键词匹配比逐厂商枚举更耐改名。
func componentKindFromCatalogID(id string) string {
	normalized := normalizeCollectorToken(id)
	switch {
	case strings.Contains(normalized, "fan"):
		return "fan"
	// oper_status 是单板/实体运行状态，须先于 power 判断：
	// 华为条目 hw_entity_oper_status 不含 power 字样，但顺序错了容易被后续规则误收。
	case strings.Contains(normalized, "oper_status"):
		return "board"
	case strings.Contains(normalized, "power_state"):
		return "power"
	}
	return ""
}

// collectComponentsFromCatalog 采集风扇、电源、单板的原始状态码。
//
// 只处理状态类条目（fan_state / power_state / oper_status），catalog 里同分类下的
// 电压、功率等数值条目不在此列——它们是量测值不是状态，混进来会让"部件是否正常"
// 的判定失去意义。
func collectComponentsFromCatalog(
	client snmpClient,
	entries []snmpmib.CatalogOID,
) []ComponentStatusMetrics {
	return collectComponentsFromCatalogWithDiagnostics(client, entries, nil)
}

func collectComponentsFromCatalogWithDiagnostics(
	client snmpClient,
	entries []snmpmib.CatalogOID,
	diag *SNMPCollectionDiagnostics,
) []ComponentStatusMetrics {
	if len(entries) == 0 {
		return nil
	}

	components := make([]ComponentStatusMetrics, 0)
	for _, entry := range entries {
		kind := componentKindFromCatalogID(entry.ID)
		if kind == "" {
			continue
		}
		oid := strings.TrimSpace(entry.OID)
		if oid == "" {
			continue
		}

		candStart := time.Now()
		probe := newDiagnosticSNMPClient(client)
		result, err := probe.BulkWalkAll(oid)
		recordCandidateDiagnostic(diag, "components", entry.ID, entry.Method, oid, err == nil && len(result) > 0, probe, time.Since(candStart))
		if err != nil || len(result) == 0 {
			continue
		}

		for _, variable := range result {
			state, ok := numericPDUInt64(variable)
			if !ok {
				continue
			}
			index := extractOIDIndexSuffix(variable.Name, oid)
			if index == "" {
				index = strings.TrimSpace(variable.Name)
			}
			value := state
			components = append(components, ComponentStatusMetrics{
				Index: index,
				Kind:  kind,
				State: &value,
			})
		}
	}

	if len(components) == 0 {
		return nil
	}
	sort.Slice(components, func(i, j int) bool {
		if components[i].Kind != components[j].Kind {
			return components[i].Kind < components[j].Kind
		}
		return components[i].Index < components[j].Index
	})
	return components
}

// collectPoEFromCatalog 采集 PoE 端口功率与 PSE 剩余保障功率。
//
// 厂商支持度不同：H3C 上报剩余保障功率（可直接回答"还能再接几个 AP"），
// 华为只有端口级消耗功率（只能回答"哪个口在吃电"）。两者都采，由检查项
// 按实际可得的数据决定判定方式。
func collectPoEFromCatalog(
	client snmpClient,
	entries []snmpmib.CatalogOID,
) PoEMetrics {
	return collectPoEFromCatalogWithDiagnostics(client, entries, nil)
}

func collectPoEFromCatalogWithDiagnostics(
	client snmpClient,
	entries []snmpmib.CatalogOID,
	diag *SNMPCollectionDiagnostics,
) PoEMetrics {
	metrics := PoEMetrics{}
	if len(entries) == 0 {
		return metrics
	}

	ports := make(map[string]*PoEPortMetrics)
	order := make([]string, 0)
	var slotAvailSum float64
	var slotAvailUnit string
	hasSlotAvail := false

	for _, entry := range entries {
		oid := strings.TrimSpace(entry.OID)
		if oid == "" {
			continue
		}
		normalizedID := normalizeCollectorToken(entry.ID)
		isPortName := strings.Contains(normalizedID, "port_name")
		isSlotAvail := strings.Contains(normalizedID, "slot_available_power")
		isRemaining := strings.Contains(normalizedID, "remaining")
		isPeakPower := strings.Contains(normalizedID, "peak_power")
		isConsumingPower := !isRemaining && !isPeakPower && !isSlotAvail && !isPortName && strings.Contains(normalizedID, "power")
		if !isRemaining && !isPeakPower && !isConsumingPower && !isSlotAvail && !isPortName {
			continue
		}

		candStart := time.Now()
		probe := newDiagnosticSNMPClient(client)
		result, err := probe.BulkWalkAll(oid)
		recordCandidateDiagnostic(diag, "poe", entry.ID, entry.Method, oid, err == nil && len(result) > 0, probe, time.Since(candStart))
		if err != nil || len(result) == 0 {
			continue
		}

		for _, variable := range result {
			index := extractOIDIndexSuffix(variable.Name, oid)
			if index == "" {
				index = strings.TrimSpace(variable.Name)
			}
			if isPortName {
				if name := SanitizeInterfaceDescription(decodeSNMPTextValue(variable.Value)); name != "" {
					if ports[index] == nil {
						ports[index] = &PoEPortMetrics{Index: index}
						order = append(order, index)
					}
					ports[index].Name = name
				}
				continue
			}
			value, ok := numericPDUValue(variable)
			if !ok || value < 0 {
				continue
			}
			normalizedValue, normalizedUnit := normalizeCatalogNumericValue(value, entry.Unit)

			if isSlotAvail {
				slotAvailSum += normalizedValue
				slotAvailUnit = normalizedUnit
				hasSlotAvail = true
				continue
			}
			// 剩余保障功率是设备级指标，不归属任何端口
			if isRemaining {
				v := normalizedValue
				metrics.RemainingPower = &v
				metrics.RemainingUnit = normalizedUnit
				continue
			}

			port := ports[index]
			if port == nil {
				port = &PoEPortMetrics{Index: index}
				ports[index] = port
				order = append(order, index)
			}
			v := normalizedValue
			if isPeakPower {
				port.PeakPower = &v
			} else if isConsumingPower {
				port.ConsumingPower = &v
			}
			if normalizedUnit != "" {
				port.Unit = normalizedUnit
			}
		}
	}

	if metrics.RemainingPower == nil && hasSlotAvail {
		v := slotAvailSum
		metrics.RemainingPower = &v
		metrics.RemainingUnit = slotAvailUnit
	}
	if len(order) > 0 {
		sort.Strings(order)
		metrics.Ports = make([]PoEPortMetrics, 0, len(order))
		for _, index := range order {
			metrics.Ports = append(metrics.Ports, *ports[index])
		}
	}
	return metrics
}

func applyBGPCatalogValue(
	peer *BGPNeighborMetrics,
	entry snmpmib.CatalogOID,
	variable gosnmp.SnmpPDU,
) {
	normalizedID := normalizeCollectorToken(entry.ID)

	switch {
	case strings.Contains(normalizedID, "peer_state"):
		value, ok := numericPDUInt64(variable)
		if !ok {
			return
		}
		state := int(value)
		peer.State = &state
		peer.StateLabel = bgpStateLabel(state)
	case strings.Contains(normalizedID, "established_time"):
		value, ok := numericPDUInt64(variable)
		if !ok {
			return
		}
		peer.EstablishedTime = &value
	case strings.Contains(normalizedID, "last_error"):
		value := formatSNMPValue(variable.Value)
		if value == "" {
			return
		}
		peer.LastError = &value
	}
}

func isNonNegativeOpticalUnit(unit string) bool {
	switch strings.TrimSpace(unit) {
	case "uW", "0.1uW", "mV", "0.1mV", "uA", "0.1uA":
		return true
	default:
		return false
	}
}

func applyOpticalCatalogValue(
	item *OpticalTransceiverMetrics,
	entry snmpmib.CatalogOID,
	variable gosnmp.SnmpPDU,
) {
	normalizedID := normalizeCollectorToken(entry.ID)
	if strings.Contains(normalizedID, "vendor_sn") {
		rawSN, ok := rawSNMPSerialString(variable.Value)
		if !ok {
			rawSN = formatSNMPValue(variable.Value)
		}
		if cleaned := SanitizeSerialNumber(rawSN); cleaned != "" {
			item.VendorSN = cleaned
		}
		return
	}

	value, ok := numericPDUValue(variable)
	if !ok {
		return
	}
	if value < 0 && isNonNegativeOpticalUnit(entry.Unit) {
		return
	}

	normalizedValue, normalizedUnit := normalizeCatalogNumericValue(value, entry.Unit)

	switch {
	case strings.Contains(normalizedID, "temperature"):
		if value > -50 && value < 150 && value != 255 {
			temp := value
			item.Temperature = &temp
			item.TemperatureUnit = "C"
		}
	case strings.Contains(normalizedID, "tx_power"):
		item.TxPower = &normalizedValue
		item.TxPowerUnit = normalizedUnit
	case strings.Contains(normalizedID, "rx_power"):
		item.RxPower = &normalizedValue
		item.RxPowerUnit = normalizedUnit
	case strings.Contains(normalizedID, "bias_current") || strings.Contains(normalizedID, "optical_current"):
		item.BiasCurrent = &normalizedValue
		item.BiasCurrentUnit = normalizedUnit
	case strings.Contains(normalizedID, "voltage"):
		item.Voltage = &normalizedValue
		item.VoltageUnit = normalizedUnit
	}
}

func collectWalkPercentValue(
	client snmpClient,
	candidate snmpmib.MetricCandidate,
	autoNormalize bool,
) *float64 {
	if len(candidate.OIDs) == 0 {
		return nil
	}
	result, err := client.BulkWalkAll(candidate.OIDs[0])
	if err != nil || len(result) == 0 {
		return nil
	}
	return aggregatePercentPDUs(result, autoNormalize, candidate.Aggregate)
}

func collectSinglePercent(client snmpClient, oids []string) *float64 {
	if len(oids) == 0 {
		return nil
	}
	packet, err := client.Get([]string{oids[0]})
	if err != nil || packet == nil {
		return nil
	}
	for _, variable := range packet.Variables {
		value, ok := numericPDUValue(variable)
		if !ok || value < 0 || value > 100 {
			continue
		}
		result := value
		return &result
	}
	return nil
}

func collectPercentFromParts(client snmpClient, oids []string) *float64 {
	values := extractPacketNumbers(client, oids)
	if len(values) < 3 {
		return nil
	}
	total := values[0] + values[1] + values[2]
	if total <= 0 {
		return nil
	}
	usage := ((values[0] + values[1]) / total) * 100
	return &usage
}

func collectWalkPercentWithSize(
	client snmpClient,
	candidate snmpmib.MetricCandidate,
	sizeMultiplier int64,
) (*float64, *int64, *int64) {
	if len(candidate.OIDs) < 2 {
		return nil, nil, nil
	}
	usageResult, err1 := client.BulkWalkAll(candidate.OIDs[0])
	sizeResult, err2 := client.BulkWalkAll(candidate.OIDs[1])
	if err1 != nil || err2 != nil || len(usageResult) == 0 || len(sizeResult) == 0 {
		return nil, nil, nil
	}

	usage := aggregatePercentPDUs(usageResult, true, candidate.Aggregate)
	totalSize := sumPositiveSizes(sizeResult, sizeMultiplier)
	if usage == nil || totalSize <= 0 {
		return nil, nil, nil
	}

	usedBytes := int64(float64(totalSize) * (*usage) / 100)
	return usage, &totalSize, &usedBytes
}

// collectWalkPercentWithOptionalSize 采集内存使用率及可选容量列。
// 容量列缺失、溢出或为空时仅返回使用率（total/used 为 nil），不丢弃已采到的使用率；
// 容量汇总时优先按实体索引后缀对齐非零有效 usage 行，避免混算无关端口/占位实体。
func collectWalkPercentWithOptionalSize(
	client snmpClient,
	candidate snmpmib.MetricCandidate,
	sizeMultiplier int64,
) (*float64, *int64, *int64) {
	if len(candidate.OIDs) == 0 {
		return nil, nil, nil
	}
	usageOID := strings.TrimSpace(candidate.OIDs[0])
	if usageOID == "" {
		return nil, nil, nil
	}
	usageResult, err := client.BulkWalkAll(usageOID)
	if err != nil || len(usageResult) == 0 {
		return nil, nil, nil
	}

	usage, nonZeroIndexes := aggregateDirectPercentWithIndexes(usageResult, usageOID, candidate.Aggregate)
	if usage == nil {
		return nil, nil, nil
	}

	totalSize := resolveOptionalMemorySize(client, candidate.OIDs, nonZeroIndexes, sizeMultiplier)
	if totalSize <= 0 {
		return usage, nil, nil
	}

	usedBytes := calculateUsedBytes(totalSize, *usage)
	return usage, &totalSize, &usedBytes
}

func resolveOptionalMemorySize(
	client snmpClient,
	oids []string,
	nonZeroIndexes map[string]struct{},
	sizeMultiplier int64,
) int64 {
	if len(oids) < 2 || sizeMultiplier <= 0 {
		return 0
	}
	sizeOID := strings.TrimSpace(oids[1])
	if sizeOID == "" {
		return 0
	}
	sizeResult, sizeErr := client.BulkWalkAll(sizeOID)
	if sizeErr != nil || len(sizeResult) == 0 {
		return 0
	}
	if len(nonZeroIndexes) > 0 {
		if aligned := sumPositiveSizesFiltered(sizeResult, sizeOID, nonZeroIndexes, sizeMultiplier); aligned > 0 {
			return aligned
		}
	}
	return sumPositiveSizesFiltered(sizeResult, "", nil, sizeMultiplier)
}

func calculateUsedBytes(totalSize int64, usage float64) int64 {
	if totalSize <= 0 || usage <= 0 {
		return 0
	}
	if usage >= 100 {
		return totalSize
	}
	raw := float64(totalSize) * (usage / 100.0)
	if raw >= float64(math.MaxInt64) {
		return totalSize
	}
	used := int64(raw)
	if used < 0 {
		return 0
	}
	if used > totalSize {
		return totalSize
	}
	return used
}

func aggregateDirectPercentWithIndexes(
	items []gosnmp.SnmpPDU,
	baseOID string,
	aggregate string,
) (*float64, map[string]struct{}) {
	total := 0.0
	count := 0
	nonZeroCount := 0
	nonZeroIndexes := make(map[string]struct{})

	for _, item := range items {
		value, ok := numericPDUValue(item)
		if !ok || value < 0 || value > 100 {
			continue
		}
		total += value
		count++
		if value > 0 {
			nonZeroCount++
			if suffix := extractOIDIndexSuffix(item.Name, baseOID); suffix != "" {
				nonZeroIndexes[suffix] = struct{}{}
			}
		}
	}

	if count == 0 {
		return nil, nil
	}
	if usesNonZeroAverage(aggregate) {
		if nonZeroCount == 0 {
			zero := 0.0
			return &zero, nonZeroIndexes
		}
		avg := total / float64(nonZeroCount)
		return &avg, nonZeroIndexes
	}
	avg := total / float64(count)
	return &avg, nonZeroIndexes
}

func collectGetPercentWithSize(
	client snmpClient,
	oids []string,
	sizeMultiplier int64,
) (*float64, *int64, *int64) {
	values := extractPacketNumbers(client, oids)
	if len(values) < 2 || values[0] < 0 || values[0] > 100 || values[1] <= 0 {
		return nil, nil, nil
	}
	usage := values[0]
	total := int64(values[1]) * sizeMultiplier
	used := int64(float64(total) * usage / 100)
	return &usage, &total, &used
}

func collectGetUsedFreeBytes(client snmpClient, oids []string) (*float64, *int64, *int64) {
	values := extractPacketNumbers(client, oids)
	if len(values) < 2 || values[0] < 0 || values[1] < 0 {
		return nil, nil, nil
	}
	used := int64(values[0])
	free := int64(values[1])
	total := used + free
	if total <= 0 {
		return nil, nil, nil
	}
	usage := (float64(used) / float64(total)) * 100
	return &usage, &total, &used
}

// collectHostResourcesMemory 从 hrStorage 表计算物理内存使用率。
//
// RAM 行优先按精确描述（Physical / Real memory）识别，找不到才退回含 "ram" 的描述：
// Windows 的盘符行排在内存行之前，卷标里的 "Programs" 就含子串 "ram"。
// Linux net-snmp 的 Physical memory 已用量包含 buffers 与 page cache，存在
// Memory buffers / Cached memory 行时从已用量中扣除，否则每台 Linux 服务器都会显示
// 90% 以上并误报；Windows 没有这两行，按原值计算。
func collectHostResourcesMemory(client snmpClient, oids []string) (*float64, *int64, *int64) {
	if len(oids) < 4 {
		return nil, nil, nil
	}
	descrResult, err := client.BulkWalkAll(oids[0])
	if err != nil || len(descrResult) == 0 {
		return nil, nil, nil
	}

	ramIndex, looseRAMIndex, buffersIndex, cachedIndex := "", "", "", ""
	for _, item := range descrResult {
		idx := extractIndexFromOID(item.Name)
		if idx <= 0 {
			continue
		}
		index := fmt.Sprintf("%d", idx)
		descr := strings.ToLower(formatSNMPValue(item.Value))
		switch {
		case descr == "memory buffers":
			buffersIndex = index
		case descr == "cached memory":
			cachedIndex = index
		case strings.Contains(descr, "physical memory") || strings.Contains(descr, "real memory"):
			if ramIndex == "" {
				ramIndex = index
			}
		case strings.Contains(descr, "ram"):
			if looseRAMIndex == "" {
				looseRAMIndex = index
			}
		}
	}
	if ramIndex == "" {
		ramIndex = looseRAMIndex
	}
	if ramIndex == "" {
		return nil, nil, nil
	}

	packet, err := client.Get([]string{
		oids[1] + "." + ramIndex,
		oids[2] + "." + ramIndex,
		oids[3] + "." + ramIndex,
	})
	if err != nil || packet == nil || len(packet.Variables) < 3 {
		return nil, nil, nil
	}

	values := make([]int64, 0, len(packet.Variables))
	for _, variable := range packet.Variables {
		if value, ok := numericPDUInt64(variable); ok {
			values = append(values, value)
		}
	}
	if len(values) < 3 || values[0] <= 0 || values[1] <= 0 {
		return nil, nil, nil
	}

	total := values[1] * values[0]
	used := values[2]*values[0] - hostReclaimableMemory(client, oids, buffersIndex, cachedIndex)
	if used < 0 {
		used = 0
	}
	if total <= 0 {
		return nil, nil, nil
	}
	usage := (float64(used) / float64(total)) * 100
	return &usage, &total, &used
}

// hostReclaimableMemory 读取 buffers 与 cached 行已用字节数之和（可回收内存）；
// 行不存在或读取失败时返回 0，退化为按 RAM 行原值计算。
func hostReclaimableMemory(client snmpClient, oids []string, indexes ...string) int64 {
	request := make([]string, 0, 2*len(indexes))
	for _, index := range indexes {
		if index == "" {
			continue
		}
		request = append(request, oids[1]+"."+index, oids[3]+"."+index)
	}
	if len(request) == 0 {
		return 0
	}
	packet, err := client.Get(request)
	if err != nil || packet == nil || len(packet.Variables) != len(request) {
		return 0
	}

	var reclaimable int64
	for i := 0; i+1 < len(packet.Variables); i += 2 {
		units, unitsOK := numericPDUInt64(packet.Variables[i])
		used, usedOK := numericPDUInt64(packet.Variables[i+1])
		if !unitsOK || !usedOK || units <= 0 || used < 0 {
			continue
		}
		reclaimable += units * used
	}
	return reclaimable
}

func collectGetTotalAvailKB(client snmpClient, oids []string) (*float64, *int64, *int64) {
	values := extractPacketNumbers(client, oids)
	if len(values) < 2 || values[0] <= 0 || values[1] < 0 {
		return nil, nil, nil
	}
	total := int64(values[0]) * 1024
	avail := int64(values[1]) * 1024
	used := total - avail
	if used < 0 {
		return nil, nil, nil
	}
	usage := (float64(used) / float64(total)) * 100
	return &usage, &total, &used
}

// collectWalkMemSizeFree 适配华为 hwMemoryDevTable(1.3.6.1.4.1.2011.6.3.5.1) 等
// 仅上报“内存总量/空闲量(字节)”而不直接给使用率的旧款设备：
// walk 总量列与空闲列后求和，按 (size-free)/size 计算使用率。
// 用于不在 entity-extension MIB(2011.5.25.31) 上报内存的设备(如 S5700)。
func collectWalkMemSizeFree(client snmpClient, oids []string) (*float64, *int64, *int64) {
	if len(oids) < 2 {
		return nil, nil, nil
	}
	sizeResult, err1 := client.BulkWalkAll(oids[0])
	freeResult, err2 := client.BulkWalkAll(oids[1])
	if err1 != nil || err2 != nil || len(sizeResult) == 0 || len(freeResult) == 0 {
		return nil, nil, nil
	}

	totalSize := sumPositiveSizes(sizeResult, 1)
	totalFree := sumPositiveSizes(freeResult, 1)
	if totalSize <= 0 || totalFree < 0 || totalFree > totalSize {
		return nil, nil, nil
	}

	used := totalSize - totalFree
	usage := (float64(used) / float64(totalSize)) * 100
	return &usage, &totalSize, &used
}

func collectMaxTemperature(client snmpClient, oids []string, divisor float64) *float64 {
	if len(oids) == 0 {
		return nil
	}
	result, err := client.BulkWalkAll(oids[0])
	if err != nil || len(result) == 0 {
		return nil
	}

	maxTemp := 0.0
	for _, variable := range result {
		value, ok := numericPDUValue(variable)
		if !ok {
			continue
		}
		temp := value / divisor
		if temp > 0 && temp < 150 && temp > maxTemp {
			maxTemp = temp
		}
	}
	if maxTemp <= 0 {
		return nil
	}
	return &maxTemp
}

const snmpPercentInvalidSentinel = 255

func aggregatePercentPDUs(items []gosnmp.SnmpPDU, autoNormalize bool, aggregate string) *float64 {
	total := 0.0
	count := 0
	nonZeroCount := 0
	for _, item := range items {
		value, ok := numericPDUValue(item)
		if !ok || value < 0 || value == snmpPercentInvalidSentinel {
			continue
		}
		if autoNormalize {
			value = normalizeAutoPercent(value)
		}
		if value < 0 || value > 100 {
			continue
		}
		total += value
		count++
		if value > 0 {
			nonZeroCount++
		}
	}

	if count == 0 {
		return nil
	}

	if usesNonZeroAverage(aggregate) {
		if nonZeroCount == 0 {
			zero := 0.0
			return &zero
		}
		avg := total / float64(nonZeroCount)
		return &avg
	}

	avg := total / float64(count)
	return &avg
}

func extractPacketNumbers(client snmpClient, oids []string) []float64 {
	if len(oids) == 0 {
		return nil
	}
	packet, err := client.Get(oids)
	if err != nil || packet == nil || len(packet.Variables) == 0 {
		return nil
	}

	values := make([]float64, 0, len(packet.Variables))
	for _, variable := range packet.Variables {
		if value, ok := numericPDUValue(variable); ok {
			values = append(values, value)
		}
	}
	return values
}

func sumPositiveSizes(items []gosnmp.SnmpPDU, multiplier int64) int64 {
	return sumPositiveSizesFiltered(items, "", nil, multiplier)
}

func sumPositiveSizesFiltered(
	items []gosnmp.SnmpPDU,
	baseOID string,
	allowedIndexes map[string]struct{},
	multiplier int64,
) int64 {
	if multiplier <= 0 {
		return 0
	}
	maxRaw := math.MaxInt64 / multiplier
	total := int64(0)
	for _, item := range items {
		if len(allowedIndexes) > 0 {
			suffix := extractOIDIndexSuffix(item.Name, baseOID)
			if _, ok := allowedIndexes[suffix]; !ok {
				continue
			}
		}
		value, ok := numericPDUInt64(item)
		if !ok || value <= 0 || value > maxRaw {
			continue
		}
		scaled := value * multiplier
		if total > math.MaxInt64-scaled {
			return 0
		}
		total += scaled
	}
	return total
}

func usesNonZeroAverage(aggregate string) bool {
	return strings.Contains(strings.ToLower(strings.TrimSpace(aggregate)), "non_zero")
}

func normalizeAutoPercent(value float64) float64 {
	switch {
	case value > 0 && value < 1:
		return value * 100
	case value > 100 && value <= 10000:
		return value / 100
	default:
		return value
	}
}

func numericPDUValue(variable gosnmp.SnmpPDU) (float64, bool) {
	switch variable.Type {
	case gosnmp.Integer, gosnmp.Gauge32, gosnmp.Counter32, gosnmp.Counter64, gosnmp.TimeTicks, gosnmp.Uinteger32:
		return float64(gosnmp.ToBigInt(variable.Value).Int64()), true
	default:
		return 0, false
	}
}

func numericPDUInt64(variable gosnmp.SnmpPDU) (int64, bool) {
	switch variable.Type {
	case gosnmp.Integer, gosnmp.Gauge32, gosnmp.Counter32, gosnmp.Counter64, gosnmp.TimeTicks, gosnmp.Uinteger32:
		bi := gosnmp.ToBigInt(variable.Value)
		if bi == nil || !bi.IsInt64() {
			return 0, false
		}
		return bi.Int64(), true
	default:
		return 0, false
	}
}

func bgpStateLabel(state int) string {
	switch state {
	case 1:
		return "idle"
	case 2:
		return "connect"
	case 3:
		return "active"
	case 4:
		return "opensent"
	case 5:
		return "openconfirm"
	case 6:
		return "established"
	default:
		return ""
	}
}

func normalizeCollectorToken(value string) string {
	normalized := strings.TrimSpace(strings.ToLower(value))
	normalized = strings.ReplaceAll(normalized, "-", "_")
	normalized = strings.ReplaceAll(normalized, " ", "_")
	return normalized
}

func normalizeCatalogNumericValue(value float64, unit string) (float64, string) {
	normalizedUnit := strings.TrimSpace(unit)
	switch normalizedUnit {
	case "mW":
		return value / 1000, "W"
	case "0.1uA":
		return value / 10, "uA"
	case "0.1mV":
		return value / 10, "mV"
	case "0.1uW":
		return value / 10, "uW"
	default:
		return value, normalizedUnit
	}
}

func extractOIDIndexSuffix(oid string, base string) string {
	normalizedOID := strings.TrimPrefix(strings.TrimSpace(oid), ".")
	normalizedBase := strings.TrimPrefix(strings.TrimSpace(base), ".")
	if normalizedOID == "" || normalizedBase == "" {
		return ""
	}
	prefix := normalizedBase + "."
	if !strings.HasPrefix(normalizedOID, prefix) {
		return ""
	}
	return strings.TrimPrefix(normalizedOID, prefix)
}

func extractIndexFromOID(oid string) int {
	parts := strings.Split(strings.TrimSpace(oid), ".")
	if len(parts) == 0 {
		return 0
	}
	idx := 0
	_, _ = fmt.Sscanf(parts[len(parts)-1], "%d", &idx)
	return idx
}
