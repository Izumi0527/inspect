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

	// Huawei specific OIDs
	oidHuaweiCpuUsage         = "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.5"  // hwEntityCpuUsage
	oidHuaweiMemoryUsage      = "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.7"  // hwEntityMemUsage
	oidHuaweiMemorySize       = "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.10" // hwEntityMemSize

	// UCD-SNMP-MIB (Linux/Unix systems)
	oidUcdCpuUser   = "1.3.6.1.4.1.2021.11.9.0"
	oidUcdCpuSystem = "1.3.6.1.4.1.2021.11.10.0"
	oidUcdCpuIdle   = "1.3.6.1.4.1.2021.11.11.0"
	oidUcdMemTotal  = "1.3.6.1.4.1.2021.4.5.0"
	oidUcdMemAvail  = "1.3.6.1.4.1.2021.4.6.0"
	oidUcdMemFree   = "1.3.6.1.4.1.2021.4.11.0"
)

// SNMPMetrics 保存采集的 SNMP 指标
type SNMPMetrics struct {
	CPUUsage       *float64           `json:"cpu_usage,omitempty"`
	MemoryUsage    *float64           `json:"memory_usage,omitempty"`
	MemoryTotal    *int64             `json:"memory_total,omitempty"`
	MemoryUsed     *int64             `json:"memory_used,omitempty"`
	Temperature    *float64           `json:"temperature,omitempty"`
	Uptime         *int64             `json:"uptime,omitempty"`
	BandwidthIn    *float64           `json:"bandwidth_in,omitempty"`  // 入站带宽，单位：bps（比特每秒）
	BandwidthOut   *float64           `json:"bandwidth_out,omitempty"` // 出站带宽，单位：bps（比特每秒）
	Interfaces     []InterfaceMetrics `json:"interfaces,omitempty"`
	CollectedAt    time.Time          `json:"collected_at"`
	CollectionTime float64            `json:"collection_time_ms"`
}

// InterfaceMetrics 保存每个接口的指标
type InterfaceMetrics struct {
	Name        string   `json:"name"`
	Description string   `json:"description,omitempty"`
	Speed       *int64   `json:"speed,omitempty"`       // 接口速率，单位：Mbps
	InOctets    *uint64  `json:"in_octets,omitempty"`
	OutOctets   *uint64  `json:"out_octets,omitempty"`
	InRate      *float64 `json:"in_rate,omitempty"`     // 入站速率，单位：bps（比特每秒）
	OutRate     *float64 `json:"out_rate,omitempty"`    // 出站速率，单位：bps（比特每秒）
}

// SNMPCollector 通过 SNMP 采集详细指标
type SNMPCollector struct {
	logger *zap.Logger
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
	return &SNMPCollector{
		logger:     logger,
		lastOctets: make(map[string]map[int]octetsCache),
	}
}

