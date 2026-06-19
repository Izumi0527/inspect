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

// huaweiInspectionCheckItems 返回华为（VRP）交换机/路由器通用的内置检查项。
//
// 设计约束：每一项都必须能被后端 executeCheckItems/executeSNMPCheck 真正执行——
//   - type 仅用 icmp / snmp（ssh/http/script 当前会被后端跳过）；
//   - SNMP 项按“名称关键词”被后端分派到对应指标（cpu/内存/温度/运行时间/接口/带宽），
//     因此名称中的关键词不可随意更改；
//   - 带宽项命名为“带宽利用率”而非“接口带宽”，避免被“接口”分支优先匹配；
//   - config.oid 仅用于展示与文档，真实采集 OID 由后端厂商注册表按设备厂商解析。
//
// CPU/内存/温度采用华为企业 OID（hwEntity 系列），其余采用标准 MIB-II。
func huaweiInspectionCheckItems() []map[string]interface{} {
	return []map[string]interface{}{
		{
			"id": "connectivity", "name": "设备连通性", "description": "ICMP 探测设备可达性",
			"type": "icmp", "category": "connectivity", "weight": 8,
			"config": map[string]interface{}{}, "enabled": true,
		},
		{
			"id": "snmp_reachable", "name": "SNMP 服务可达", "description": "校验设备 SNMP 服务可用",
			"type": "snmp", "category": "connectivity", "weight": 6,
			"config": map[string]interface{}{}, "enabled": true,
		},
		{
			"id": "cpu_usage", "name": "CPU 使用率检查", "description": "监控设备 CPU 使用率",
			"type": "snmp", "category": "health", "weight": 10,
			"config": map[string]interface{}{
				"oid": "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.5", "unit": "%", "timeout": 5,
				"threshold": map[string]interface{}{"warning": 70, "critical": 85},
			},
			"enabled": true,
		},
		{
			"id": "memory_usage", "name": "内存使用率检查", "description": "监控设备内存使用率",
			"type": "snmp", "category": "health", "weight": 10,
			"config": map[string]interface{}{
				"oid": "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.7", "unit": "%", "timeout": 5,
				"threshold": map[string]interface{}{"warning": 75, "critical": 90},
			},
			"enabled": true,
		},
		{
			"id": "temperature", "name": "设备温度检查", "description": "监控单板/整机温度",
			"type": "snmp", "category": "health", "weight": 7,
			"config": map[string]interface{}{
				"oid": "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.11", "unit": "℃", "timeout": 5,
				"threshold": map[string]interface{}{"warning": 60, "critical": 75},
			},
			"enabled": true,
		},
		{
			"id": "uptime", "name": "系统运行时间", "description": "读取设备运行时长",
			"type": "snmp", "category": "health", "weight": 4,
			"config": map[string]interface{}{"oid": "1.3.6.1.2.1.1.3.0"}, "enabled": true,
		},
		{
			"id": "interface_status", "name": "接口状态检查", "description": "检查关键接口运行状态",
			"type": "snmp", "category": "performance", "weight": 9,
			"config": map[string]interface{}{"oid": "1.3.6.1.2.1.2.2.1.8"}, "enabled": true,
		},
		{
			"id": "bandwidth", "name": "带宽利用率", "description": "基于接口流量评估带宽利用",
			"type": "snmp", "category": "performance", "weight": 7,
			"config": map[string]interface{}{"oid": "1.3.6.1.2.1.31.1.1.1.6"}, "enabled": true,
		},
	}
}

func builtinTemplateSeeds() []builtinTemplateSeed {
	return []builtinTemplateSeed{
		{
			Name:        "Huawei 交换机标准巡检",
			Description: "适用于 Huawei（VRP）交换机的标准巡检模板，覆盖连通性、设备健康（CPU/内存/温度/运行时间）与接口性能检查",
			Category:    "network",
			DeviceTypes: map[string]interface{}{"vendors": []string{"Huawei"}, "device_types": []string{"switch"}},
			CheckItems:  huaweiInspectionCheckItems(),
		},
		{
			Name:        "Huawei 路由器标准巡检",
			Description: "适用于 Huawei（VRP）路由器的标准巡检模板，覆盖连通性、设备健康（CPU/内存/温度/运行时间）与接口/带宽性能检查",
			Category:    "network",
			DeviceTypes: map[string]interface{}{"vendors": []string{"Huawei"}, "device_types": []string{"router"}},
			CheckItems:  huaweiInspectionCheckItems(),
		},
	}
}

// EnsureBuiltinTemplates 在后端启动时按 name 幂等同步内置巡检模板：
// 已存在（is_default）则更新其检查项等内容，不存在则创建。
// 内置模板对用户只读（不可改/删），因此覆盖更新是安全的；非内置（用户自建）模板不受影响。
func EnsureBuiltinTemplates(ctx context.Context, db *gorm.DB, logger *zap.Logger) error {
	if db == nil {
		return nil
	}

	for _, seed := range builtinTemplateSeeds() {
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
