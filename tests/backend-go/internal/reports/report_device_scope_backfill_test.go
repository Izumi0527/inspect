package reports_test

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/reports"
)

// 执行历史导出的巡检报告曾只落库 inspection_ids（更早为 task_id），没有 device_ids，
// 报表列表「参数范围」因此恒显示「0 个设备」。回填沿用报告数据源的范围口径
// （inspection_ids 优先、task_id 兜底）从巡检行推导 device_ids，且只补缺失的行。
// sqlmock 只做文本匹配、不执行方言 SQL：改动这条 SQL 后须在真库事务内实跑验证（含重跑幂等）。
func TestBackfillInspectionReportDeviceIDs_ShouldDeriveDevicesFromInspectionScope(t *testing.T) {
	db, mock, cleanup := newReportsGormDBWithSQLMock(t)
	defer cleanup()

	svc := reports.NewService(db, zap.NewNop())

	backfillRegex := `WITH report_scope AS[\s\S]*` +
		`WHEN jsonb_typeof\(r\.device_filters -> 'inspection_ids'\) = 'array'[\s\S]*` +
		`WHEN jsonb_typeof\(r\.device_filters -> 'task_id'\) = 'number'[\s\S]*` +
		`WHERE r\.report_type = 'inspection'[\s\S]*` +
		`AND jsonb_typeof\(r\.device_filters -> 'device_ids'\) IS DISTINCT FROM 'array'[\s\S]*` +
		`JOIN inspections i ON i\.id = scoped\.inspection_id::bigint[\s\S]*` +
		`UPDATE reports r[\s\S]*` +
		`SET device_filters = r\.device_filters \|\| jsonb_build_object\('device_ids', d\.device_ids\)`

	mock.ExpectExec(backfillRegex).WillReturnResult(sqlmock.NewResult(0, 17))

	n, err := svc.BackfillInspectionReportDeviceIDs(context.Background())
	if err != nil {
		t.Fatalf("BackfillInspectionReportDeviceIDs: %v", err)
	}
	if n != 17 {
		t.Fatalf("backfilled rows = %d, want 17", n)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations: %v", err)
	}
}
