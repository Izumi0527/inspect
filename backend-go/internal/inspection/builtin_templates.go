package inspection

import (
	"context"
	"encoding/json"
	"slices"
	"strings"
	"time"

	"go.uber.org/zap"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// builtinTemplateSeed 描述一个内置巡检模板的规范定义。
// 这是内置模板在运行期的权威来源：每次后端启动都会按 name 幂等 upsert，
// 因此修改这里的检查项后重启后端即可让已有数据库加载，无需重建库。
//
// 每个内置模板恰好绑定一种设备类型（DeviceTypes 只有一个元素），
// 执行入口据此拒绝类型不符的设备——交换机模板只巡检交换机。
type builtinTemplateSeed struct {
	Name        string                   `json:"name"`
	Description string                   `json:"description"`
	Category    string                   `json:"category"`
	DeviceTypes []string                 `json:"device_types"`
	CheckItems  []map[string]interface{} `json:"check_items"`
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

// ckInterfaceAdminStatus 接口管理状态一致性。admin up 但 oper down 且曾有流量才是真故障，
// 从未有流量的是空闲口，admin down 是运维主动关闭。本项补上了「接口状态」检查缺失的这一半信息。
func ckInterfaceAdminStatus() map[string]interface{} {
	return map[string]interface{}{
		"id": "interface_admin_status", "name": "接口状态一致性", "description": "识别曾经承载流量、现已中断的接口；人为关闭与从未接线的接口不计异常",
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
// 适用范围由所在模板整体绑定的设备类型决定，检查项自身不再声明 device_types。
// 执行端仍兼容存量模板里的检查项级 device_types（不适用落 not_applicable）。
// ---------------------------------------------------------------------------

// ckFanStatus 风扇状态。单风扇故障导致散热余量不足，等温度检查发现时
// 设备往往已在劣化。仅网络设备的 catalog 定义了对应 OID。
func ckFanStatus() map[string]interface{} {
	return map[string]interface{}{
		"id": "fan_status", "name": "风扇状态", "description": "检查风扇模块运行状态，识别散热能力下降",
		"type": "snmp", "category": "health", "metric": "fan_status", "weight": 8,
		"config": map[string]interface{}{}, "enabled": true,
	}
}

// ckPowerStatus 电源状态。单电源运行时任何一次市电抖动都会导致宕机，
// 冗余是否还在是比 CPU 高低更要紧的事。
func ckPowerStatus() map[string]interface{} {
	return map[string]interface{}{
		"id": "power_status", "name": "电源状态", "description": "检查电源模块运行状态，识别冗余失效",
		"type": "snmp", "category": "health", "metric": "power_status", "weight": 9,
		"config": map[string]interface{}{}, "enabled": true,
	}
}

// ckPoEStatus PoE 供电余量。预算耗尽后新接的 AP 与 IP 话机直接不上电，
// 现象诡异难查。仅交换机模板包含。
func ckPoEStatus() map[string]interface{} {
	return map[string]interface{}{
		"id": "poe_status", "name": "PoE 供电余量", "description": "检查 PoE 剩余保障功率；预算耗尽后新接入的 AP、IP 话机将无法上电",
		"type": "snmp", "category": "health", "metric": "poe", "weight": 6,
		"config":  map[string]interface{}{"unit": "W", "threshold": map[string]interface{}{"warning": 30, "critical": 10}},
		"enabled": true,
	}
}

// ckOpticalPower 光模块收发光功率。光衰比错包更早暴露链路劣化，
// 是提前更换光模块的依据。判定方向与其他阈值相反——越低越危险。
func ckOpticalPower() map[string]interface{} {
	return map[string]interface{}{
		"id": "optical_power", "name": "光模块光功率", "description": "检查光模块收光功率是否跌出正常区间，提前发现光衰",
		"type": "snmp", "category": "health", "metric": "optical_power", "weight": 8,
		"config":  map[string]interface{}{"unit": "dBm", "threshold": map[string]interface{}{"warning": -25, "critical": -30}},
		"enabled": true,
	}
}

// ckBGPPeers BGP 邻居状态。邻居断开直接造成路由黑洞；Established 但建立
// 时长很短则说明会话在反复重建，比单纯断开更隐蔽。仅路由器与防火墙模板包含。
func ckBGPPeers() map[string]interface{} {
	return map[string]interface{}{
		"id": "bgp_peers", "name": "BGP 邻居状态", "description": "检查 BGP 邻居是否全部建立且会话稳定",
		"type": "snmp", "category": "performance", "metric": "bgp_peers", "weight": 10,
		"config": map[string]interface{}{}, "enabled": true,
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

// ---------------------------------------------------------------------------
// 主机专项检查项（HOST-RESOURCES-MIB，Linux net-snmp 与 Windows SNMP 服务均支持）
// ---------------------------------------------------------------------------

// ckDiskUsage 逐分区磁盘使用率（hrStorageFixedDisk）。磁盘写满是服务器最常见的
// 故障诱因之一：日志、数据库、临时文件一旦占满分区，服务会以各种离奇方式失败。
// 仅服务器模板包含。
func ckDiskUsage() map[string]interface{} {
	return map[string]interface{}{
		"id": "disk_usage", "name": "磁盘使用率", "description": "逐分区检查磁盘使用率，识别即将写满的文件系统",
		"type": "snmp", "category": "health", "metric": "disk_usage", "weight": 10,
		"config":  map[string]interface{}{"unit": "%", "threshold": map[string]interface{}{"warning": 80, "critical": 90}},
		"enabled": true,
	}
}

// describe 覆盖检查项说明：同一指标在不同设备类型上的排查方向不同（交换机 CPU
// 偏高常见于环路，防火墙 CPU 偏高常见于新建会话冲击），说明要讲清各自的关注点。
func describe(item map[string]interface{}, description string) map[string]interface{} {
	item["description"] = description
	return item
}

// withThreshold 覆盖检查项阈值：服务器常态负载高于网络设备，沿用网络设备的
// 阈值会让每台服务器都告警。
func withThreshold(item map[string]interface{}, warning, critical float64) map[string]interface{} {
	config, _ := item["config"].(map[string]interface{})
	if config == nil {
		config = map[string]interface{}{}
		item["config"] = config
	}
	config["threshold"] = map[string]interface{}{"warning": warning, "critical": critical}
	return item
}

// builtinTemplateSeeds 按设备类型划分的四个内置模板，顺序与 InspectableDeviceTypes 一致。
// 每类模板只放该类设备真正具备、且能经 SNMP 采到的检查项：交换机才有 PoE 与双工，
// 路由器与防火墙才有 BGP 与出口吞吐量，服务器才有磁盘且没有风扇、电源等网络设备硬件项。
func builtinTemplateSeeds() []builtinTemplateSeed {
	return []builtinTemplateSeed{
		{
			Name:        "交换机巡检",
			Description: "面向接入、汇聚与核心交换机：设备健康（CPU、内存、温度、风扇、电源），端口物理层（状态、错包、丢弃、双工、利用率），上联光模块与 PoE 供电余量。",
			Category:    "network",
			DeviceTypes: []string{"switch"},
			CheckItems: []map[string]interface{}{
				ckConnectivity(), ckSNMPReachable(),
				describe(ckCPU(), "监控交换机 CPU 使用率；持续偏高常见于二层环路、广播风暴或协议报文冲击"),
				describe(ckMemory(), "监控交换机内存使用率；MAC/ARP 表项膨胀会持续占用内存"),
				ckTemperature(), ckFanStatus(), ckPowerStatus(), ckUptime(),
				describe(ckInterface(), "统计端口运行状态，全部端口均未运行时告警"),
				describe(ckInterfaceAdminStatus(), "识别曾经承载流量、现已中断的端口；从未接线的空闲口不计异常"),
				describe(ckInterfaceUtilization(), "逐端口计算入/出方向带宽利用率，识别上联与汇聚链路拥塞"),
				ckInterfaceErrors(), ckInterfaceDiscards(),
				describe(ckInterfaceDuplex(), "检测高速端口是否误协商为半双工（接入终端的常见故障）"),
				ckOpticalPower(), ckPoEStatus(), ckFirmwareVersion(),
			},
		},
		{
			Name:        "路由器巡检",
			Description: "面向出口与广域网路由器：设备健康、链路质量（接口状态、利用率、错包、丢弃）、光模块、BGP 邻居稳定性与出口吞吐量。",
			Category:    "network",
			DeviceTypes: []string{"router"},
			CheckItems: []map[string]interface{}{
				ckConnectivity(), ckSNMPReachable(),
				describe(ckCPU(), "监控路由器 CPU 使用率；路由振荡与大量 NAT/ACL 处理会推高控制平面负载"),
				describe(ckMemory(), "监控路由器内存使用率；路由表规模增长会持续占用内存"),
				ckTemperature(), ckFanStatus(), ckPowerStatus(), ckUptime(),
				ckInterface(),
				describe(ckInterfaceAdminStatus(), "识别曾经承载流量、现已中断的接口（如专线中断）；从未启用的接口不计异常"),
				describe(ckInterfaceUtilization(), "逐接口计算入/出方向带宽利用率，识别广域网与出口链路拥塞"),
				ckInterfaceErrors(), ckInterfaceDiscards(), ckOpticalPower(),
				describe(ckBGPPeers(), "检查 BGP 邻居是否全部建立且会话稳定；邻居断开会造成路由黑洞"),
				describe(ckBandwidth(), "统计设备入/出方向总流量速率，用于出口容量规划"),
				ckFirmwareVersion(),
			},
		},
		{
			Name:        "防火墙巡检",
			Description: "面向边界防火墙：设备健康、接口与链路质量、光模块、BGP 邻居（启用动态路由时）、整机吞吐量，以及用于核查补丁级别的固件版本。",
			Category:    "network",
			DeviceTypes: []string{"firewall"},
			CheckItems: []map[string]interface{}{
				ckConnectivity(), ckSNMPReachable(),
				describe(ckCPU(), "监控防火墙 CPU 使用率；新建会话速率过高或攻击流量会推高负载"),
				describe(ckMemory(), "监控防火墙内存使用率；并发会话表占用内存，持续偏高需关注会话老化配置"),
				ckTemperature(), ckFanStatus(), ckPowerStatus(), ckUptime(),
				ckInterface(),
				describe(ckInterfaceAdminStatus(), "识别曾经承载流量、现已中断的接口（如上联或心跳链路中断）；从未启用的接口不计异常"),
				describe(ckInterfaceUtilization(), "逐接口计算入/出方向带宽利用率，识别安全域之间的链路拥塞"),
				ckInterfaceErrors(), ckInterfaceDiscards(), ckOpticalPower(),
				describe(ckBGPPeers(), "检查 BGP 邻居状态（启用动态路由的防火墙）；邻居断开会造成业务中断"),
				describe(ckBandwidth(), "统计防火墙总吞吐量，对照型号规格与许可证评估处理余量"),
				describe(ckFirmwareVersion(), "采集型号与固件版本，便于对照厂商安全公告核查补丁级别"),
			},
		},
		{
			Name:        "服务器巡检",
			Description: "面向 Linux / Windows 服务器（需开启 SNMP 并放行 HOST-RESOURCES-MIB）：CPU、内存（扣除缓冲与缓存）、逐分区磁盘使用率、主机运行时间与网卡状态。",
			Category:    "system",
			DeviceTypes: []string{"server"},
			CheckItems: []map[string]interface{}{
				ckConnectivity(), ckSNMPReachable(),
				withThreshold(describe(ckCPU(), "监控主机 CPU 平均使用率（全部核心取平均）"), 80, 90),
				withThreshold(describe(ckMemory(), "监控主机物理内存使用率，已扣除可回收的缓冲与缓存"), 85, 95),
				ckDiskUsage(),
				describe(ckUptime(), "读取主机开机时长，不足 24 小时提示近期重启"),
				describe(ckInterface(), "统计网卡运行状态，全部网卡均未运行时告警"),
				describe(ckInterfaceAdminStatus(), "识别曾经承载流量、现已中断的网卡；从未接线的网卡不计异常"),
				describe(ckInterfaceUtilization(), "逐网卡计算入/出方向带宽利用率，识别业务流量打满网卡"),
				describe(ckInterfaceErrors(), "逐网卡统计收发错包占比，识别网线、网卡或对端端口劣化"),
				describe(ckInterfaceDiscards(), "逐网卡统计报文丢弃占比，识别收包缓冲不足或流量突发"),
			},
		},
	}
}

// builtinTemplateSeedsJSON 序列化内置模板种子，供外置测试经 go:linkname 断言
// JSON 契约（种子结构体未导出，跨包无法引用其类型）。
func builtinTemplateSeedsJSON() []byte {
	data, _ := json.Marshal(builtinTemplateSeeds())
	return data
}

// CheckItemDimensionKey 把检查项归一到维度键：ICMP/PING 类没有 metric（执行端按
// type 分派），统一归到 connectivity；其余取小写 metric。报表覆盖范围与
// BuiltinMetricsForDeviceType 共用这一口径。
func CheckItemDimensionKey(item map[string]interface{}) string {
	typ, _ := item["type"].(string)
	switch strings.ToLower(strings.TrimSpace(typ)) {
	case "icmp", "ping":
		return "connectivity"
	}
	metric, _ := item["metric"].(string)
	return strings.ToLower(strings.TrimSpace(metric))
}

// BuiltinMetricsForDeviceType 返回该设备类型内置模板覆盖的维度键（顺序同模板）。
// 报表据此把「该类设备可查的全部维度」作为覆盖范围的全集：路由器模板不含 PoE
// 不代表「PoE 未核查」，而是路由器本就没有这一项。未知设备类型（如无线 AP）返回 nil。
func BuiltinMetricsForDeviceType(deviceType string) []string {
	normalized := NormalizeDeviceType(deviceType)
	for _, seed := range builtinTemplateSeeds() {
		if !slices.Contains(seed.DeviceTypes, normalized) {
			continue
		}
		keys := make([]string, 0, len(seed.CheckItems))
		for _, item := range seed.CheckItems {
			if key := CheckItemDimensionKey(item); key != "" {
				keys = append(keys, key)
			}
		}
		return keys
	}
	return nil
}

// allBuiltinCheckItems 枚举全部内置模板去重后的检查项（按 id 去重），
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

// strategyDeviceGroup 是迁移后的一条策略：同一设备类型的设备改绑到该类型的内置模板。
type strategyDeviceGroup struct {
	DeviceType string `json:"device_type"`
	TemplateID int    `json:"template_id"`
	DeviceIDs  []int  `json:"device_ids"`
	// NameSuffix 在按类型拆分时追加到策略名称后（如「（交换机）」），未拆分时为空。
	NameSuffix string `json:"name_suffix"`
}

// strategyMigrationPlan 描述一条引用过时内置模板的策略如何迁移：
// 第一组留在原策略（原地改绑），其余组各自新建一条策略。
type strategyMigrationPlan struct {
	Groups []strategyDeviceGroup `json:"groups"`
	// Dropped 是无法归入任何可巡检类型的设备（无线 AP、未分类、已删除），从策略中移除。
	Dropped []int `json:"dropped"`
}

// planStrategyMigration 按设备类型把策略里的设备分组到对应类型的内置模板。
// 分组顺序固定为 InspectableDeviceTypes 的顺序，保证拆分结果可预期；
// typeOf 缺失某设备即视为已删除。纯函数，不触库。
func planStrategyMigration(deviceIDs []int, typeOf map[int]string, templateIDByType map[string]int) strategyMigrationPlan {
	plan := strategyMigrationPlan{Groups: []strategyDeviceGroup{}, Dropped: []int{}}
	byType := make(map[string][]int, len(InspectableDeviceTypes))
	for _, id := range deviceIDs {
		deviceType := NormalizeDeviceType(typeOf[id])
		if _, ok := templateIDByType[deviceType]; !ok || !IsInspectableDeviceType(deviceType) {
			plan.Dropped = append(plan.Dropped, id)
			continue
		}
		byType[deviceType] = append(byType[deviceType], id)
	}

	for _, deviceType := range InspectableDeviceTypes {
		ids := byType[deviceType]
		if len(ids) == 0 {
			continue
		}
		plan.Groups = append(plan.Groups, strategyDeviceGroup{
			DeviceType: deviceType,
			TemplateID: templateIDByType[deviceType],
			DeviceIDs:  ids,
		})
	}
	if len(plan.Groups) > 1 {
		for i := range plan.Groups {
			plan.Groups[i].NameSuffix = "（" + DeviceTypeLabel(plan.Groups[i].DeviceType) + "）"
		}
	}
	return plan
}

// planStrategyMigrationJSON 序列化迁移规划，供外置测试经 go:linkname 断言 JSON 契约。
func planStrategyMigrationJSON(deviceIDs []int, typeOf map[int]string, templateIDByType map[string]int) []byte {
	data, _ := json.Marshal(planStrategyMigration(deviceIDs, typeOf, templateIDByType))
	return data
}

// EnsureBuiltinTemplates 在后端启动时按 name 幂等同步内置巡检模板：
// 已存在（is_default）则更新其检查项等内容，不存在则创建。
// 内置模板对用户只读（不可改/删），因此覆盖更新是安全的；非内置（用户自建）模板不受影响。
//
// 顺序是「先 upsert 新模板 → 事务内把引用过时内置模板的策略改绑到新模板 → 删除过时模板」：
// 改绑需要新模板的 ID，而先删旧模板会让这些策略静默指向不存在的模板（库里没有外键）。
func EnsureBuiltinTemplates(ctx context.Context, db *gorm.DB, logger *zap.Logger) error {
	if db == nil {
		return nil
	}

	seeds := builtinTemplateSeeds()
	names := make([]string, 0, len(seeds))
	for _, seed := range seeds {
		names = append(names, seed.Name)
		if err := upsertBuiltinTemplate(ctx, db, seed, logger); err != nil {
			return err
		}
	}

	return db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var obsoleteIDs []int
		if err := tx.Model(&Template{}).
			Where("is_default = ? AND name NOT IN ?", true, names).
			Pluck("id", &obsoleteIDs).Error; err != nil {
			return err
		}
		if len(obsoleteIDs) == 0 {
			return nil
		}

		templateIDByType, err := builtinTemplateIDsByDeviceType(tx, seeds)
		if err != nil {
			return err
		}
		if err := migrateStrategiesOffTemplates(tx, obsoleteIDs, templateIDByType, logger); err != nil {
			return err
		}

		cleanup := tx.Where("id IN ?", obsoleteIDs).Delete(&Template{})
		if cleanup.Error != nil {
			return cleanup.Error
		}
		if logger != nil {
			logger.Info("已清理过时内置巡检模板", zap.Int64("deleted", cleanup.RowsAffected))
		}
		return nil
	})
}

// upsertBuiltinTemplate 按 name 更新已有内置模板，不存在则创建。
func upsertBuiltinTemplate(ctx context.Context, db *gorm.DB, seed builtinTemplateSeed, logger *zap.Logger) error {
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
		return nil
	}

	if logger != nil {
		logger.Info("内置巡检模板已同步", zap.String("name", seed.Name), zap.Int("check_items", len(seed.CheckItems)))
	}
	return nil
}

// builtinTemplateIDsByDeviceType 查出当前各设备类型内置模板的 ID。
func builtinTemplateIDsByDeviceType(tx *gorm.DB, seeds []builtinTemplateSeed) (map[string]int, error) {
	idByType := make(map[string]int, len(seeds))
	for _, seed := range seeds {
		var ids []int
		if err := tx.Model(&Template{}).
			Where("name = ? AND is_default = ?", seed.Name, true).
			Order("id").
			Pluck("id", &ids).Error; err != nil {
			return nil, err
		}
		if len(ids) == 0 {
			continue
		}
		for _, deviceType := range seed.DeviceTypes {
			idByType[NormalizeDeviceType(deviceType)] = ids[0]
		}
	}
	return idByType, nil
}

// migrateStrategiesOffTemplates 把引用 templateIDs（过时内置模板）的策略按设备类型
// 改绑到新的内置模板：单一类型原地改绑；混合类型拆成多条，原策略保留第一组；
// 一台可巡检设备都没有的策略停用，并保留原引用供人工处理。
func migrateStrategiesOffTemplates(tx *gorm.DB, templateIDs []int, templateIDByType map[string]int, logger *zap.Logger) error {
	obsolete := make(map[int]bool, len(templateIDs))
	for _, id := range templateIDs {
		obsolete[id] = true
	}

	var strategies []Strategy
	if err := tx.Find(&strategies).Error; err != nil {
		return err
	}

	now := time.Now().UTC()
	for _, strategy := range strategies {
		referenced := false
		for _, id := range decodeIntSlice(strategy.Templates) {
			if obsolete[id] {
				referenced = true
				break
			}
		}
		if !referenced {
			continue
		}

		deviceIDs := decodeIntSlice(strategy.Devices)
		typeOf, err := loadDeviceTypes(tx, deviceIDs)
		if err != nil {
			return err
		}
		plan := planStrategyMigration(deviceIDs, typeOf, templateIDByType)

		if len(plan.Groups) == 0 {
			if err := tx.Model(&Strategy{}).Where("id = ?", strategy.ID).Updates(map[string]interface{}{
				"enabled":       false,
				"next_run_time": nil,
				"updated_at":    now,
			}).Error; err != nil {
				return err
			}
			if logger != nil {
				logger.Warn("巡检策略没有可巡检类型的设备，已停用，请人工调整",
					zap.Int("strategy_id", strategy.ID), zap.String("name", strategy.Name), zap.Ints("dropped_devices", plan.Dropped))
			}
			continue
		}

		first := plan.Groups[0]
		firstDevices, err := encodeJSON(first.DeviceIDs)
		if err != nil {
			return err
		}
		firstTemplates, err := encodeJSON([]int{first.TemplateID})
		if err != nil {
			return err
		}
		if err := tx.Model(&Strategy{}).Where("id = ?", strategy.ID).Updates(map[string]interface{}{
			"name":       strategy.Name + first.NameSuffix,
			"devices":    firstDevices,
			"templates":  firstTemplates,
			"updated_at": now,
		}).Error; err != nil {
			return err
		}

		for _, group := range plan.Groups[1:] {
			devicesJSON, err := encodeJSON(group.DeviceIDs)
			if err != nil {
				return err
			}
			templatesJSON, err := encodeJSON([]int{group.TemplateID})
			if err != nil {
				return err
			}
			split := Strategy{
				Name:        strategy.Name + group.NameSuffix,
				Description: strategy.Description,
				Type:        strategy.Type,
				Cron:        strategy.Cron,
				Devices:     devicesJSON,
				Templates:   templatesJSON,
				Enabled:     strategy.Enabled,
				NextRunTime: strategy.NextRunTime,
				CreatedAt:   &now,
				UpdatedAt:   &now,
			}
			if err := tx.Create(&split).Error; err != nil {
				return err
			}
		}

		if logger != nil {
			logger.Info("巡检策略已改绑到按设备类型划分的内置模板",
				zap.Int("strategy_id", strategy.ID), zap.String("name", strategy.Name),
				zap.Int("groups", len(plan.Groups)), zap.Ints("dropped_devices", plan.Dropped))
		}
	}
	return nil
}

// loadDeviceTypes 查出设备 ID → 设备类型；查不到的设备（已删除）不在结果中。
func loadDeviceTypes(tx *gorm.DB, deviceIDs []int) (map[int]string, error) {
	typeOf := make(map[int]string, len(deviceIDs))
	if len(deviceIDs) == 0 {
		return typeOf, nil
	}
	type deviceTypeRow struct {
		ID         int    `gorm:"column:id"`
		DeviceType string `gorm:"column:device_type"`
	}
	var rows []deviceTypeRow
	if err := tx.Table("devices").Select("id, device_type").Where("id IN ?", deviceIDs).Scan(&rows).Error; err != nil {
		return nil, err
	}
	for _, row := range rows {
		typeOf[row.ID] = row.DeviceType
	}
	return typeOf, nil
}
