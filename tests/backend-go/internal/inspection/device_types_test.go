package inspection_test

import (
	"reflect"
	"testing"

	"gorm.io/datatypes"

	"github.com/your-org/inspect-system/backend-go/internal/inspection"
)

// 模板的 device_types 在库里有三种历史形态：推荐的数组、内置模板早期的
// {"vendors":[...],"device_types":[...]} 对象、以及单个字符串。
// 匹配规则只认解码后的切片，三种形态必须解出同一结果。
func TestTemplateDeviceTypes_DecodesAllStoredShapes(t *testing.T) {
	cases := []struct {
		name string
		raw  string
		want []string
	}{
		{"数组形态", `["switch"]`, []string{"switch"}},
		{"对象形态", `{"vendors":["Huawei"],"device_types":["router","switch"]}`, []string{"router", "switch"}},
		{"单字符串形态", `"firewall"`, []string{"firewall"}},
		{"大小写与空白归一", `[" Switch ","SERVER"]`, []string{"switch", "server"}},
		{"去重且丢弃空串", `["switch","","switch"]`, []string{"switch"}},
		{"空数组", `[]`, []string{}},
		{"null", `null`, []string{}},
		{"空内容", ``, []string{}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := inspection.TemplateDeviceTypes(datatypes.JSON(tc.raw))
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("TemplateDeviceTypes(%s) = %#v, want %#v", tc.raw, got, tc.want)
			}
		})
	}
}

// 匹配规则是全系统唯一口径：策略保存、任务创建与执行入口都调它。
// 模板声明了类型就必须命中；没声明（仅存量数据）不限制。
func TestDeviceTypeAllowed(t *testing.T) {
	cases := []struct {
		name          string
		templateTypes []string
		deviceType    string
		want          bool
	}{
		{"类型一致", []string{"switch"}, "switch", true},
		{"大小写与空白不敏感", []string{"switch"}, " SWITCH ", true},
		{"类型不一致", []string{"switch"}, "router", false},
		{"存量多类型模板命中其一", []string{"switch", "router"}, "router", true},
		{"模板未声明类型不限制", []string{}, "router", true},
		{"设备类型为空不匹配", []string{"switch"}, "", false},
		{"无线 AP 不匹配四类模板", []string{"switch", "router", "firewall", "server"}, "wireless_ap", false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := inspection.DeviceTypeAllowed(tc.templateTypes, tc.deviceType); got != tc.want {
				t.Fatalf("DeviceTypeAllowed(%v, %q) = %v, want %v", tc.templateTypes, tc.deviceType, got, tc.want)
			}
		})
	}
}

func TestIsInspectableDeviceType(t *testing.T) {
	for _, dt := range []string{"switch", "router", "firewall", "server", " Server "} {
		if !inspection.IsInspectableDeviceType(dt) {
			t.Errorf("%q 应为可巡检类型", dt)
		}
	}
	for _, dt := range []string{"", "ap", "wireless_ap", "storage", "unknown"} {
		if inspection.IsInspectableDeviceType(dt) {
			t.Errorf("%q 不应为可巡检类型", dt)
		}
	}
	want := []string{"switch", "router", "firewall", "server"}
	if !reflect.DeepEqual(inspection.InspectableDeviceTypes, want) {
		t.Fatalf("InspectableDeviceTypes = %v, want %v（顺序即界面与迁移拆分顺序）", inspection.InspectableDeviceTypes, want)
	}
}

// 标签用于执行结果、校验报错等直接面向用户的文案，必须是中文。
func TestDeviceTypeLabel(t *testing.T) {
	cases := map[string]string{
		"switch":      "交换机",
		"router":      "路由器",
		"firewall":    "防火墙",
		"server":      "服务器",
		" Router ":    "路由器",
		"ap":          "无线AP",
		"wireless_ap": "无线AP",
		"":            "未分类",
		"   ":         "未分类",
		"storage":     "storage", // 未识别的取值原样返回，不瞎翻
	}
	for input, want := range cases {
		if got := inspection.DeviceTypeLabel(input); got != want {
			t.Errorf("DeviceTypeLabel(%q) = %q, want %q", input, got, want)
		}
	}
}
