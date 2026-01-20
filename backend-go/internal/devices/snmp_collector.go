package devices

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/gosnmp/gosnmp"
	"go.uber.org/zap"
)

// SNMP OIDs for common metrics
const (
	// System Information
	oidSysDescr    = "1.3.6.1.2.1.1.1.0"
	oidSysUptime   = "1.3.6.1.2.1.1.3.0"
	oidSysName     = "1.3.6.1.2.1.1.5.0"
	oidSysLocation = "1.3.6.1.2.1.1.6.0"

	// CPU Usage (HOST-RESOURCES-MIB)
	oidHrProcessorLoad = "1.3.6.1.2.1.25.3.3.1.2" // CPU load per processor

	// Memory (HOST-RESOURCES-MIB)
	oidHrStorageDescr           = "1.3.6.1.2.1.25.2.3.1.3"
	oidHrStorageAllocationUnits = "1.3.6.1.2.1.25.2.3.1.4"
	oidHrStorageSize            = "1.3.6.1.2.1.25.2.3.1.5"
	oidHrStorageUsed            = "1.3.6.1.2.1.25.2.3.1.6"

	// Network Interfaces (IF-MIB)
	oidIfDescr       = "1.3.6.1.2.1.2.2.1.2"
	oidIfSpeed       = "1.3.6.1.2.1.2.2.1.5"
	oidIfInOctets    = "1.3.6.1.2.1.2.2.1.10"
	oidIfOutOctets   = "1.3.6.1.2.1.2.2.1.16"
	oidIfHCInOctets  = "1.3.6.1.2.1.31.1.1.1.6"  // 64-bit counter
	oidIfHCOutOctets = "1.3.6.1.2.1.31.1.1.1.10" // 64-bit counter
	oidIfHighSpeed   = "1.3.6.1.2.1.31.1.1.1.15" // Interface speed in Mbps

	// Temperature (ENTITY-SENSOR-MIB) - Common for Cisco, Huawei, etc.
	oidEntPhysicalDescr       = "1.3.6.1.2.1.47.1.1.1.1.2"
	oidEntSensorValue         = "1.3.6.1.4.1.9.9.91.1.1.1.1.4"  // Cisco
	oidHuaweiTemperature      = "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.11" // Huawei
	oidJuniperTemperature     = "1.3.6.1.4.1.2636.3.1.13.1.7"   // Juniper

	// UCD-SNMP-MIB (Linux/Unix systems)
	oidUcdCpuUser   = "1.3.6.1.4.1.2021.11.9.0"
	oidUcdCpuSystem = "1.3.6.1.4.1.2021.11.10.0"
	oidUcdCpuIdle   = "1.3.6.1.4.1.2021.11.11.0"
	oidUcdMemTotal  = "1.3.6.1.4.1.2021.4.5.0"
	oidUcdMemAvail  = "1.3.6.1.4.1.2021.4.6.0"
	oidUcdMemFree   = "1.3.6.1.4.1.2021.4.11.0"
)

// SNMPMetrics holds collected SNMP metrics
type SNMPMetrics struct {
	CPUUsage       *float64           `json:"cpu_usage,omitempty"`
	MemoryUsage    *float64           `json:"memory_usage,omitempty"`
	MemoryTotal    *int64             `json:"memory_total,omitempty"`
	MemoryUsed     *int64             `json:"memory_used,omitempty"`
	Temperature    *float64           `json:"temperature,omitempty"`
	Uptime         *int64             `json:"uptime,omitempty"`
	BandwidthIn    *float64           `json:"bandwidth_in,omitempty"`
	BandwidthOut   *float64           `json:"bandwidth_out,omitempty"`
	Interfaces     []InterfaceMetrics `json:"interfaces,omitempty"`
	CollectedAt    time.Time          `json:"collected_at"`
	CollectionTime float64            `json:"collection_time_ms"`
}

