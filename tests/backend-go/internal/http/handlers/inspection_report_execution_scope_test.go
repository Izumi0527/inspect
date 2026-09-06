package handlers_test

import (
	"context"
	"errors"
	"testing"
	"time"
	_ "unsafe"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/inspection"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// resolveReportInspectionIDs 是报告生成载荷解析的未导出方法，经 go:linkname 桥接做白盒测试
//（沿用本仓库约定，接收者作为第一个参数传入）。
//
//go:linkname resolveReportInspectionIDs github.com/your-org/inspect-system/backend-go/internal/http/handlers.InspectionHandler.resolveReportInspectionIDs
func resolveReportInspectionIDs(h handlers.InspectionHandler, ctx context.Context, payload map[string]interface{}) ([]int, error)

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
