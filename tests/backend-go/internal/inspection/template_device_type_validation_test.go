package inspection_test

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"go.uber.org/zap"
	"gorm.io/datatypes"

	"github.com/your-org/inspect-system/backend-go/internal/inspection"
)

func templateWithDeviceTypes(raw string) *inspection.Template {
	return &inspection.Template{
		Name:        "自定义模板",
		DeviceTypes: datatypes.JSON(raw),
		CheckItems:  datatypes.JSON(`[{"id":"ping","name":"设备连通性","type":"ping","config":{},"enabled":true}]`),
	}
}

// 每个模板只能适用一种可巡检设备类型——这是「交换机模板只巡检交换机」的前提：
// 允许多选或空选，执行入口就无从判断该用哪套检查项去巡检哪类设备。
func TestValidateTemplate_RequiresExactlyOneInspectableDeviceType(t *testing.T) {
	v := inspection.NewTemplateValidator(nil)

	cases := []struct {
		name    string
		raw     string
		wantErr string
	}{
		{"单一交换机", `["switch"]`, ""},
		{"单一服务器（对象形态）", `{"device_types":["server"]}`, ""},
		{"大小写不敏感", `["Router"]`, ""},
		{"未选择", `[]`, "请为模板选择适用的设备类型"},
		{"未提供字段", ``, "请为模板选择适用的设备类型"},
		{"多选", `["switch","router"]`, "每个模板只能适用一种设备类型"},
		{"不可巡检的无线 AP", `["wireless_ap"]`, "暂无巡检能力"},
		{"自定义类型", `["storage"]`, "暂无巡检能力"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := v.ValidateTemplate(context.Background(), templateWithDeviceTypes(tc.raw))
			if tc.wantErr == "" {
				if err != nil {
					t.Fatalf("want nil, got %v", err)
				}
				return
			}
			var ve *inspection.ValidationError
			if !errors.As(err, &ve) {
				t.Fatalf("want *ValidationError, got %T (%v)", err, err)
			}
			if ve.Field != "device_types" || !strings.Contains(ve.Message, tc.wantErr) {
				t.Fatalf("got field=%q message=%q, want field=device_types message contains %q", ve.Field, ve.Message, tc.wantErr)
			}
		})
	}
}

// 报错信息要把可选值说全，用户不必去翻文档。
func TestValidateTemplate_DeviceTypeErrorListsChoicesInChinese(t *testing.T) {
	v := inspection.NewTemplateValidator(nil)
	err := v.ValidateTemplate(context.Background(), templateWithDeviceTypes(`["wireless_ap"]`))
	var ve *inspection.ValidationError
	if !errors.As(err, &ve) {
		t.Fatalf("want *ValidationError, got %v", err)
	}
	for _, label := range []string{"无线AP", "交换机", "路由器", "防火墙", "服务器"} {
		if !strings.Contains(ve.Message, label) {
			t.Errorf("报错 %q 缺少 %q", ve.Message, label)
		}
	}
}

func TestValidateCheckItem_AcceptsDiskUsageMetric(t *testing.T) {
	v := inspection.NewTemplateValidator(nil)
	item := &inspection.CheckItem{
		ID: "disk", Name: "磁盘使用率", Type: "snmp", Metric: "disk_usage",
		Config: map[string]interface{}{"threshold": map[string]interface{}{"warning": 80.0, "critical": 90.0}},
	}
	if err := v.ValidateCheckItem(item); err != nil {
		t.Fatalf("disk_usage 应为合法 metric，got %v", err)
	}
}

// 内置模板只由后端启动同步写入。接口若信任客户端传来的 is_default，任何有创建权限
// 的用户都能伪造「内置模板」：它从此不可编辑删除，并会在下次重启时被同步清理误删。
func TestServiceCreate_ForcesIsDefaultFalse(t *testing.T) {
	db, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()
	svc := inspection.NewService(db, zap.NewNop())

	// 列顺序同 Template 结构体：name, description, category, device_types, check_items,
	// is_default, is_active, created_at, updated_at
	mock.ExpectQuery(`INSERT INTO "inspection_templates" .*RETURNING "id"`).
		WithArgs("自定义模板", nil, nil, sqlmock.AnyArg(), sqlmock.AnyArg(), false, true, AnyTimeArg{}, AnyTimeArg{}).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(1))

	tpl := templateWithDeviceTypes(`["switch"]`)
	tpl.IsDefault = true
	tpl.IsActive = true
	if err := svc.Create(context.Background(), tpl); err != nil {
		t.Fatalf("Create: %v", err)
	}
	if tpl.IsDefault {
		t.Fatalf("Create 后 IsDefault 应被强制为 false")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
}

// 更新同理：is_default 不随请求改写（UPDATE 语句里不出现该列）。
func TestServiceUpdate_NeverWritesIsDefault(t *testing.T) {
	db, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()
	svc := inspection.NewService(db, zap.NewNop())

	mock.ExpectQuery(`SELECT \* FROM "inspection_templates" WHERE id = \$1`).
		WithArgs(7, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "is_default", "is_active"}).AddRow(7, "旧名称", false, true))
	// GORM 按列名字典序生成 SET 子句；is_default 若被写入会出现在 device_types 与 is_active 之间。
	mock.ExpectExec(`UPDATE "inspection_templates" SET "category"=\$1,"check_items"=\$2,"description"=\$3,"device_types"=\$4,"is_active"=\$5,"name"=\$6,"updated_at"=\$7 WHERE id = \$8`).
		WillReturnResult(sqlmock.NewResult(0, 1))

	tpl := templateWithDeviceTypes(`["router"]`)
	tpl.IsDefault = true
	tpl.IsActive = true
	if err := svc.Update(context.Background(), 7, tpl); err != nil {
		t.Fatalf("Update: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
}

// 导入失败要说清原因：旧版导出的多类型模板在新规则下会被拒，只回一句
// 「导入数据验证失败」用户无从修正。导出文件的键名即 Template 结构体字段名。
func TestServiceImport_ReportsValidationReason(t *testing.T) {
	db, _, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()
	svc := inspection.NewService(db, zap.NewNop())

	data := []byte(`{"Name":"旧版全面巡检（副本）","DeviceTypes":["switch","router"],` +
		`"CheckItems":[{"id":"ping","name":"设备连通性","type":"ping","config":{},"enabled":true}]}`)
	_, err := svc.Import(context.Background(), data, false)

	var ve *inspection.ValidationError
	if !errors.As(err, &ve) {
		t.Fatalf("want *ValidationError, got %T (%v)", err, err)
	}
	if !strings.Contains(ve.Message, "每个模板只能适用一种设备类型") {
		t.Fatalf("导入报错应带出具体原因，got %q", ve.Message)
	}
}
