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

func ckBandwidth() map[string]interface{} {
	return map[string]interface{}{
		"id": "bandwidth", "name": "带宽利用率", "description": "基于接口流量评估带宽利用",
		"type": "snmp", "category": "performance", "metric": "bandwidth", "weight": 7,
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
			Description: "连通性 + CPU + 内存，覆盖设备核心健康指标。",
			Category:    "network",
			DeviceTypes: deviceTypes,
			CheckItems:  []map[string]interface{}{ckConnectivity(), ckSNMPReachable(), ckCPU(), ckMemory()},
		},
		{
			Name:        "标准巡检",
			Description: "基础健康 + 温度 + 运行时间 + 接口状态，适合日常例行巡检。",
			Category:    "network",
			DeviceTypes: deviceTypes,
			CheckItems:  []map[string]interface{}{ckConnectivity(), ckSNMPReachable(), ckCPU(), ckMemory(), ckTemperature(), ckUptime(), ckInterface()},
		},
		{
			Name:        "全面巡检",
			Description: "标准巡检 + 带宽利用率，覆盖全部可采集维度。",
			Category:    "network",
			DeviceTypes: deviceTypes,
			CheckItems:  []map[string]interface{}{ckConnectivity(), ckSNMPReachable(), ckCPU(), ckMemory(), ckTemperature(), ckUptime(), ckInterface(), ckBandwidth()},
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