// CollectMetrics 从设备采集所有可用的指标
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

	// 采集系统运行时间
	c.collectUptime(target, metrics)
	if c.logger != nil && metrics.Uptime != nil {
		c.logger.Debug("collected uptime", zap.Int64("uptime", *metrics.Uptime))
	}

	// 采集 CPU 使用率
	c.collectCPU(target, metrics)
	if c.logger != nil && metrics.CPUUsage != nil {
		c.logger.Debug("collected CPU", zap.Float64("cpu", *metrics.CPUUsage))
	}

	// 采集内存使用率
	c.collectMemory(target, metrics)
	if c.logger != nil && metrics.MemoryUsage != nil {
		c.logger.Debug("collected memory", zap.Float64("memory", *metrics.MemoryUsage))
	}

	// 采集温度
	c.collectTemperature(target, metrics)
	if c.logger != nil && metrics.Temperature != nil {
		c.logger.Debug("collected temperature", zap.Float64("temp", *metrics.Temperature))
	}

	// 采集接口指标
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
	// 优先尝试华为设备特定的 CPU OID
	result, err := target.BulkWalkAll(oidHuaweiCpuUsage)
	if err == nil && len(result) > 0 {
		var totalUsage float64
		var maxUsage float64
		count := 0
		nonZeroCount := 0
		
		if c.logger != nil {
			c.logger.Debug("华为 CPU OID 返回数据", zap.Int("result_count", len(result)))
		}
		
		for _, variable := range result {
			if variable.Type == gosnmp.Integer || variable.Type == gosnmp.Gauge32 {
				rawValue := gosnmp.ToBigInt(variable.Value).Int64()
				usage := float64(rawValue)
				
				// 华为设备返回的 CPU 使用率通常是整数百分比（0-100）
				// 例如：5 表示 5%，0 表示 0%
				// 只有当值在 (0, 1) 之间时才认为是小数格式
				if usage > 0 && usage < 1 {
					// 小数格式（0.05 表示 5%），转换为百分比
					usage = usage * 100
				} else if usage > 100 && usage <= 10000 {
					// 千分比格式（500 表示 5%），转换为百分比
					usage = usage / 100
				}
				// 其他情况（0 或 1-100）直接使用，认为是百分比格式
				
				// 只累加有效值（0-100 范围内）
				if usage >= 0 && usage <= 100 {
					totalUsage += usage
					count++
					if usage > 0 {
						nonZeroCount++
					}
					if usage > maxUsage {
						maxUsage = usage
					}
				}
			}
		}
		
		if count > 0 {
			// 华为设备可能返回多个 CPU 核心的数据
			// 如果大部分核心返回 0，说明这些是空闲核心
			// 我们应该使用非零值的平均值，或者如果非零值太少，使用最大值
			var avgUsage float64
			if nonZeroCount > 0 {
				// 使用非零值的平均值作为实际 CPU 使用率
				avgUsage = totalUsage / float64(nonZeroCount)
			} else {
				// 所有核心都是 0，CPU 使用率就是 0
				avgUsage = 0
			}
			
			metrics.CPUUsage = &avgUsage
			if c.logger != nil {
				c.logger.Debug("collected CPU from Huawei OID", 
					zap.Float64("cpu_usage", avgUsage),
					zap.Float64("max_usage", maxUsage),
					zap.Int("total_count", count),
					zap.Int("non_zero_count", nonZeroCount))
			}
			return
		}
	}

	// 尝试 HOST-RESOURCES-MIB (hrProcessorLoad)
	result2, err := target.BulkWalkAll(oidHrProcessorLoad)
	if err == nil && len(result2) > 0 {
		var totalLoad float64
		count := 0
		for _, variable := range result2 {
			if variable.Type == gosnmp.Integer {
				load := float64(gosnmp.ToBigInt(variable.Value).Int64())
				totalLoad += load
				count++
			}
		}
		if count > 0 {
			avgLoad := totalLoad / float64(count)
			metrics.CPUUsage = &avgLoad
			if c.logger != nil {
				c.logger.Debug("collected CPU from HOST-RESOURCES-MIB", 
					zap.Float64("cpu_usage", avgLoad),
					zap.Int("cpu_count", count))
			}
			return
		}
	}

	// 回退到 UCD-SNMP-MIB (Linux 系统)
	result3, err := target.Get([]string{oidUcdCpuUser, oidUcdCpuSystem, oidUcdCpuIdle})
	if err == nil && len(result3.Variables) >= 3 {
		var user, system, idle float64
		for _, v := range result3.Variables {
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
			if c.logger != nil {
				c.logger.Debug("collected CPU from UCD-SNMP-MIB", 
					zap.Float64("cpu_usage", cpuUsage))
			}
		}
	}
}

