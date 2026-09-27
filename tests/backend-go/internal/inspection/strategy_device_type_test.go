package inspection_test

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/inspection"
)

const templateByIDQuery = `SELECT \* FROM "inspection_templates" WHERE id = \$1 LIMIT \$2`

func expectTemplateRow(mock sqlmock.Sqlmock, id int, name string, deviceTypes string) {
	mock.ExpectQuery(templateByIDQuery).
		WithArgs(id, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "device_types", "check_items", "is_default", "is_active"}).
			AddRow(id, name, []byte(deviceTypes), []byte(`[]`), true, true))
}

type deviceRow struct {
	id         int
	name       string
	deviceType string
}

func expectDeviceRows(mock sqlmock.Sqlmock, rows ...deviceRow) {
	result := sqlmock.NewRows([]string{"id", "name", "device_type"})
	for _, r := range rows {
		result.AddRow(r.id, r.name, r.deviceType)
	}
	mock.ExpectQuery(`SELECT id, name, device_type FROM "devices" WHERE id IN \(.+\)`).WillReturnRows(result)
}

func requireDevicesValidationError(t *testing.T, err error) *inspection.ValidationError {
	t.Helper()
	var ve *inspection.ValidationError
	if !errors.As(err, &ve) {
		t.Fatalf("want *ValidationError, got %T (%v)", err, err)
	}
	if ve.Field != "devices" {
		t.Fatalf("field = %q, want devices", ve.Field)
	}
	return ve
}

func TestValidateTemplateDeviceTypes_AllDevicesMatch(t *testing.T) {
	db, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()
	svc := inspection.NewService(db, zap.NewNop())

	expectTemplateRow(mock, 5, "交换机巡检", `["switch"]`)
	expectDeviceRows(mock, deviceRow{1, "接入交换机-01", "switch"}, deviceRow{2, "接入交换机-02", "Switch"})

	if err := svc.ValidateTemplateDeviceTypes(context.Background(), 5, []int{1, 2}); err != nil {
		t.Fatalf("want nil, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
}

// 报错要点名是哪几台设备、各自是什么类型，否则用户在几十台设备里无从下手。
func TestValidateTemplateDeviceTypes_RejectsMismatchedDevicesByName(t *testing.T) {
	db, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()
	svc := inspection.NewService(db, zap.NewNop())

	expectTemplateRow(mock, 5, "交换机巡检", `["switch"]`)
	expectDeviceRows(mock,
		deviceRow{1, "接入交换机-01", "switch"},
		deviceRow{2, "核心路由器", "router"},
		deviceRow{3, "AP-01", "wireless_ap"},
	)

	err := svc.ValidateTemplateDeviceTypes(context.Background(), 5, []int{1, 2, 3})
	ve := requireDevicesValidationError(t, err)
	for _, want := range []string{"交换机巡检", "核心路由器（路由器）", "AP-01（无线AP）"} {
		if !strings.Contains(ve.Message, want) {
			t.Errorf("报错 %q 缺少 %q", ve.Message, want)
		}
	}
	if strings.Contains(ve.Message, "接入交换机-01") {
		t.Errorf("匹配的设备不应出现在报错里: %q", ve.Message)
	}
}

// 设备很多时只点名前 5 台，其余汇总计数，避免报错刷屏。
func TestValidateTemplateDeviceTypes_TruncatesLongMismatchList(t *testing.T) {
	db, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()
	svc := inspection.NewService(db, zap.NewNop())

	expectTemplateRow(mock, 5, "服务器巡检", `["server"]`)
	rows := make([]deviceRow, 0, 7)
	ids := make([]int, 0, 7)
	for i := 1; i <= 7; i++ {
		rows = append(rows, deviceRow{i, "交换机-" + string(rune('A'+i-1)), "switch"})
		ids = append(ids, i)
	}
	expectDeviceRows(mock, rows...)

	ve := requireDevicesValidationError(t, svc.ValidateTemplateDeviceTypes(context.Background(), 5, ids))
	if !strings.Contains(ve.Message, "等 7 台") {
		t.Errorf("报错应汇总总数「等 7 台」，实际 %q", ve.Message)
	}
	if strings.Contains(ve.Message, "交换机-F") {
		t.Errorf("只应点名前 5 台，实际 %q", ve.Message)
	}
}

// 存量模板没有声明设备类型时不限制——升级不能让既有自建模板的策略停摆。
// 此时无需查设备表。
func TestValidateTemplateDeviceTypes_LegacyTemplateWithoutTypesIsUnrestricted(t *testing.T) {
	db, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()
	svc := inspection.NewService(db, zap.NewNop())

	expectTemplateRow(mock, 9, "旧自建模板", `[]`)

	if err := svc.ValidateTemplateDeviceTypes(context.Background(), 9, []int{1, 2}); err != nil {
		t.Fatalf("want nil, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
}

// 策略保存时就拦截：类型不符的策略一旦保存，定时触发时每台不符的设备都会以失败告终。
func TestCreateStrategy_RejectsDevicesNotMatchingTemplateType(t *testing.T) {
	db, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()
	svc := inspection.NewService(db, zap.NewNop())

	expectTemplateRow(mock, 5, "交换机巡检", `["switch"]`) // ValidateStrategyTemplatesExist
	expectTemplateRow(mock, 5, "交换机巡检", `["switch"]`) // ValidateTemplateDeviceTypes
	expectDeviceRows(mock, deviceRow{2, "核心路由器", "router"})

	_, err := svc.CreateStrategy(context.Background(), inspection.StrategyPayload{
		Name: "每日巡检", Type: inspection.StrategyManual, Devices: []int{2}, Templates: []int{5}, Enabled: true,
	})
	requireDevicesValidationError(t, err)
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("不应写库，sqlmock: %v", err)
	}
}
