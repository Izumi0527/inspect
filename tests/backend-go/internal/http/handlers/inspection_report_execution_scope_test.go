package handlers_test

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"testing"
	"time"
	_ "unsafe"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/inspection"
	"go.uber.org/zap"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// resolveReportInspectionRows 是报告生成载荷解析的未导出方法，经 go:linkname 桥接做白盒测试
// （沿用本仓库约定，接收者作为第一个参数传入）。
//
//go:linkname resolveReportInspectionRows github.com/your-org/inspect-system/backend-go/internal/http/handlers.InspectionHandler.resolveReportInspectionRows
func resolveReportInspectionRows(h handlers.InspectionHandler, ctx context.Context, payload map[string]interface{}) ([]inspection.Inspection, error)

// resolveReportInspectionIDs 把整批行压成 id 列表，既有用例只关心行 id 与顺序。
func resolveReportInspectionIDs(h handlers.InspectionHandler, ctx context.Context, payload map[string]interface{}) ([]int, error) {
	rows, err := resolveReportInspectionRows(h, ctx, payload)
	if err != nil {
		return nil, err
	}
	if rows == nil {
		return nil, nil
	}
	ids := make([]int, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.ID)
	}
	return ids, nil
}

// 评审 H2 口径：报告导出按「整批」取行。
// 前端原先把批次 UUID 传给 task_id，parseInt 失败后端落回 24h 时间窗，导出报告与所选批次完全无关；
// 回填后历史批次的执行 id 也是 legacy-<id> 非数字。execution_id（批次 UUID 或代表行数字 id）
// 必须经 resolveExecutionBatchRows 展开成整批行 id，供报告数据源按 i.id IN ? 精确取行。

func newReportScopeHandler(t *testing.T) (handlers.InspectionHandler, sqlmock.Sqlmock, func()) {
	t.Helper()
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	svc := inspection.NewService(gormDB, zap.NewNop())
	h := handlers.InspectionHandler{
		Service: svc,
		Logger:  zap.NewNop(),
	}
	return h, mock, cleanup
}