func (c *SNMPCollector) collectMemory(target *gosnmp.GoSNMP, metrics *SNMPMetrics) {
	// 优先尝试华为设备特定的内存 OID
	usageResult, err1 := target.BulkWalkAll(oidHuaweiMemoryUsage)
	sizeResult, err2 := target.BulkWalkAll(oidHuaweiMemorySize)
	
	if err1 == nil && err2 == nil && len(usageResult) > 0 && len(sizeResult) > 0 {
		// 华为设备可能有多个内存模块
		var totalUsage float64
		var totalSize int64
		var maxUsage float64
		usageCount := 0
		nonZeroUsageCount := 0
		sizeCount := 0
		
		if c.logger != nil {
			c.logger.Debug("华为内存 OID 返回数据", 
				zap.Int("usage_result_count", len(usageResult)),
				zap.Int("size_result_count", len(sizeResult)))
		}
		
		for _, v := range usageResult {
			if v.Type == gosnmp.Integer || v.Type == gosnmp.Gauge32 {
				rawValue := gosnmp.ToBigInt(v.Value).Int64()
				usage := float64(rawValue)
				
				if c.logger != nil {
					c.logger.Debug("华为内存使用率原始值", 
						zap.Int64("raw_value", rawValue),
						zap.Float64("usage", usage),
						zap.String("oid", v.Name))
				}
				
				// 华为设备返回的内存使用率通常是整数百分比（0-100）
				// 例如：40 表示 40%，0 表示 0%
				// 只有当值在 (0, 1) 之间时才认为是小数格式
				if usage > 0 && usage < 1 {
					// 小数格式（0.40 表示 40%），转换为百分比
					usage = usage * 100
				} else if usage > 100 && usage <= 10000 {
					// 千分比格式（4000 表示 40%），转换为百分比
					usage = usage / 100
				}
				// 其他情况（0 或 1-100）直接使用，认为是百分比格式
				
				// 只累加有效值（0-100 范围内）
				if usage >= 0 && usage <= 100 {
					totalUsage += usage
					usageCount++
					if usage > 0 {
						nonZeroUsageCount++
					}
					if usage > maxUsage {
						maxUsage = usage
					}
				}
			}
		}
		
		for _, v := range sizeResult {
			if v.Type == gosnmp.Integer || v.Type == gosnmp.Gauge32 {
				size := gosnmp.ToBigInt(v.Value).Int64()
				
				if c.logger != nil {
					c.logger.Debug("华为内存大小原始值", 
						zap.Int64("size_kb", size),
						zap.String("oid", v.Name))
				}
				
				// 华为设备返回的是 KB，转换为字节
				if size > 0 {
					totalSize += size * 1024
					sizeCount++
				}
			}
		}
		
		if usageCount > 0 && sizeCount > 0 {
			// 华为设备可能返回多个内存模块的数据
			// 如果大部分模块返回 0，说明这些是空闲模块
			// 我们应该使用非零值的平均值
			var avgUsage float64
			if nonZeroUsageCount > 0 {
				// 使用非零值的平均值作为实际内存使用率
				avgUsage = totalUsage / float64(nonZeroUsageCount)
			} else {
				// 所有模块都是 0，内存使用率就是 0
				avgUsage = 0
			}
			
			metrics.MemoryUsage = &avgUsage
			metrics.MemoryTotal = &totalSize
			usedBytes := int64(float64(totalSize) * avgUsage / 100)
			metrics.MemoryUsed = &usedBytes
			
			if c.logger != nil {
				c.logger.Debug("collected memory from Huawei OID",
					zap.Float64("memory_usage", avgUsage),
					zap.Float64("max_usage", maxUsage),
					zap.Int64("memory_total", totalSize),
					zap.Int64("memory_used", usedBytes),
					zap.Int("total_modules", usageCount),
					zap.Int("non_zero_modules", nonZeroUsageCount))
			}
			return
		}
	}

	// 尝试 HOST-RESOURCES-MIB (hrStorage)
	descrResult, err := target.BulkWalkAll(oidHrStorageDescr)
	if err != nil {
		c.collectMemoryUCD(target, metrics)
		return
	}

	// 查找 RAM 存储索引
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

	// 获取 RAM 的分配单元、大小和已用量
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
		
		if c.logger != nil {
			c.logger.Debug("collected memory from HOST-RESOURCES-MIB",
				zap.Float64("memory_usage", usage),
				zap.Int64("memory_total", totalBytes),
				zap.Int64("memory_used", usedBytes))
		}
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
		
		if c.logger != nil {
			c.logger.Debug("collected memory from UCD-SNMP-MIB",
				zap.Float64("memory_usage", usage),
				zap.Int64("memory_total", total),
				zap.Int64("memory_used", used))
		}
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
	// 获取接口描述
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

	// 获取接口速率（优先尝试 64 位）
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

	// 获取接口字节数（优先尝试 64 位计数器）
	now := time.Now()
	inResult, _ := target.BulkWalkAll(oidIfHCInOctets)
	outResult, _ := target.BulkWalkAll(oidIfHCOutOctets)

	// 如果 64 位不可用，回退到 32 位
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

	// 使用缓存值计算速率
	c.mu.Lock()
	if c.lastOctets[ipAddress] == nil {
		c.lastOctets[ipAddress] = make(map[int]octetsCache)
	}
	lastCache := c.lastOctets[ipAddress]

	var totalInRate, totalOutRate float64
	// 最大合理带宽：10 Gbps = 10,000,000,000 bps
	// 超过此阈值的带宽值将被视为异常并跳过
	const MaxReasonableBandwidthBps = 10_000_000_000
	
	for idx, iface := range interfaces {
		if iface.InOctets != nil && iface.OutOctets != nil {
			if last, ok := lastCache[idx]; ok {
				elapsed := now.Sub(last.timestamp).Seconds()
				if elapsed > 0 && elapsed < 300 { // 采样间隔最大 5 分钟
					// 检测 counter wrap - 如果当前值小于历史值，跳过此次采样
					if *iface.InOctets < last.inOctets || *iface.OutOctets < last.outOctets {
						// Counter 回绕或重置，跳过此次采样并更新缓存
						lastCache[idx] = octetsCache{
							inOctets:  *iface.InOctets,
							outOctets: *iface.OutOctets,
							timestamp: now,
						}
						continue
					}

					inDiff := *iface.InOctets - last.inOctets
					outDiff := *iface.OutOctets - last.outOctets

					// 计算带宽速率（单位：bps - bits per second）
					inRateBps := (float64(inDiff) / elapsed) * 8  // bps
					outRateBps := (float64(outDiff) / elapsed) * 8  // bps

					// 合理性检查：不应超过 10 Gbps
					if inRateBps > MaxReasonableBandwidthBps || outRateBps > MaxReasonableBandwidthBps {
						// 异常值，记录警告并跳过，但更新缓存
						if c.logger != nil {
							c.logger.Warn("unreasonable bandwidth detected, skipping sample",
								zap.String("interface", iface.Description),
								zap.Float64("in_rate_bps", inRateBps),
								zap.Float64("in_rate_gbps", inRateBps/1_000_000_000),
								zap.Float64("out_rate_bps", outRateBps),
								zap.Float64("out_rate_gbps", outRateBps/1_000_000_000),
								zap.Float64("threshold_gbps", MaxReasonableBandwidthBps/1_000_000_000))
						}
						lastCache[idx] = octetsCache{
							inOctets:  *iface.InOctets,
							outOctets: *iface.OutOctets,
							timestamp: now,
						}
						continue
					}

					// 合理性检查 2: 如果有接口速度信息，不应超过接口速度的 120%
					if iface.Speed != nil && *iface.Speed > 0 {
						maxSpeedBps := float64(*iface.Speed) * 1_000_000 // Speed 单位为 Mbps，转换为 bps
						if inRateBps > maxSpeedBps*1.2 || outRateBps > maxSpeedBps*1.2 {
							// 超过接口速度，记录警告并跳过，但更新缓存
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
				// 首次采集，只缓存数据，不计算速率（没有历史对比）
				lastCache[idx] = octetsCache{
					inOctets:  *iface.InOctets,
					outOctets: *iface.OutOctets,
					timestamp: now,
				}
				continue
			}

			// 更新缓存
			lastCache[idx] = octetsCache{
				inOctets:  *iface.InOctets,
				outOctets: *iface.OutOctets,
				timestamp: now,
			}
		}
	}
	c.mu.Unlock()

	// 设置总带宽
	// 即使没有计算出速率（首次采集或异常值），也设置为 0 表示数据已采集
	metrics.BandwidthIn = &totalInRate
	metrics.BandwidthOut = &totalOutRate

	// 将 map 转换为 slice
	for _, iface := range interfaces {
		metrics.Interfaces = append(metrics.Interfaces, *iface)
	}
}
