package inspection

import (
	"encoding/json"
	"slices"
	"strings"

	"gorm.io/datatypes"
)

// InspectableDeviceTypes 是可巡检的设备类型，每个内置模板恰好对应其中一种。
// 顺序即界面呈现顺序，也是旧档位策略迁移时按类型拆分的顺序。
// 无线 AP 刻意不在其中：AP 多由 AC 统一管理，不单独巡检。
var InspectableDeviceTypes = []string{"switch", "router", "firewall", "server"}

// NormalizeDeviceType 把设备类型归一为小写、去首尾空白。
// 设备档案的 device_type 来源不一（手工录入、Excel 导入、自动发现），大小写不统一。
func NormalizeDeviceType(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

// IsInspectableDeviceType 判断设备类型是否属于四类可巡检类型。
func IsInspectableDeviceType(value string) bool {
	return slices.Contains(InspectableDeviceTypes, NormalizeDeviceType(value))
}

// DeviceTypeLabel 返回设备类型的中文名，用于执行结果、校验报错等面向用户的文案。
// 未识别的取值原样返回，避免把自定义类型瞎翻成别的东西。
func DeviceTypeLabel(value string) string {
	switch NormalizeDeviceType(value) {
	case "":
		return "未分类"
	case "switch":
		return "交换机"
	case "router":
		return "路由器"
	case "firewall":
		return "防火墙"
	case "server":
		return "服务器"
	case "ap", "wireless_ap":
		return "无线AP"
	default:
		return strings.TrimSpace(value)
	}
}

// DeviceTypeLabels 把一组设备类型翻成中文并以顿号连接，供文案拼接。
func DeviceTypeLabels(values []string) string {
	labels := make([]string, 0, len(values))
	for _, v := range values {
		labels = append(labels, DeviceTypeLabel(v))
	}
	return strings.Join(labels, "、")
}

// TemplateDeviceTypes 解码模板声明的设备类型，兼容库里的三种历史形态：
//   - 推荐：["switch"]
//   - 内置模板早期：{"vendors":[...],"device_types":[...]}
//   - 单个字符串："switch"
//
// 结果已归一（小写去空白）、去重、丢弃空串；解码失败返回空切片。
func TemplateDeviceTypes(raw datatypes.JSON) []string {
	var decoded []string
	if len(raw) > 0 {
		var list []string
		var wrapped DeviceTypesConfig
		var single string
		switch {
		case json.Unmarshal(raw, &list) == nil:
			decoded = list
		case json.Unmarshal(raw, &wrapped) == nil:
			decoded = wrapped.DeviceTypes
		case json.Unmarshal(raw, &single) == nil:
			decoded = []string{single}
		}
	}

	out := make([]string, 0, len(decoded))
	seen := make(map[string]bool, len(decoded))
	for _, v := range decoded {
		normalized := NormalizeDeviceType(v)
		if normalized == "" || seen[normalized] {
			continue
		}
		seen[normalized] = true
		out = append(out, normalized)
	}
	return out
}

// DeviceTypeAllowed 是「模板能否巡检该设备」的全系统唯一口径：
// 模板声明了设备类型时，设备类型必须命中其一；未声明（仅存量数据）不限制。
// 策略保存、任务创建与执行入口三处都经由它判定，执行入口是最后一道兜底。
func DeviceTypeAllowed(templateTypes []string, deviceType string) bool {
	if len(templateTypes) == 0 {
		return true
	}
	normalized := NormalizeDeviceType(deviceType)
	if normalized == "" {
		return false
	}
	for _, dt := range templateTypes {
		if NormalizeDeviceType(dt) == normalized {
			return true
		}
	}
	return false
}
