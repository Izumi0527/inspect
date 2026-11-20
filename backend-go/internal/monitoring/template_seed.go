package monitoring

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"go.uber.org/zap"
	"gorm.io/datatypes"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	BuiltinTemplateHuaweiCampusSwitch = "builtin_huawei_campus_switch"
	BuiltinTemplateCiscoH3CCoreNet    = "builtin_cisco_h3c_core_net"
	BuiltinTemplateBasicConnectivity  = "builtin_basic_connectivity_host"
	BuiltinTemplateOpticalBorder      = "builtin_optical_border_router"
)

type builtinTemplateSpec struct {
	Template MonitorTemplate
	Macros   []TemplateMacro
	Items    []MonitorItem
	LLDRules []MonitorLLDRule
}

func defaultTemplateMacros(cpuWarn, cpuCrit, memWarn, tempWarn, ifUtilWarn string) []TemplateMacro {
	return []TemplateMacro{
		{Key: "cpu_warn_pct", Label: "CPU 预警线", Unit: "%", DefaultValue: cpuWarn, Description: "CPU 利用率超过该值时触发警告"},
		{Key: "cpu_crit_pct", Label: "CPU 严重告警线", Unit: "%", DefaultValue: cpuCrit, Description: "CPU 利用率超过该值时触发严重告警"},
		{Key: "mem_warn_pct", Label: "内存预警线", Unit: "%", DefaultValue: memWarn, Description: "内存利用率超过该值时触发警告"},
		{Key: "temp_warn_c", Label: "高温预警", Unit: "°C", DefaultValue: tempWarn, Description: "设备温度超过该值时触发警告"},
		{Key: "if_util_warn_pct", Label: "端口利用率预警", Unit: "%", DefaultValue: ifUtilWarn, Description: "接口带宽利用率超过该值时触发警告"},
	}
}

func mustJSONBytes(v interface{}) datatypes.JSON {
	raw, err := json.Marshal(v)
	if err != nil {
		return datatypes.JSON([]byte("{}"))
	}
	return datatypes.JSON(raw)
}

