package devices

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/gosnmp/gosnmp"
	"github.com/your-org/inspect-system/backend-go/internal/snmpmib"
	"go.uber.org/zap"
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
	Uptime              *int64                      `json:"uptime,omitempty"`
	BandwidthIn         *float64                    `json:"bandwidth_in,omitempty"`  // 入站带宽，单位：bps（比特每秒）
	BandwidthOut        *float64                    `json:"bandwidth_out,omitempty"` // 出站带宽，单位：bps（比特每秒）
	Interfaces          []InterfaceMetrics          `json:"interfaces,omitempty"`
	CollectedAt         time.Time                   `json:"collected_at"`
	CollectionTime      float64                     `json:"collection_time_ms"`
}

// MaxReasonableBandwidthBps 最大合理带宽：10 Gbps = 10,000,000,000 bps
const MaxReasonableBandwidthBps = 10_000_000_000

// InterfaceMetrics 保存每个接口的指标
type InterfaceMetrics struct {
	Name        string   `json:"name"`
	Description string   `json:"description,omitempty"`
	Speed       *int64   `json:"speed,omitempty"` // 接口速率，单位：Mbps
	InOctets    *uint64  `json:"in_octets,omitempty"`
	OutOctets   *uint64  `json:"out_octets,omitempty"`
	InRate      *float64 `json:"in_rate,omitempty"`  // 入站速率，单位：bps（比特每秒）
	OutRate     *float64 `json:"out_rate,omitempty"` // 出站速率，单位：bps（比特每秒）
	IsUp        *bool    `json:"is_up,omitempty"`    // 接口运行状态：IfOperStatus=1 为 up
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
	Voltage         *float64 `json:"voltage,omitempty"`
	VoltageUnit     string   `json:"voltage_unit,omitempty"`
	BiasCurrent     *float64 `json:"bias_current,omitempty"`
	BiasCurrentUnit string   `json:"bias_current_unit,omitempty"`
	TxPower         *float64 `json:"tx_power,omitempty"`
	TxPowerUnit     string   `json:"tx_power_unit,omitempty"`
	RxPower         *float64 `json:"rx_power,omitempty"`
	RxPowerUnit     string   `json:"rx_power_unit,omitempty"`
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

// evictStaleOctets 定期清理超过 10 分钟未更新的速率缓存条目，防止 map 无限膨胀
func (c *SNMPCollector) evictStaleOctets() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		c.mu.Lock()
		for ip, ifMap := range c.lastOctets {
			for idx, cache := range ifMap {
				if time.Since(cache.timestamp) > 10*time.Minute {
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

	metrics := &SNMPMetrics{
		CollectedAt: time.Now().UTC(),
	}

	// 采集系统运行时间
	c.collectUptime(target, metrics, registry)
	if c.logger != nil && metrics.Uptime != nil {
		c.logger.Debug("collected uptime", zap.Int64("uptime", *metrics.Uptime))
	}

	// 采集 CPU 使用率
	c.collectCPU(target, metrics, registry, vendor)
	if c.logger != nil && metrics.CPUUsage != nil {
		c.logger.Debug("collected CPU", zap.Float64("cpu", *metrics.CPUUsage))
	}

	// 采集内存使用率
	c.collectMemory(target, metrics, registry, vendor)
	if c.logger != nil && metrics.MemoryUsage != nil {
		c.logger.Debug("collected memory", zap.Float64("memory", *metrics.MemoryUsage))
	}

	// 采集温度
	c.collectTemperature(target, metrics, registry, vendor)
	if c.logger != nil && metrics.Temperature != nil {
		c.logger.Debug("collected temperature", zap.Float64("temp", *metrics.Temperature))
	}

	// 采集 BGP 邻居摘要
	c.collectBGP(target, metrics, registry, vendor)
	if c.logger != nil && len(metrics.BGPPeers) > 0 {
		c.logger.Debug("collected bgp peers", zap.Int("count", len(metrics.BGPPeers)))
	}

	// 采集光模块诊断摘要
	c.collectOptical(target, metrics, registry, vendor)
	if c.logger != nil && len(metrics.OpticalTransceivers) > 0 {
		c.logger.Debug("collected optical transceivers", zap.Int("count", len(metrics.OpticalTransceivers)))
	}

	// 采集接口指标
	c.collectInterfaces(target, ipAddress, metrics, registry)
	if c.logger != nil {
		c.logger.Debug("collected interfaces", zap.Int("count", len(metrics.Interfaces)))
	}

	metrics.CollectionTime = float64(time.Since(start).Milliseconds())

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
	target := &gosnmp.GoSNMP{
		Target:  ipAddress,
		Port:    config.port,
		Timeout: 5 * time.Second,
		Retries: 2,
	}

	switch config.version {
	case "1":
		target.Version = gosnmp.Version1
		target.Community = config.community
	case "2c":
		target.Version = gosnmp.Version2c
		target.Community = config.community
	case "3":
		target.Version = gosnmp.Version3
		target.SecurityModel = gosnmp.UserSecurityModel
		target.MsgFlags = config.securityLevel
		target.SecurityParameters = &gosnmp.UsmSecurityParameters{
			UserName:                 config.username,
			AuthenticationProtocol:   config.authProtocol,
			AuthenticationPassphrase: config.authKey,
			PrivacyProtocol:          config.privProtocol,
			PrivacyPassphrase:        config.privKey,
		}
	}

	return target
}

func (c *SNMPCollector) collectUptime(target snmpClient, metrics *SNMPMetrics, registry *snmpmib.Registry) {
	result, err := target.Get([]string{registry.Common.System.SysUptime.OID})
	if err != nil || result == nil {
		return
	}

	for _, variable := range result.Variables {
		if variable.Type == gosnmp.TimeTicks {
			ticks := gosnmp.ToBigInt(variable.Value).Int64()
			seconds := ticks / 100
			metrics.Uptime = &seconds
			return
		}
		if value, ok := numericPDUInt64(variable); ok {
			seconds := value / 100
			metrics.Uptime = &seconds
			return
		}
	}
}

func (c *SNMPCollector) resolveMetricCandidates(metricName string, vendor string) []snmpmib.MetricCandidate {
	registry, err := c.getRegistry()
	if err != nil || registry == nil {
		return nil
	}
	return registry.MetricCandidates(metricName, vendor)
}

func (c *SNMPCollector) collectCPU(
	target snmpClient,
	metrics *SNMPMetrics,
	registry *snmpmib.Registry,
	vendor string,
) {
	_ = registry
	metrics.CPUUsage = collectCPUFromCandidates(target, c.resolveMetricCandidates("cpu_usage", vendor), c.logger)
}

func (c *SNMPCollector) collectMemory(
	target snmpClient,
	metrics *SNMPMetrics,
	registry *snmpmib.Registry,
	vendor string,
) {
	_ = registry
	metrics.MemoryUsage, metrics.MemoryTotal, metrics.MemoryUsed = collectMemoryFromCandidates(
		target,
		c.resolveMetricCandidates("memory_usage", vendor),
		c.logger,
	)
}

func (c *SNMPCollector) collectTemperature(
	target snmpClient,
	metrics *SNMPMetrics,
	registry *snmpmib.Registry,
	vendor string,
) {
	_ = registry
	metrics.Temperature = collectTemperatureFromCandidates(
		target,
		c.resolveMetricCandidates("temperature", vendor),
	)
}

func (c *SNMPCollector) collectBGP(
	target snmpClient,
	metrics *SNMPMetrics,
	registry *snmpmib.Registry,
	vendor string,
) {
	metrics.BGPPeers = collectBGPPeersFromCatalog(target, registry.CatalogEntries(vendor, "bgp"))
}

func (c *SNMPCollector) collectOptical(
	target snmpClient,
	metrics *SNMPMetrics,
	registry *snmpmib.Registry,
	vendor string,
) {
	metrics.OpticalTransceivers = collectOpticalTransceiversFromCatalog(
		target,
		registry.CatalogEntries(vendor, "optical"),
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
	for idx, iface := range interfaces {
		if iface.InOctets == nil || iface.OutOctets == nil {
			continue
		}

		if last, ok := lastCache[idx]; ok {
			elapsed := now.Sub(last.timestamp).Seconds()
			if elapsed > 0 && elapsed < 300 {
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
				totalInRate += inRateBps
				totalOutRate += outRateBps
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

	metrics.BandwidthIn = &totalInRate
	metrics.BandwidthOut = &totalOutRate

	for _, iface := range interfaces {
		metrics.Interfaces = append(metrics.Interfaces, *iface)
	}
}

func collectCPUFromCandidates(
	client snmpClient,
	candidates []snmpmib.MetricCandidate,
	logger *zap.Logger,
) *float64 {
	for _, candidate := range candidates {
		var value *float64
		switch candidate.Strategy {
		case "walk_percent_auto":
			value = collectWalkPercentValue(client, candidate, true)
		case "walk_percent":
			value = collectWalkPercentValue(client, candidate, false)
		case "get_percent":
			value = collectSinglePercent(client, candidate.OIDs)
		case "get_percent_from_parts":
			value = collectPercentFromParts(client, candidate.OIDs)
		}

		if value != nil {
			if logger != nil {
				logger.Debug("collected CPU from registry candidate",
					zap.String("candidate", candidate.ID),
					zap.Float64("cpu_usage", *value))
			}
			return value
		}
	}
	return nil
}

func collectMemoryFromCandidates(
	client snmpClient,
	candidates []snmpmib.MetricCandidate,
	logger *zap.Logger,
) (*float64, *int64, *int64) {
	for _, candidate := range candidates {
		var usage *float64
		var total *int64
		var used *int64

		switch candidate.Strategy {
		case "walk_percent_with_size_kb":
			usage, total, used = collectWalkPercentWithSize(client, candidate, 1024)
		case "walk_percent_with_size_bytes":
			usage, total, used = collectWalkPercentWithSize(client, candidate, 1)
		case "walk_percent_with_size_mb":
			usage, total, used = collectWalkPercentWithSize(client, candidate, 1024*1024)
		case "get_percent":
			usage = collectSinglePercent(client, candidate.OIDs)
		case "get_percent_with_size_kb":
			usage, total, used = collectGetPercentWithSize(client, candidate.OIDs, 1024)
		case "get_used_free_bytes":
			usage, total, used = collectGetUsedFreeBytes(client, candidate.OIDs)
		case "host_resources_ram_storage":
			usage, total, used = collectHostResourcesMemory(client, candidate.OIDs)
		case "get_total_avail_kb":
			usage, total, used = collectGetTotalAvailKB(client, candidate.OIDs)
		}

		if usage != nil || total != nil || used != nil {
			if logger != nil {
				fields := []zap.Field{zap.String("candidate", candidate.ID)}
				if usage != nil {
					fields = append(fields, zap.Float64("memory_usage", *usage))
				}
				if total != nil {
					fields = append(fields, zap.Int64("memory_total", *total))
				}
				if used != nil {
					fields = append(fields, zap.Int64("memory_used", *used))
				}
				logger.Debug("collected memory from registry candidate", fields...)
			}
			return usage, total, used
		}
	}
	return nil, nil, nil
}

func collectTemperatureFromCandidates(
	client snmpClient,
	candidates []snmpmib.MetricCandidate,
) *float64 {
	for _, candidate := range candidates {
		switch candidate.Strategy {
		case "walk_max_tenths_celsius":
			if value := collectMaxTemperature(client, candidate.OIDs, 10); value != nil {
				return value
			}
		case "walk_max_celsius":
			if value := collectMaxTemperature(client, candidate.OIDs, 1); value != nil {
				return value
			}
		}
	}
	return nil
}

func collectBGPPeersFromCatalog(
	client snmpClient,
	entries []snmpmib.CatalogOID,
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

		result, err := client.BulkWalkAll(oid)
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
	if len(entries) == 0 {
		return nil
	}

	items := make(map[string]*OpticalTransceiverMetrics)

	for _, entry := range entries {
		oid := strings.TrimSpace(entry.OID)
		if oid == "" {
			continue
		}

		result, err := client.BulkWalkAll(oid)
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
	for index := range items {
		indexes = append(indexes, index)
	}
	sort.Strings(indexes)

	result := make([]OpticalTransceiverMetrics, 0, len(indexes))
	for _, index := range indexes {
		result = append(result, *items[index])
	}

	return result
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

func applyOpticalCatalogValue(
	item *OpticalTransceiverMetrics,
	entry snmpmib.CatalogOID,
	variable gosnmp.SnmpPDU,
) {
	value, ok := numericPDUValue(variable)
	if !ok {
		return
	}

	normalizedID := normalizeCollectorToken(entry.ID)
	normalizedValue, normalizedUnit := normalizeCatalogNumericValue(value, entry.Unit)

	switch {
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

func collectHostResourcesMemory(client snmpClient, oids []string) (*float64, *int64, *int64) {
	if len(oids) < 4 {
		return nil, nil, nil
	}
	descrResult, err := client.BulkWalkAll(oids[0])
	if err != nil || len(descrResult) == 0 {
		return nil, nil, nil
	}

	ramIndex := ""
	for _, item := range descrResult {
		descr := strings.ToLower(formatSNMPValue(item.Value))
		if !strings.Contains(descr, "ram") &&
			!strings.Contains(descr, "physical memory") &&
			!strings.Contains(descr, "real memory") {
			continue
		}
		idx := extractIndexFromOID(item.Name)
		if idx > 0 {
			ramIndex = fmt.Sprintf("%d", idx)
			break
		}
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
	used := values[2] * values[0]
	if total <= 0 {
		return nil, nil, nil
	}
	usage := (float64(used) / float64(total)) * 100
	return &usage, &total, &used
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

func aggregatePercentPDUs(items []gosnmp.SnmpPDU, autoNormalize bool, aggregate string) *float64 {
	total := 0.0
	count := 0
	nonZeroCount := 0
	for _, item := range items {
		value, ok := numericPDUValue(item)
		if !ok {
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
	total := int64(0)
	for _, item := range items {
		value, ok := numericPDUInt64(item)
		if !ok || value <= 0 {
			continue
		}
		total += value * multiplier
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
	value, ok := numericPDUValue(variable)
	if !ok {
		return 0, false
	}
	return int64(value), true
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
