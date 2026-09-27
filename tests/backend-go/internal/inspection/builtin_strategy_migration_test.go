package inspection_test

import (
	"encoding/json"
	"reflect"
	"testing"
	_ "unsafe"

	"gorm.io/gorm"

	_ "github.com/your-org/inspect-system/backend-go/internal/inspection"
)

// planStrategyMigrationJSON 以 JSON 契约暴露迁移规划纯函数（规划结构体未导出）。
//
//go:linkname planStrategyMigrationJSON github.com/your-org/inspect-system/backend-go/internal/inspection.planStrategyMigrationJSON
func planStrategyMigrationJSON(deviceIDs []int, typeOf map[int]string, templateIDByType map[string]int) []byte

type migrationGroupContract struct {
	DeviceType string `json:"device_type"`
	TemplateID int    `json:"template_id"`
	DeviceIDs  []int  `json:"device_ids"`
	NameSuffix string `json:"name_suffix"`
}

type migrationPlanContract struct {
	Groups  []migrationGroupContract `json:"groups"`
	Dropped []int                    `json:"dropped"`
}

var newTemplateIDs = map[string]int{"switch": 11, "router": 12, "firewall": 13, "server": 14}

func planMigration(t *testing.T, deviceIDs []int, typeOf map[int]string) migrationPlanContract {
	t.Helper()
	var plan migrationPlanContract
	if err := json.Unmarshal(planStrategyMigrationJSON(deviceIDs, typeOf, newTemplateIDs), &plan); err != nil {
		t.Fatalf("迁移规划 JSON 解码失败: %v", err)
	}
	return plan
}

// 设备类型单一的策略直接改绑到对应类型的模板，名称不变。
func TestPlanStrategyMigration_SingleTypeRebindsInPlace(t *testing.T) {
	plan := planMigration(t, []int{1, 2}, map[int]string{1: "switch", 2: "Switch"})

	want := []migrationGroupContract{{DeviceType: "switch", TemplateID: 11, DeviceIDs: []int{1, 2}, NameSuffix: ""}}
	if !reflect.DeepEqual(plan.Groups, want) {
		t.Fatalf("groups = %+v, want %+v", plan.Groups, want)
	}
	if len(plan.Dropped) != 0 {
		t.Fatalf("dropped = %v, want 空", plan.Dropped)
	}
}

// 混合类型的策略按类型拆分：顺序固定为交换机、路由器、防火墙、服务器，
// 每组名称追加类型后缀，巡检覆盖一台不丢。
func TestPlanStrategyMigration_MixedTypesSplitInFixedOrder(t *testing.T) {
	plan := planMigration(t, []int{1, 2, 3, 4}, map[int]string{1: "router", 2: "switch", 3: "server", 4: "switch"})

	want := []migrationGroupContract{
		{DeviceType: "switch", TemplateID: 11, DeviceIDs: []int{2, 4}, NameSuffix: "（交换机）"},
		{DeviceType: "router", TemplateID: 12, DeviceIDs: []int{1}, NameSuffix: "（路由器）"},
		{DeviceType: "server", TemplateID: 14, DeviceIDs: []int{3}, NameSuffix: "（服务器）"},
	}
	if !reflect.DeepEqual(plan.Groups, want) {
		t.Fatalf("groups = %+v, want %+v", plan.Groups, want)
	}
}

// 无线 AP、未分类与已删除的设备没有可用模板，从策略里移除。
func TestPlanStrategyMigration_DropsDevicesWithoutInspectableType(t *testing.T) {
	plan := planMigration(t, []int{1, 2, 3, 4}, map[int]string{1: "switch", 2: "wireless_ap", 4: ""})

	if len(plan.Groups) != 1 || !reflect.DeepEqual(plan.Groups[0].DeviceIDs, []int{1}) {
		t.Fatalf("groups = %+v, want 仅交换机 [1]", plan.Groups)
	}
	if plan.Groups[0].NameSuffix != "" {
		t.Fatalf("只剩一组时不应改名，suffix = %q", plan.Groups[0].NameSuffix)
	}
	if !reflect.DeepEqual(plan.Dropped, []int{2, 3, 4}) {
		t.Fatalf("dropped = %v, want [2 3 4]", plan.Dropped)
	}
}

// 没有任何可巡检设备时不产生分组，由调用方停用该策略。
func TestPlanStrategyMigration_NoInspectableDevices(t *testing.T) {
	plan := planMigration(t, []int{7}, map[int]string{7: "ap"})

	if len(plan.Groups) != 0 {
		t.Fatalf("groups = %+v, want 空", plan.Groups)
	}
	if !reflect.DeepEqual(plan.Dropped, []int{7}) {
		t.Fatalf("dropped = %v, want [7]", plan.Dropped)
	}
}

// loadDeviceTypes 是内置模板迁移改绑用的设备类型查询。
//
//go:linkname loadDeviceTypes github.com/your-org/inspect-system/backend-go/internal/inspection.loadDeviceTypes
func loadDeviceTypes(tx *gorm.DB, deviceIDs []int) (map[int]string, error)

// 迁移改绑与创建前的类型校验共用同一条设备类型查询；查不到的设备（已删除）不在结果里，
// 交给规划阶段记为丢弃。没有设备时不查库。
func TestLoadDeviceTypes_SharesValidationQuery(t *testing.T) {
	db, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()
	expectDeviceRows(mock, deviceRow{1, "接入交换机-01", "switch"}, deviceRow{3, "出口路由器", "router"})

	typeOf, err := loadDeviceTypes(db, []int{1, 2, 3})
	if err != nil {
		t.Fatalf("loadDeviceTypes: %v", err)
	}
	if want := map[int]string{1: "switch", 3: "router"}; !reflect.DeepEqual(typeOf, want) {
		t.Fatalf("typeOf = %v, want %v", typeOf, want)
	}

	empty, err := loadDeviceTypes(db, nil)
	if err != nil || len(empty) != 0 {
		t.Fatalf("空设备列表: typeOf = %v, err = %v", empty, err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
}