func builtinTemplateSpecs() []builtinTemplateSpec {
	return []builtinTemplateSpec{
		{
			Template: MonitorTemplate{
				Code:               BuiltinTemplateHuaweiCampusSwitch,
				Name:               "华为园区交换机标准方案",
				Vendor:             "huawei",
				DeviceType:         "switch",
				Description:        "适用于华为 S 系列园区/汇聚交换机，涵盖 CPU、内存、温度、风扇电源单板、PoE 及接口速率错包监测。",
				IsBuiltin:          true,
				DefaultIntervalSec: 300,
			},
			Macros: defaultTemplateMacros("80", "90", "85", "75", "80"),
			Items: []MonitorItem{
				{ItemKey: "icmp.rtt", Name: "Ping 往返延迟", ApplicationTag: "availability", Protocol: "icmp", ValueType: "float", Unit: "ms", IntervalSec: 60, Enabled: true},
				{ItemKey: "cpu.usage", Name: "CPU 利用率", ApplicationTag: "system", Protocol: "builtin", ValueType: "float", Unit: "%", IntervalSec: 300, Enabled: true},
				{ItemKey: "memory.usage", Name: "内存利用率", ApplicationTag: "system", Protocol: "builtin", ValueType: "float", Unit: "%", IntervalSec: 300, Enabled: true},
				{ItemKey: "temperature", Name: "整机温度", ApplicationTag: "hardware", Protocol: "builtin", ValueType: "float", Unit: "°C", IntervalSec: 300, Enabled: true},
			},
			LLDRules: []MonitorLLDRule{
				{
					RuleKey:         "lld.interfaces",
					Name:            "交换机物理端口自动识别",
					EntityType:      "interface",
					PresetFlagsJSON: mustJSONBytes(LLDPresetFlags{IgnoreVirtual: true, IgnoreIdle: false, HighlightUplink: true}),
					KeepLostDays:    7,
					Enabled:         true,
				},
			},
		},
		{
			Template: MonitorTemplate{
				Code:               BuiltinTemplateCiscoH3CCoreNet,
				Name:               "思科/华三核心网络设备方案",
				Vendor:             "cisco,h3c",
				DeviceType:         "switch,router",
				Description:        "适用于 Cisco IOS/NX-OS 与 H3C Comware 核心交换机及路由器，强化上联口与系统负载监测。",
				IsBuiltin:          true,
				DefaultIntervalSec: 300,
			},
			Macros: defaultTemplateMacros("75", "88", "80", "70", "75"),
			Items: []MonitorItem{
				{ItemKey: "icmp.rtt", Name: "Ping 往返延迟", ApplicationTag: "availability", Protocol: "icmp", ValueType: "float", Unit: "ms", IntervalSec: 60, Enabled: true},
				{ItemKey: "cpu.usage", Name: "CPU 利用率", ApplicationTag: "system", Protocol: "builtin", ValueType: "float", Unit: "%", IntervalSec: 300, Enabled: true},
				{ItemKey: "memory.usage", Name: "内存利用率", ApplicationTag: "system", Protocol: "builtin", ValueType: "float", Unit: "%", IntervalSec: 300, Enabled: true},
				{ItemKey: "temperature", Name: "整机温度", ApplicationTag: "hardware", Protocol: "builtin", ValueType: "float", Unit: "°C", IntervalSec: 300, Enabled: true},
			},
			LLDRules: []MonitorLLDRule{
				{
					RuleKey:         "lld.interfaces",
					Name:            "核心端口自动识别",
					EntityType:      "interface",
					PresetFlagsJSON: mustJSONBytes(LLDPresetFlags{IgnoreVirtual: true, IgnoreIdle: false, HighlightUplink: true}),
					KeepLostDays:    7,
					Enabled:         true,
				},
			},
		},
		{
			Template: MonitorTemplate{
				Code:               BuiltinTemplateBasicConnectivity,
				Name:               "基础连通性与主机探活方案",
				Vendor:             "",
				DeviceType:         "server,host,unknown",
				Description:        "适用于通用服务器、终端及未识别型号设备的 ICMP 连通性与基础 SNMP 系统存活监测。",
				IsBuiltin:          true,
				DefaultIntervalSec: 300,
			},
			Macros: defaultTemplateMacros("85", "95", "85", "75", "85"),
			Items: []MonitorItem{
				{ItemKey: "icmp.rtt", Name: "Ping 往返延迟", ApplicationTag: "availability", Protocol: "icmp", ValueType: "float", Unit: "ms", IntervalSec: 60, Enabled: true},
				{ItemKey: "sys.uptime", Name: "系统运行时长", ApplicationTag: "system", Protocol: "builtin", ValueType: "uint", Unit: "s", IntervalSec: 300, Enabled: true},
			},
			LLDRules: []MonitorLLDRule{
				{
					RuleKey:         "lld.interfaces",
					Name:            "基础网卡自动识别",
					EntityType:      "interface",
					PresetFlagsJSON: mustJSONBytes(LLDPresetFlags{IgnoreVirtual: true, IgnoreIdle: false, HighlightUplink: false}),
					KeepLostDays:    7,
					Enabled:         true,
				},
			},
		},
		{
			Template: MonitorTemplate{
				Code:               BuiltinTemplateOpticalBorder,
				Name:               "光模块与边界路由扩展方案",
				Vendor:             "",
				DeviceType:         "router,firewall",
				Description:        "适用于边界路由器与防火墙，重点关注光模块光功率、BGP 邻居状态与高速上联口质量。",
				IsBuiltin:          true,
				DefaultIntervalSec: 300,
			},
			Macros: defaultTemplateMacros("75", "88", "80", "70", "75"),
			Items: []MonitorItem{
				{ItemKey: "icmp.rtt", Name: "Ping 往返延迟", ApplicationTag: "availability", Protocol: "icmp", ValueType: "float", Unit: "ms", IntervalSec: 60, Enabled: true},
				{ItemKey: "cpu.usage", Name: "CPU 利用率", ApplicationTag: "system", Protocol: "builtin", ValueType: "float", Unit: "%", IntervalSec: 300, Enabled: true},
				{ItemKey: "memory.usage", Name: "内存利用率", ApplicationTag: "system", Protocol: "builtin", ValueType: "float", Unit: "%", IntervalSec: 300, Enabled: true},
			},
			LLDRules: []MonitorLLDRule{
				{
					RuleKey:         "lld.interfaces",
					Name:            "边界高速口自动识别",
					EntityType:      "interface",
					PresetFlagsJSON: mustJSONBytes(LLDPresetFlags{IgnoreVirtual: true, IgnoreIdle: true, HighlightUplink: true}),
					KeepLostDays:    7,
					Enabled:         true,
				},
				{
					RuleKey:         "lld.optical",
					Name:            "光模块实体自动识别",
					EntityType:      "optical",
					PresetFlagsJSON: mustJSONBytes(LLDPresetFlags{IgnoreVirtual: true, HighlightUplink: true}),
					KeepLostDays:    7,
					Enabled:         true,
				},
			},
		},
	}
}