func TestResolveReportInspectionIDs_ExecutionIDExpandsToWholeBatch(t *testing.T) {
	h, mock, cleanup := newReportScopeHandler(t)
	defer cleanup()

	startTime := time.Date(2026, 6, 30, 9, 0, 0, 0, time.UTC)
	mock.ExpectQuery(`SELECT \* FROM "inspections" WHERE batch_id = \$1 ORDER BY id ASC`).
		WithArgs("batch-a").
		WillReturnRows(sqlmock.NewRows(batchedInspectionColumns()).
			AddRow(1, 101, nil, 9, "核心巡检策略 手动触发", inspection.TriggerManual, inspection.StatusCompleted,
				nil, startTime, startTime.Add(time.Minute), 60, 10, 10, 0, 0, 0, nil, []byte(`{}`),
				nil, nil, nil, "tester", startTime, startTime, "batch-a").
			AddRow(2, 102, nil, 9, "核心巡检策略 手动触发", inspection.TriggerManual, inspection.StatusFailed,
				nil, startTime, startTime.Add(2*time.Minute), 120, 10, 8, 2, 0, 0, nil, []byte(`{}`),
				nil, nil, nil, "tester", startTime, startTime, "batch-a"))

	ids, err := resolveReportInspectionIDs(h, context.Background(), map[string]interface{}{
		"execution_id": "batch-a",
	})
	if err != nil {
		t.Fatalf("resolveReportInspectionIDs: %v", err)
	}
	if len(ids) != 2 || ids[0] != 1 || ids[1] != 2 {
		t.Fatalf("ids = %v, want [1 2]（整批行 id，而非单行）", ids)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestResolveReportInspectionIDs_NumericTaskIDExpandsToWholeBatch(t *testing.T) {
	h, mock, cleanup := newReportScopeHandler(t)
	defer cleanup()

	startTime := time.Date(2026, 6, 30, 9, 0, 0, 0, time.UTC)
	// task_id 为批内成员 id：先按 id 查记录拿到 batch_id（GORM Take 会附加 LIMIT 参数），再展开整批
	mock.ExpectQuery(`SELECT \* FROM "inspections" WHERE id = \$1.*LIMIT`).
		WithArgs(5, sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows(batchedInspectionColumns()).
			AddRow(5, 105, nil, 9, "核心巡检策略 手动触发", inspection.TriggerManual, inspection.StatusCompleted,
				nil, startTime, startTime.Add(time.Minute), 60, 10, 10, 0, 0, 0, nil, []byte(`{}`),
				nil, nil, nil, "tester", startTime, startTime, "batch-c"))
	mock.ExpectQuery(`SELECT \* FROM "inspections" WHERE batch_id = \$1 ORDER BY id ASC`).
		WithArgs("batch-c").
		WillReturnRows(sqlmock.NewRows(batchedInspectionColumns()).
			AddRow(5, 105, nil, 9, "核心巡检策略 手动触发", inspection.TriggerManual, inspection.StatusCompleted,
				nil, startTime, startTime.Add(time.Minute), 60, 10, 10, 0, 0, 0, nil, []byte(`{}`),
				nil, nil, nil, "tester", startTime, startTime, "batch-c").
			AddRow(6, 106, nil, 9, "核心巡检策略 手动触发", inspection.TriggerManual, inspection.StatusCompleted,
				nil, startTime, startTime.Add(time.Minute), 60, 10, 10, 0, 0, 0, nil, []byte(`{}`),
				nil, nil, nil, "tester", startTime, startTime, "batch-c"))

	ids, err := resolveReportInspectionIDs(h, context.Background(), map[string]interface{}{
		"task_id": 5,
	})
	if err != nil {
		t.Fatalf("resolveReportInspectionIDs: %v", err)
	}
	if len(ids) != 2 || ids[0] != 5 || ids[1] != 6 {
		t.Fatalf("ids = %v, want [5 6]（数字成员 id 同样展开为整批）", ids)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestResolveReportInspectionIDs_NoExecutionFieldsReturnsNil(t *testing.T) {
	h, mock, cleanup := newReportScopeHandler(t)
	defer cleanup()

	ids, err := resolveReportInspectionIDs(h, context.Background(), map[string]interface{}{
		"device_ids": []interface{}{1, 2},
	})
	if err != nil {
		t.Fatalf("resolveReportInspectionIDs: %v", err)
	}
	if ids != nil {
		t.Fatalf("ids = %v, want nil（未指定执行标识时保持汇总口径，不做批次展开）", ids)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

// encodeInspectionReportParams 返回落库到 reports.device_filters 的报告参数 JSON，经 go:linkname 桥接。
// 参数结构体未导出，按仓库约定改测其落库 JSON 契约——报告数据源与报表列表「参数范围」读的就是它。
//
//go:linkname encodeInspectionReportParams github.com/your-org/inspect-system/backend-go/internal/http/handlers.encodeInspectionReportParams
func encodeInspectionReportParams(start, end time.Time, batchRows []inspection.Inspection, taskID *int, deviceIDs []int) (datatypes.JSON, error)

// persistedReportParams 报告参数的落库 JSON 契约（报告数据源与报表列表按这些键读取）。
type persistedReportParams struct {
	DateRange struct {
		StartDate string `json:"startDate"`
		EndDate   string `json:"endDate"`
	} `json:"dateRange"`
	InspectionIDs []int `json:"inspection_ids"`
	TaskID        *int  `json:"task_id"`
	DeviceIDs     []int `json:"device_ids"`
}

var reportParamsStart = time.Date(2026, 9, 6, 13, 0, 0, 0, time.UTC)

func persistReportParams(t *testing.T, batchRows []inspection.Inspection, taskID *int, deviceIDs []int) persistedReportParams {
	t.Helper()
	raw, err := encodeInspectionReportParams(reportParamsStart, reportParamsStart.Add(24*time.Hour), batchRows, taskID, deviceIDs)
	if err != nil {
		t.Fatalf("encodeInspectionReportParams: %v", err)
	}
	var params persistedReportParams
	if err := json.Unmarshal(raw, &params); err != nil {
		t.Fatalf("unmarshal %s: %v", raw, err)
	}
	return params
}

// 报表列表「参数范围」按落库参数的 device_ids 展示设备数。执行历史导出只传 execution_id，
// 整批报告覆盖的设备（批内各行的设备）必须一并落库，否则列表恒显示「0 个设备」。
func TestInspectionReportParams_BatchExportRecordsBatchDevices(t *testing.T) {
	rows := []inspection.Inspection{
		{ID: 41, DeviceID: 6},
		{ID: 42, DeviceID: 7},
		{ID: 43, DeviceID: 6},
	}

	params := persistReportParams(t, rows, nil, nil)

	if !reflect.DeepEqual(params.DeviceIDs, []int{6, 7}) {
		t.Fatalf("device_ids = %#v, want []int{6, 7}（批内设备去重、保持批内顺序）", params.DeviceIDs)
	}
	if !reflect.DeepEqual(params.InspectionIDs, []int{41, 42, 43}) {
		t.Fatalf("inspection_ids = %#v, want []int{41, 42, 43}", params.InspectionIDs)
	}
}

// 批次模式下数据源只按 inspection_ids 取行、不按设备过滤，报告实际覆盖整批设备；
// 落库的 device_ids 必须描述这一真实范围，而不是调用方附带的、并未生效的设备列表。
func TestInspectionReportParams_BatchScopeOverridesRequestedDevices(t *testing.T) {
	rows := []inspection.Inspection{{ID: 41, DeviceID: 6}, {ID: 42, DeviceID: 7}}

	params := persistReportParams(t, rows, nil, []int{9})

	if !reflect.DeepEqual(params.DeviceIDs, []int{6, 7}) {
		t.Fatalf("device_ids = %#v, want []int{6, 7}（以批次实际覆盖的设备为准）", params.DeviceIDs)
	}
}

// 未指定执行批次的汇总口径：调用方指定的设备就是数据源的过滤条件，原样落库。
func TestInspectionReportParams_SummaryModeKeepsRequestedDevices(t *testing.T) {
	params := persistReportParams(t, nil, nil, []int{9})

	if !reflect.DeepEqual(params.DeviceIDs, []int{9}) {
		t.Fatalf("device_ids = %#v, want []int{9}", params.DeviceIDs)
	}
	if params.InspectionIDs != nil {
		t.Fatalf("汇总口径不应写 inspection_ids，got %#v", params.InspectionIDs)
	}
}

// 时间窗与 task_id 的键名必须与报告数据源的读取口径一致，键名漂移会让报告静默退回默认时间窗。
func TestInspectionReportParams_PersistsDateRangeAndTaskID(t *testing.T) {
	taskID := 41

	params := persistReportParams(t, nil, &taskID, nil)

	if params.DateRange.StartDate != "2026-09-06T13:00:00Z" || params.DateRange.EndDate != "2026-09-07T13:00:00Z" {
		t.Fatalf("dateRange = %+v, want 2026-09-06T13:00:00Z ~ 2026-09-07T13:00:00Z", params.DateRange)
	}
	if params.TaskID == nil || *params.TaskID != 41 {
		t.Fatalf("task_id = %v, want 41", params.TaskID)
	}
}

func TestResolveReportInspectionIDs_UnknownExecutionIDIsNotFound(t *testing.T) {
	h, mock, cleanup := newReportScopeHandler(t)
	defer cleanup()

	mock.ExpectQuery(`SELECT \* FROM "inspections" WHERE batch_id = \$1 ORDER BY id ASC`).
		WithArgs("batch-missing").
		WillReturnRows(sqlmock.NewRows(batchedInspectionColumns()))

	_, err := resolveReportInspectionIDs(h, context.Background(), map[string]interface{}{
		"execution_id": "batch-missing",
	})
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("err = %v, want gorm.ErrRecordNotFound（handler 层据此返回 404）", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}
