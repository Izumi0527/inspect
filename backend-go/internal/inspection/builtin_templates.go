package inspection

import (
	"context"
	"encoding/json"
	"time"

	"go.uber.org/zap"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// builtinTemplateSeed 描述一个内置巡检模板的规范定义。
// 这是内置模板在运行期的权威来源：每次后端启动都会按 name 幂等 upsert，
// 因此修改这里的检查项后重启后端即可让已有数据库加载，无需重建库。
type builtinTemplateSeed struct {
	Name        string
	Description string
	Category    string
	DeviceTypes map[string]interface{}
	CheckItems  []map[string]interface{}
}

// 内置检查项均厂商无关：模板只描述"查什么指标"(metric)，真实采集 OID 由后端 SNMP
// 采集器按设备 vendor 经 collectorVendorProfiles 解析。执行端按 metric 字段分派，
// 检查项名称可随意修改而不影响分派。

func ckConnectivity() map[string]interface{} {
	return map[string]interface{}{
		"id": "connectivity", "name": "设备连通性", "description": "ICMP 探测设备可达性",
		"type": "icmp", "category": "connectivity", "metric": "", "weight": 8,
		"config": map[string]interface{}{}, "enabled": true,
	}
}

func ckSNMPReachable() map[string]interface{} {
	return map[string]interface{}{
		"id": "snmp_reachable", "name": "SNMP 服务可达", "description": "校验设备 SNMP 服务可用",
		"type": "snmp", "category": "connectivity", "metric": "reachable", "weight": 6,
		"config": map[string]interface{}{}, "enabled": true,
	}
}

func ckCPU() map[string]interface{} {
	return map[string]interface{}{
		"id": "cpu_usage", "name": "CPU 使用率", "description": "监控设备 CPU 使用率",
		"type": "snmp", "category": "health", "metric": "cpu", "weight": 10,
		"config":  map[string]interface{}{"unit": "%", "threshold": map[string]interface{}{"warning": 70, "critical": 85}},
		"enabled": true,
	}
}

func ckMemory() map[string]interface{} {
	return map[string]interface{}{
		"id": "memory_usage", "name": "内存使用率", "description": "监控设备内存使用率",
		"type": "snmp", "category": "health", "metric": "memory", "weight": 10,
		"config":  map[string]interface{}{"unit": "%", "threshold": map[string]interface{}{"warning": 75, "critical": 90}},
		"enabled": true,
	}
}

func ckTemperature() map[string]interface{} {
	return map[string]interface{}{
		"id": "temperature", "name": "设备温度", "description": "监控单板/整机温度",
		"type": "snmp", "category": "health", "metric": "temperature", "weight": 7,
		"config":  map[string]interface{}{"unit": "C", "threshold": map[string]interface{}{"warning": 60, "critical": 75}},
		"enabled": true,
	}
}

func ckUptime() map[string]interface{} {
	return map[string]interface{}{
		"id": "uptime", "name": "系统运行时间", "description": "读取设备运行时长",
		"type": "snmp", "category": "health", "metric": "uptime", "weight": 4,
		"config": map[string]interface{}{}, "enabled": true,
	}
}

func ckInterface() map[string]interface{} {
	return map[string]interface{}{
		"id": "interface_status", "name": "接口状态", "description": "检查关键接口运行状态",
		"type": "snmp", "category": "performance", "metric": "interface", "weight": 9,
		"config": map[string]interface{}{}, "enabled": true,
	}
}

// ckInterfaceUtilization 逐接口利用率检查：与 ckBandwidth 职责分离——
// 本项负责"哪些链路快满了"的判定，ckBandwidth 只负责"设备总共跑了多少流量"的展示。
func ckInterfaceUtilization() map[string]interface{} {
	return map[string]interface{}{
		"id": "interface_utilization", "name": "接口利用率", "description": "逐接口计算入/出方向带宽利用率，识别高负载链路",
		"type": "snmp", "category": "performance", "metric": "interface_utilization", "weight": 8,
		"config":  map[string]interface{}{"unit": "%", "threshold": map[string]interface{}{"warning": 70, "critical": 90}},
		"enabled": true,
	}
}

// ckBandwidth 仅做设备总吞吐量采集展示，利用率判定已移交 ckInterfaceUtilization。
// id/metric 保持 "bandwidth" 不变：用户从内置模板复制出的自建模板靠 metric 分派，改键会失效。
func ckBandwidth() map[string]interface{} {
	return map[string]interface{}{
		"id": "bandwidth", "name": "带宽吞吐量", "description": "统计设备入/出方向总流量速率",
		"type": "snmp", "category": "performance", "metric": "bandwidth", "weight": 7,
		"config": map[string]interface{}{}, "enabled": true,
	}
}

// ---------------------------------------------------------------------------
// 接口健康类检查项（标准 IF-MIB / EtherLike-MIB，全厂商通用，不限设备类型）
// ---------------------------------------------------------------------------

// ckInterfaceErrors 接口错包率。错包是物理层劣化的直接证据——光衰、跳线老化、
// 接头氧化、电磁干扰，这类问题在 SNMP 上没有别的指标能替代。
// 阈值按累计比率设定：0.01% 已属偏高，0.1% 说明链路明显有问题。
func ckInterfaceErrors() map[string]interface{} {
	return map[string]interface{}{
		"id": "interface_errors", "name": "接口错包率", "description": "逐接口统计收发错包占比，识别物理层劣化的链路",
		"type": "snmp", "category": "performance", "metric": "interface_errors", "weight": 9,
		"config":  map[string]interface{}{"unit": "%", "threshold": map[string]interface{}{"warning": 0.01, "critical": 0.1}},
		"enabled": true,
	}
}

// ckInterfaceDiscards 接口丢弃率。与错包是两类问题：丢弃指向缓冲区溢出、
// QoS 队列丢弃或 ACL 拒绝，即拥塞与配置问题。分开检查才能让运维知道
// 该去换光模块还是该去查策略。
func ckInterfaceDiscards() map[string]interface{} {
	return map[string]interface{}{
		"id": "interface_discards", "name": "接口丢弃率", "description": "逐接口统计报文丢弃占比，识别拥塞与策略丢包",
		"type": "snmp", "category": "performance", "metric": "interface_discards", "weight": 8,
		"config":  map[string]interface{}{"unit": "%", "threshold": map[string]interface{}{"warning": 0.1, "critical": 1}},
		"enabled": true,
	}
}

// ckInterfaceAdminStatus 接口管理状态一致性。admin up 但 oper down 才是真故障，
// admin down 是运维主动关闭。本项补上了「接口状态」检查缺失的这一半信息。
func ckInterfaceAdminStatus() map[string]interface{} {
	return map[string]interface{}{
		"id": "interface_admin_status", "name": "接口状态一致性", "description": "区分人为关闭与链路故障，仅对配置为启用却未运行的接口告警",
		"type": "snmp", "category": "performance", "metric": "interface_admin_status", "weight": 9,
		"config": map[string]interface{}{}, "enabled": true,
	}
}

// ckInterfaceDuplex 接口双工模式。与错包检查互补：错包说「有问题」，
// 双工说「为什么」——千兆口协商成半双工会同时引发大量错包与性能腰斩。
func ckInterfaceDuplex() map[string]interface{} {
	return map[string]interface{}{
		"id": "interface_duplex", "name": "接口双工模式", "description": "检测高速接口是否误协商为半双工",
		"type": "snmp", "category": "performance", "metric": "interface_duplex", "weight": 6,
		"config": map[string]interface{}{}, "enabled": true,
	}
}

// ---------------------------------------------------------------------------
// 硬件部件与设备专项检查项
//
// device_types 声明适用设备类型，执行端据此过滤：不适用的项不做采集，
// 直接落一条 not_applicable 结果，既不算通过也不算失败，不进通过率分母。
// ---------------------------------------------------------------------------

// ckFanStatus 风扇状态。单风扇故障导致散热余量不足，等温度检查发现时
// 设备往往已在劣化。仅网络设备的 catalog 定义了对应 OID。
func ckFanStatus() map[string]interface{} {
	return map[string]interface{}{
		"id": "fan_status", "name": "风扇状态", "description": "检查风扇模块运行状态，识别散热能力下降",
		"type": "snmp", "category": "health", "metric": "fan_status", "weight": 8,
		"device_types": []string{"switch", "router", "firewall"},
		"config":       map[string]interface{}{},
		"enabled":      true,
	}
}

// ckPowerStatus 电源状态。单电源运行时任何一次市电抖动都会导致宕机，
// 冗余是否还在是比 CPU 高低更要紧的事。
func ckPowerStatus() map[string]interface{} {
	return map[string]interface{}{
		"id": "power_status", "name": "电源状态", "description": "检查电源模块运行状态，识别冗余失效",
		"type": "snmp", "category": "health", "metric": "power_status", "weight": 9,
		"device_types": []string{"switch", "router", "firewall"},
		"config":       map[string]interface{}{},
		"enabled":      true,
	}
}

// ckPoEStatus PoE 供电余量。预算耗尽后新接的 AP 与 IP 话机直接不上电，
// 现象诡异难查。仅交换机适用。
func ckPoEStatus() map[string]interface{} {
	return map[string]interface{}{
		"id": "poe_status", "name": "PoE 供电余量", "description": "检查 PoE 剩余保障功率与端口供电情况",
		"type": "snmp", "category": "health", "metric": "poe", "weight": 6,
		"device_types": []string{"switch"},
		"config":       map[string]interface{}{"unit": "W", "threshold": map[string]interface{}{"warning": 30, "critical": 10}},
		"enabled":      true,
	}
}

// ckOpticalPower 光模块收发光功率。光衰比错包更早暴露链路劣化，
// 是提前更换光模块的依据。判定方向与其他阈值相反——越低越危险。
func ckOpticalPower() map[string]interface{} {
	return map[string]interface{}{
		"id": "optical_power", "name": "光模块光功率", "description": "检查光模块收光功率是否跌出正常区间",
		"type": "snmp", "category": "health", "metric": "optical_power", "weight": 8,
		"device_types": []string{"switch", "router", "firewall"},
		"config":       map[string]interface{}{"unit": "dBm", "threshold": map[string]interface{}{"warning": -25, "critical": -30}},
		"enabled":      true,
	}
}

// ckBGPPeers BGP 邻居状态。邻居断开直接造成路由黑洞；Established 但建立
// 时长很短则说明会话在反复重建，比单纯断开更隐蔽。仅路由器与防火墙适用。
func ckBGPPeers() map[string]interface{} {
	return map[string]interface{}{
		"id": "bgp_peers", "name": "BGP 邻居状态", "description": "检查 BGP 邻居是否全部建立且会话稳定",
		"type": "snmp", "category": "performance", "metric": "bgp_peers", "weight": 10,
		"device_types": []string{"router", "firewall"},
		"config":       map[string]interface{}{},
		"enabled":      true,
	}
}

// ckFirmwareVersion 设备型号与固件版本。恒判通过，仅采集展示——版本是否合规
// 取决于厂商推荐列表与安全公告，这些信息不在系统内，硬编码判定规则会很快过期。
// 作用是让报告自带版本清单，便于事后比对。
func ckFirmwareVersion() map[string]interface{} {
	return map[string]interface{}{
		"id": "firmware_version", "name": "型号与固件版本", "description": "采集设备型号与固件版本，供版本基线比对",
		"type": "snmp", "category": "health", "metric": "firmware_version", "weight": 3,
		"config": map[string]interface{}{}, "enabled": true,
	}
}

func builtinTemplateSeeds() []builtinTemplateSeed {
	deviceTypes := map[string]interface{}{"device_types": []string{"switch", "router", "firewall", "server"}}
	return []builtinTemplateSeed{
		{
			Name:        "连通性巡检",
			Description: "仅核对设备在线状态：ICMP 连通性 + SNMP 服务可达，用于快速确认设备是否在线。",
			Category:    "network",
			DeviceTypes: deviceTypes,
			CheckItems:  []map[string]interface{}{ckConnectivity(), ckSNMPReachable()},
		},
		{
			Name:        "基础健康巡检",
			Description: "连通性 + CPU + 内存 + 风扇与电源，覆盖设备核心健康指标。硬件部件与 CPU/内存同级：风扇故障或电源冗余失效比负载偏高更紧急。",
			Category:    "network",
			DeviceTypes: deviceTypes,
			CheckItems: []map[string]interface{}{
				ckConnectivity(), ckSNMPReachable(), ckCPU(), ckMemory(),
				ckFanStatus(), ckPowerStatus(),
			},
		},
		{
			Name:        "标准巡检",
			Description: "基础健康 + 温度 + 运行时间 + 接口状态、利用率、错包率、丢弃率、状态一致性与双工模式，适合日常例行巡检。接口物理层健康是日常巡检最大的盲区。",
			Category:    "network",
			DeviceTypes: deviceTypes,
			CheckItems: []map[string]interface{}{
				ckConnectivity(), ckSNMPReachable(), ckCPU(), ckMemory(),
				ckFanStatus(), ckPowerStatus(),
				ckTemperature(), ckUptime(), ckInterface(), ckInterfaceUtilization(),
				ckInterfaceErrors(), ckInterfaceDiscards(), ckInterfaceAdminStatus(), ckInterfaceDuplex(),
			},
		},
		{
			Name:        "全面巡检",
			Description: "标准巡检 + 带宽吞吐量 + PoE 供电、光模块光功率、BGP 邻居与固件版本，覆盖全部可采集维度。部分检查项仅适用于特定设备类型，在其他设备上会标记为不适用而非失败。",
			Category:    "network",
			DeviceTypes: deviceTypes,
			CheckItems: []map[string]interface{}{
				ckConnectivity(), ckSNMPReachable(), ckCPU(), ckMemory(),
				ckFanStatus(), ckPowerStatus(),
				ckTemperature(), ckUptime(), ckInterface(), ckInterfaceUtilization(),
				ckInterfaceErrors(), ckInterfaceDiscards(), ckInterfaceAdminStatus(), ckInterfaceDuplex(),
				ckBandwidth(), ckPoEStatus(), ckOpticalPower(), ckBGPPeers(), ckFirmwareVersion(),
			},
		},
	}
}

// allBuiltinCheckItems 枚举所有内置档位去重后的检查项（按 id 去重），
// 供白盒测试校验"类型可执行 + SNMP 项 metric 合法"等硬约束。
func allBuiltinCheckItems() []map[string]interface{} {
	seen := map[string]bool{}
	out := make([]map[string]interface{}, 0)
	for _, seed := range builtinTemplateSeeds() {
		for _, item := range seed.CheckItems {
			id, _ := item["id"].(string)
			if id != "" && seen[id] {
				continue
			}
			seen[id] = true
			out = append(out, item)
		}
	}
	return out
}

// EnsureBuiltinTemplates 在后端启动时按 name 幂等同步内置巡检模板：
// 已存在（is_default）则更新其检查项等内容，不存在则创建。
// 内置模板对用户只读（不可改/删），因此覆盖更新是安全的；非内置（用户自建）模板不受影响。
func EnsureBuiltinTemplates(ctx context.Context, db *gorm.DB, logger *zap.Logger) error {
	if db == nil {
		return nil
	}

	seeds := builtinTemplateSeeds()

	// 清理所有不在当前档位清单中的旧内置模板（仅 is_default，用户自建模板不动）。
	names := make([]string, 0, len(seeds))
	for _, s := range seeds {
		names = append(names, s.Name)
	}
	cleanup := db.WithContext(ctx).
		Where("is_default = ? AND name NOT IN ?", true, names).
		Delete(&Template{})
	if cleanup.Error != nil {
		return cleanup.Error
	}
	if cleanup.RowsAffected > 0 && logger != nil {
		logger.Info("已清理过时内置巡检模板", zap.Int64("deleted", cleanup.RowsAffected))
	}

	for _, seed := range seeds {
		checkItemsJSON, err := json.Marshal(seed.CheckItems)
		if err != nil {
			return err
		}
		deviceTypesJSON, err := json.Marshal(seed.DeviceTypes)
		if err != nil {
			return err
		}
		now := time.Now().UTC()

		updates := map[string]interface{}{
			"description":  seed.Description,
			"category":     seed.Category,
			"device_types": datatypes.JSON(deviceTypesJSON),
			"check_items":  datatypes.JSON(checkItemsJSON),
			"is_active":    true,
			"updated_at":   now,
		}

		res := db.WithContext(ctx).
			Model(&Template{}).
			Where("name = ? AND is_default = ?", seed.Name, true).
			Updates(updates)
		if res.Error != nil {
			return res.Error
		}

		if res.RowsAffected == 0 {
			row := Template{
				Name:        seed.Name,
				Description: &seed.Description,
				Category:    &seed.Category,
				DeviceTypes: datatypes.JSON(deviceTypesJSON),
				CheckItems:  datatypes.JSON(checkItemsJSON),
				IsDefault:   true,
				IsActive:    true,
				CreatedAt:   &now,
				UpdatedAt:   &now,
			}
			if err := db.WithContext(ctx).Create(&row).Error; err != nil {
				return err
			}
			if logger != nil {
				logger.Info("内置巡检模板已创建", zap.String("name", seed.Name), zap.Int("check_items", len(seed.CheckItems)))
			}
			continue
		}

		if logger != nil {
			logger.Info("内置巡检模板已同步", zap.String("name", seed.Name), zap.Int("check_items", len(seed.CheckItems)))
		}
	}

	return nil
}