// EnsureBuiltinMonitorTemplates 幂等初始化 4 套内置预设监控方案及其默认采集项与自动识别规则。
func EnsureBuiltinMonitorTemplates(ctx context.Context, db *gorm.DB, logger *zap.Logger) error {
	if db == nil {
		return fmt.Errorf("database not initialized")
	}

	specs := builtinTemplateSpecs()
	now := time.Now().UTC()

	return db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, spec := range specs {
			tpl := spec.Template
			tpl.MacrosJSON = mustJSONBytes(spec.Macros)
			tpl.UpdatedAt = now
			if tpl.CreatedAt.IsZero() {
				tpl.CreatedAt = now
			}

			var existing MonitorTemplate
			err := tx.Where("code = ?", tpl.Code).Take(&existing).Error
			if err != nil {
				if err != gorm.ErrRecordNotFound {
					return err
				}
				if err := tx.Create(&tpl).Error; err != nil {
					return err
				}
			} else {
				tpl.ID = existing.ID
				if err := tx.Model(&MonitorTemplate{}).Where("id = ?", existing.ID).Updates(map[string]interface{}{
					"name":                 tpl.Name,
					"vendor":               tpl.Vendor,
					"device_type":          tpl.DeviceType,
					"description":          tpl.Description,
					"is_builtin":           true,
					"default_interval_sec": tpl.DefaultIntervalSec,
					"macros_json":          tpl.MacrosJSON,
					"updated_at":           now,
				}).Error; err != nil {
					return err
				}
			}

			for _, item := range spec.Items {
				item.TemplateID = tpl.ID
				if len(item.PreprocessingJSON) == 0 {
					item.PreprocessingJSON = datatypes.JSON([]byte("[]"))
				}
				if len(item.ValueMapJSON) == 0 {
					item.ValueMapJSON = datatypes.JSON([]byte("{}"))
				}
				if err := tx.Clauses(clause.OnConflict{
					Columns:   []clause.Column{{Name: "template_id"}, {Name: "item_key"}},
					DoNothing: true,
				}).Create(&item).Error; err != nil {
					return err
				}
			}

			for _, rule := range spec.LLDRules {
				rule.TemplateID = tpl.ID
				if len(rule.PresetFlagsJSON) == 0 {
					rule.PresetFlagsJSON = datatypes.JSON([]byte("{}"))
				}
				if err := tx.Clauses(clause.OnConflict{
					Columns:   []clause.Column{{Name: "template_id"}, {Name: "rule_key"}},
					DoNothing: true,
				}).Create(&rule).Error; err != nil {
					return err
				}
			}
		}
		return nil
	})
}

type legacyDeviceCandidate struct {
	ID                 int     `gorm:"column:id"`
	Vendor             string  `gorm:"column:vendor"`
	DeviceType         string  `gorm:"column:device_type"`
	DetectedDeviceType *string `gorm:"column:detected_device_type"`
	GroupID            *int    `gorm:"column:group_id"`
}