// InterfaceMetrics holds per-interface metrics
type InterfaceMetrics struct {
	Name        string   `json:"name"`
	Description string   `json:"description,omitempty"`
	Speed       *int64   `json:"speed,omitempty"`       // Mbps
	InOctets    *uint64  `json:"in_octets,omitempty"`
	OutOctets   *uint64  `json:"out_octets,omitempty"`
	InRate      *float64 `json:"in_rate,omitempty"`     // Mbps
	OutRate     *float64 `json:"out_rate,omitempty"`    // Mbps
}

// SNMPCollector collects detailed metrics via SNMP
type SNMPCollector struct {
	logger *zap.Logger
	// Cache for rate calculations
	lastOctets map[string]map[int]octetsCache
	mu         sync.RWMutex
}

type octetsCache struct {
	inOctets  uint64
	outOctets uint64
	timestamp time.Time
}

// NewSNMPCollector creates a new SNMP collector
func NewSNMPCollector(logger *zap.Logger) *SNMPCollector {
	return &SNMPCollector{
		logger:     logger,
		lastOctets: make(map[string]map[int]octetsCache),
	}
}

// CollectMetrics collects all available metrics from a device
func (c *SNMPCollector) CollectMetrics(
	ctx context.Context,
	ipAddress string,
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

	// Collect system uptime
	c.collectUptime(target, metrics)
	if c.logger != nil && metrics.Uptime != nil {
		c.logger.Debug("collected uptime", zap.Int64("uptime", *metrics.Uptime))
	}

	// Collect CPU usage
	c.collectCPU(target, metrics)
	if c.logger != nil && metrics.CPUUsage != nil {
		c.logger.Debug("collected CPU", zap.Float64("cpu", *metrics.CPUUsage))
	}

	// Collect memory usage
	c.collectMemory(target, metrics)
	if c.logger != nil && metrics.MemoryUsage != nil {
		c.logger.Debug("collected memory", zap.Float64("memory", *metrics.MemoryUsage))
	}

	// Collect temperature
	c.collectTemperature(target, metrics)
	if c.logger != nil && metrics.Temperature != nil {
		c.logger.Debug("collected temperature", zap.Float64("temp", *metrics.Temperature))
	}

	// Collect interface metrics
	c.collectInterfaces(target, ipAddress, metrics)
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

func (c *SNMPCollector) collectUptime(target *gosnmp.GoSNMP, metrics *SNMPMetrics) {
	result, err := target.Get([]string{oidSysUptime})
	if err != nil {
		return
	}

	for _, variable := range result.Variables {
		if variable.Type == gosnmp.TimeTicks {
			// TimeTicks are in hundredths of a second
			ticks := gosnmp.ToBigInt(variable.Value).Int64()
			seconds := ticks / 100
			metrics.Uptime = &seconds
		}
	}
}

func (c *SNMPCollector) collectCPU(target *gosnmp.GoSNMP, metrics *SNMPMetrics) {
	// Try HOST-RESOURCES-MIB first (hrProcessorLoad)
	result, err := target.BulkWalkAll(oidHrProcessorLoad)
	if err == nil && len(result) > 0 {
		var totalLoad float64
		count := 0
		for _, variable := range result {
			if variable.Type == gosnmp.Integer {
				load := float64(gosnmp.ToBigInt(variable.Value).Int64())
				totalLoad += load
				count++
			}
		}
		if count > 0 {
			avgLoad := totalLoad / float64(count)
			metrics.CPUUsage = &avgLoad
			return
		}
	}

	// Fallback to UCD-SNMP-MIB (Linux systems)
	result2, err := target.Get([]string{oidUcdCpuUser, oidUcdCpuSystem, oidUcdCpuIdle})
	if err == nil && len(result2.Variables) >= 3 {
		var user, system, idle float64
		for _, v := range result2.Variables {
			if v.Type == gosnmp.Integer {
				val := float64(gosnmp.ToBigInt(v.Value).Int64())
				if strings.Contains(v.Name, "9.0") {
					user = val
				} else if strings.Contains(v.Name, "10.0") {
					system = val
				} else if strings.Contains(v.Name, "11.0") {
					idle = val
				}
			}
		}
		total := user + system + idle
		if total > 0 {
			cpuUsage := ((user + system) / total) * 100
			metrics.CPUUsage = &cpuUsage
		}
	}
}

func (c *SNMPCollector) collectMemory(target *gosnmp.GoSNMP, metrics *SNMPMetrics) {
	// Try HOST-RESOURCES-MIB (hrStorage)
	descrResult, err := target.BulkWalkAll(oidHrStorageDescr)
	if err != nil {
		c.collectMemoryUCD(target, metrics)
		return
	}

	// Find RAM storage index
	var ramIndex string
	for _, v := range descrResult {
		if v.Type == gosnmp.OctetString {
			descr := string(v.Value.([]byte))
			if strings.Contains(strings.ToLower(descr), "ram") ||
				strings.Contains(strings.ToLower(descr), "physical memory") ||
				strings.Contains(strings.ToLower(descr), "real memory") {
				parts := strings.Split(v.Name, ".")
				if len(parts) > 0 {
					ramIndex = parts[len(parts)-1]
					break
				}
			}
		}
	}

	if ramIndex == "" {
		c.collectMemoryUCD(target, metrics)
		return
	}

	// Get allocation units, size, and used for RAM
	oids := []string{
		oidHrStorageAllocationUnits + "." + ramIndex,
		oidHrStorageSize + "." + ramIndex,
		oidHrStorageUsed + "." + ramIndex,
	}

	result, err := target.Get(oids)
	if err != nil || len(result.Variables) < 3 {
		c.collectMemoryUCD(target, metrics)
		return
	}

	var allocUnits, size, used int64
	for _, v := range result.Variables {
		if v.Type == gosnmp.Integer || v.Type == gosnmp.Gauge32 {
			val := gosnmp.ToBigInt(v.Value).Int64()
			if strings.Contains(v.Name, oidHrStorageAllocationUnits) {
				allocUnits = val
			} else if strings.Contains(v.Name, oidHrStorageSize) {
				size = val
			} else if strings.Contains(v.Name, oidHrStorageUsed) {
				used = val
			}
		}
	}

	if allocUnits > 0 && size > 0 {
		totalBytes := size * allocUnits
		usedBytes := used * allocUnits
		metrics.MemoryTotal = &totalBytes
		metrics.MemoryUsed = &usedBytes
		usage := (float64(usedBytes) / float64(totalBytes)) * 100
		metrics.MemoryUsage = &usage
	}
}

func (c *SNMPCollector) collectMemoryUCD(target *gosnmp.GoSNMP, metrics *SNMPMetrics) {
	result, err := target.Get([]string{oidUcdMemTotal, oidUcdMemAvail})
	if err != nil {
		return
	}

	var total, avail int64
	for _, v := range result.Variables {
		if v.Type == gosnmp.Integer {
			val := gosnmp.ToBigInt(v.Value).Int64()
			if strings.Contains(v.Name, "5.0") {
				total = val * 1024 // Convert KB to bytes
			} else if strings.Contains(v.Name, "6.0") {
				avail = val * 1024
			}
		}
	}

	if total > 0 {
		used := total - avail
		metrics.MemoryTotal = &total
		metrics.MemoryUsed = &used
		usage := (float64(used) / float64(total)) * 100
		metrics.MemoryUsage = &usage
	}
}

func (c *SNMPCollector) collectTemperature(target *gosnmp.GoSNMP, metrics *SNMPMetrics) {
	// Try Cisco temperature OID
	result, err := target.BulkWalkAll(oidEntSensorValue)
	if err == nil && len(result) > 0 {
		var maxTemp float64
		for _, v := range result {
			if v.Type == gosnmp.Integer || v.Type == gosnmp.Gauge32 {
				temp := float64(gosnmp.ToBigInt(v.Value).Int64())
				// Cisco reports in tenths of degrees
				temp = temp / 10.0
				if temp > 0 && temp < 150 && temp > maxTemp {
					maxTemp = temp
				}
			}
		}
		if maxTemp > 0 {
			metrics.Temperature = &maxTemp
			return
		}
	}

	// Try Huawei temperature OID
	result2, err := target.BulkWalkAll(oidHuaweiTemperature)
	if err == nil && len(result2) > 0 {
		var maxTemp float64
		for _, v := range result2 {
			if v.Type == gosnmp.Integer || v.Type == gosnmp.Gauge32 {
				temp := float64(gosnmp.ToBigInt(v.Value).Int64())
				if temp > 0 && temp < 150 && temp > maxTemp {
					maxTemp = temp
				}
			}
		}
		if maxTemp > 0 {
			metrics.Temperature = &maxTemp
			return
		}
	}

	// Try Juniper temperature OID
	result3, err := target.BulkWalkAll(oidJuniperTemperature)
	if err == nil && len(result3) > 0 {
		var maxTemp float64
		for _, v := range result3 {
			if v.Type == gosnmp.Integer || v.Type == gosnmp.Gauge32 {
				temp := float64(gosnmp.ToBigInt(v.Value).Int64())
				if temp > 0 && temp < 150 && temp > maxTemp {
					maxTemp = temp
				}
			}
		}
		if maxTemp > 0 {
			metrics.Temperature = &maxTemp
		}
	}
}

func (c *SNMPCollector) collectInterfaces(target *gosnmp.GoSNMP, ipAddress string, metrics *SNMPMetrics) {
	// Get interface descriptions
	descrResult, err := target.BulkWalkAll(oidIfDescr)
	if err != nil {
		return
	}

	interfaces := make(map[int]*InterfaceMetrics)
	for _, v := range descrResult {
		if v.Type == gosnmp.OctetString {
			parts := strings.Split(v.Name, ".")
			if len(parts) > 0 {
				idx := 0
				fmt.Sscanf(parts[len(parts)-1], "%d", &idx)
				if idx > 0 {
					descr := string(v.Value.([]byte))
					interfaces[idx] = &InterfaceMetrics{
						Name:        fmt.Sprintf("if%d", idx),
						Description: descr,
					}
				}
			}
		}
	}

	if len(interfaces) == 0 {
		return
	}

	// Get interface speeds (try 64-bit first)
	speedResult, _ := target.BulkWalkAll(oidIfHighSpeed)
	for _, v := range speedResult {
		if v.Type == gosnmp.Gauge32 || v.Type == gosnmp.Integer {
			parts := strings.Split(v.Name, ".")
			if len(parts) > 0 {
				idx := 0
				fmt.Sscanf(parts[len(parts)-1], "%d", &idx)
				if iface, ok := interfaces[idx]; ok {
					speed := gosnmp.ToBigInt(v.Value).Int64()
					iface.Speed = &speed
				}
			}
		}
	}

	// Get interface octets (try 64-bit counters first)
	now := time.Now()
	inResult, _ := target.BulkWalkAll(oidIfHCInOctets)
	outResult, _ := target.BulkWalkAll(oidIfHCOutOctets)

	// Fallback to 32-bit if 64-bit not available
	if len(inResult) == 0 {
		inResult, _ = target.BulkWalkAll(oidIfInOctets)
	}
	if len(outResult) == 0 {
		outResult, _ = target.BulkWalkAll(oidIfOutOctets)
	}

	for _, v := range inResult {
		parts := strings.Split(v.Name, ".")
		if len(parts) > 0 {
			idx := 0
			fmt.Sscanf(parts[len(parts)-1], "%d", &idx)
			if iface, ok := interfaces[idx]; ok {
				octets := gosnmp.ToBigInt(v.Value).Uint64()
				iface.InOctets = &octets
			}
		}
	}

	for _, v := range outResult {
		parts := strings.Split(v.Name, ".")
		if len(parts) > 0 {
			idx := 0
			fmt.Sscanf(parts[len(parts)-1], "%d", &idx)
			if iface, ok := interfaces[idx]; ok {
				octets := gosnmp.ToBigInt(v.Value).Uint64()
				iface.OutOctets = &octets
			}
		}
	}

	// Calculate rates using cached values
	c.mu.Lock()
	if c.lastOctets[ipAddress] == nil {
		c.lastOctets[ipAddress] = make(map[int]octetsCache)
	}
	lastCache := c.lastOctets[ipAddress]

	var totalInRate, totalOutRate float64
	const maxReasonableBandwidth = 10000.0 // 10 Gbps - 超过此值视为异常
	
	for idx, iface := range interfaces {
		if iface.InOctets != nil && iface.OutOctets != nil {
			if last, ok := lastCache[idx]; ok {
				elapsed := now.Sub(last.timestamp).Seconds()
				if elapsed > 0 && elapsed < 300 { // Max 5 minutes between samples
					// 检测 counter wrap - 如果当前值小于历史值，跳过此次采样
					if *iface.InOctets < last.inOctets || *iface.OutOctets < last.outOctets {
						// Counter wrapped or reset, skip this sample and update cache
						lastCache[idx] = octetsCache{
							inOctets:  *iface.InOctets,
							outOctets: *iface.OutOctets,
							timestamp: now,
						}
						continue
					}

					inDiff := *iface.InOctets - last.inOctets
					outDiff := *iface.OutOctets - last.outOctets

					// Convert to Mbps (bytes/sec * 8 / 1000000)
					inRate := (float64(inDiff) / elapsed) * 8 / 1000000
					outRate := (float64(outDiff) / elapsed) * 8 / 1000000

					// 合理性检查 1: 不应超过 10 Gbps
					if inRate > maxReasonableBandwidth || outRate > maxReasonableBandwidth {
						// 异常值，跳过但更新缓存
						lastCache[idx] = octetsCache{
							inOctets:  *iface.InOctets,
							outOctets: *iface.OutOctets,
							timestamp: now,
						}
						continue
					}

					// 合理性检查 2: 如果有接口速度信息，不应超过接口速度的 120%
					if iface.Speed != nil && *iface.Speed > 0 {
						maxSpeed := float64(*iface.Speed) // Speed is in Mbps
						if inRate > maxSpeed*1.2 || outRate > maxSpeed*1.2 {
							// 超过接口速度，跳过但更新缓存
							lastCache[idx] = octetsCache{
								inOctets:  *iface.InOctets,
								outOctets: *iface.OutOctets,
								timestamp: now,
							}
							continue
						}
					}

					iface.InRate = &inRate
					iface.OutRate = &outRate
					totalInRate += inRate
					totalOutRate += outRate
				}
			} else {
				// 首次采集，只缓存数据，不计算速率（没有历史对比）
				lastCache[idx] = octetsCache{
					inOctets:  *iface.InOctets,
					outOctets: *iface.OutOctets,
					timestamp: now,
				}
				continue
			}

			// Update cache
			lastCache[idx] = octetsCache{
				inOctets:  *iface.InOctets,
				outOctets: *iface.OutOctets,
				timestamp: now,
			}
		}
	}
	c.mu.Unlock()

	// Set total bandwidth
	// 即使没有计算出速率（首次采集或异常值），也设置为 0 表示数据已采集
	metrics.BandwidthIn = &totalInRate
	metrics.BandwidthOut = &totalOutRate

	// Convert map to slice
	for _, iface := range interfaces {
		metrics.Interfaces = append(metrics.Interfaces, *iface)
	}
}