// AutoBindLegacyDevices 为尚未有任何直接绑定或组绑定的存量设备幂等自动匹配内置监控方案。
// 绝不覆盖用户已经手工绑定的方案。
func AutoBindLegacyDevices(ctx context.Context, db *gorm.DB, logger *zap.Logger) error {
	if db == nil {
		return fmt.Errorf("database not initialized")
	}

	var templates []MonitorTemplate
	if err := db.WithContext(ctx).Where("is_builtin = ?", true).Find(&templates).Error; err != nil {
		return err
	}
	if len(templates) == 0 {
		return nil
	}
	templateIDByCode := make(map[string]int64, len(templates))
	for _, t := range templates {
		templateIDByCode[t.Code] = t.ID
	}

	var candidates []legacyDeviceCandidate
	if err := db.WithContext(ctx).Table("devices").
		Select("id, vendor, device_type, detected_device_type, group_id").
		Find(&candidates).Error; err != nil {
		return err
	}
	if len(candidates) == 0 {
		return nil
	}

	// 查询已有直接绑定的设备
	var directBoundIDs []int
	if err := db.WithContext(ctx).Model(&DeviceTemplateBinding{}).
		Distinct("device_id").Pluck("device_id", &directBoundIDs).Error; err != nil {
		return err
	}
	directBoundSet := make(map[int]bool, len(directBoundIDs))
	for _, id := range directBoundIDs {
		directBoundSet[id] = true
	}

	// 查询已有组绑定的分组
	var groupBoundIDs []int
	if err := db.WithContext(ctx).Model(&TemplateGroupBinding{}).
		Where("enabled = ?", true).
		Distinct("group_id").Pluck("group_id", &groupBoundIDs).Error; err != nil {
		return err
	}
	groupBoundSet := make(map[int]bool, len(groupBoundIDs))
	for _, gid := range groupBoundIDs {
		groupBoundSet[gid] = true
	}

	now := time.Now().UTC()
	var toCreate []DeviceTemplateBinding
	for _, dev := range candidates {
		if directBoundSet[dev.ID] {
			continue
		}
		if dev.GroupID != nil && groupBoundSet[*dev.GroupID] {
			continue
		}

		code := matchBuiltinTemplateCode(dev.Vendor, dev.DeviceType, dev.DetectedDeviceType)
		tplID, ok := templateIDByCode[code]
		if !ok {
			tplID = templateIDByCode[BuiltinTemplateBasicConnectivity]
		}
		if tplID <= 0 {
			continue
		}

		toCreate = append(toCreate, DeviceTemplateBinding{
			DeviceID:           dev.ID,
			TemplateID:         tplID,
			OverrideMacrosJSON: datatypes.JSON([]byte("{}")),
			Enabled:            true,
			CreatedAt:          now,
			UpdatedAt:          now,
		})
	}

	if len(toCreate) == 0 {
		return nil
	}

	if err := db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "device_id"}, {Name: "template_id"}},
		DoNothing: true,
	}).CreateInBatches(&toCreate, 200).Error; err != nil {
		return err
	}

	if logger != nil {
		logger.Info("已为存量设备自动匹配内置监控方案", zap.Int("bound_count", len(toCreate)))
	}
	return nil
}

func matchBuiltinTemplateCode(vendor, deviceType string, detectedType *string) string {
	v := strings.ToLower(strings.TrimSpace(vendor))
	dt := strings.ToLower(strings.TrimSpace(deviceType))
	if detectedType != nil && strings.TrimSpace(*detectedType) != "" {
		dt = strings.ToLower(strings.TrimSpace(*detectedType))
	}

	switch {
	case strings.Contains(v, "huawei"):
		return BuiltinTemplateHuaweiCampusSwitch
	case strings.Contains(v, "cisco") || strings.Contains(v, "h3c"):
		return BuiltinTemplateCiscoH3CCoreNet
	case dt == "router" || dt == "firewall":
		return BuiltinTemplateOpticalBorder
	default:
		return BuiltinTemplateBasicConnectivity
	}
}
