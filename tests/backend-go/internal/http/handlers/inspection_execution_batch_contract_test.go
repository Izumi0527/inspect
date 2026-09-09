package handlers_test

// 执行历史批次聚合合同测试：
// 一次策略执行（多台设备）在执行历史中应聚合为一条记录，详情包含逐设备结果。

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/inspection"
	"go.uber.org/zap"
)

// inspectionColumns inspections 全列（不含聚合查询追加的 group_key / batch_id）
var inspectionColumns = []string{
	"id", "device_id", "template_id", "schedule_id", "name", "trigger", "status",
	"scheduled_at", "started_at", "completed_at", "duration", "total_checks", "passed_checks",
	"failed_checks", "warning_checks", "skipped_checks", "error_message", "error_details",
	"timeout", "retry_count", "max_retries", "created_by", "created_at", "updated_at",
}

// batchedInspectionColumns 追加 batch_id 列（SELECT * 场景下模拟批次记录）
func batchedInspectionColumns() []string {
	return append(append([]string{}, inspectionColumns...), "batch_id")
}

func TestListExecutions_ShouldAggregateMultiDeviceBatchIntoSingleRow(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"inspections:read"})
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := inspection.NewService(gormDB, zap.NewNop())
	h := handlers.InspectionHandler{
		Service: svc,
		Auth:    authSvc,
		Logger:  zap.NewNop(),
	}

	startTime := time.Date(2026, 6, 30, 9, 0, 0, 0, time.UTC)
	completedAt := startTime.Add(2 * time.Minute)

	// 两个批次：g1 为多设备新批次（2 台设备），g2 为历史单设备记录
	mock.ExpectQuery(`SELECT count\(\*\) FROM \(SELECT CASE WHEN batch_id.*AS group_key FROM "inspections" GROUP BY CASE WHEN batch_id.*\) AS grouped_executions`).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(2))
	mock.ExpectQuery(`SELECT CASE WHEN batch_id.*AS group_key, MIN\(id\) AS min_id.*ORDER BY start_time DESC, min_id DESC`).
		WithArgs(10).
		WillReturnRows(sqlmock.NewRows([]string{"group_key", "min_id", "start_time"}).
			AddRow("g1", 1, startTime).
			AddRow("g2", 3, startTime.Add(-time.Hour)))
	mock.ExpectQuery(`SELECT \*, CASE WHEN batch_id.*AS group_key FROM "inspections" WHERE CASE WHEN batch_id.*IN \(\$1,\$2\)`).
		WithArgs("g1", "g2").
		WillReturnRows(sqlmock.NewRows(append(batchedInspectionColumns(), "group_key")).
			AddRow(1, 101, nil, 9, "核心巡检策略 定时触发", inspection.TriggerScheduled, inspection.StatusCompleted,
				nil, startTime, completedAt, 120, 10, 10, 0, 0, 0, nil, []byte(`{}`),
				nil, nil, nil, nil, startTime, startTime, "batch-a", "g1").
			AddRow(2, 102, nil, 9, "核心巡检策略 定时触发", inspection.TriggerScheduled, inspection.StatusRunning,
				nil, startTime, nil, nil, 10, 5, 0, 0, 0, nil, []byte(`{}`),
				nil, nil, nil, nil, startTime, startTime, "batch-a", "g1").
			AddRow(3, 103, nil, nil, "批量巡检", inspection.TriggerManual, inspection.StatusCompleted,
				nil, startTime.Add(-time.Hour), startTime.Add(-54*time.Minute), 360, 8, 8, 0, 0, 0, nil, []byte(`{}`),
				nil, nil, nil, nil, startTime.Add(-time.Hour), startTime, "", "g2"))
	mock.ExpectQuery(`SELECT id, name FROM "inspection_strategies" WHERE id IN \(\$1\)`).
		WithArgs(9).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name"}).AddRow(9, "核心巡检策略"))

	ctx, rec := newEchoContextWithBody(http.MethodGet, "/api/v1/inspection/executions?page=1&page_size=10", token, nil)
	if err := h.ListExecutions(ctx); err != nil {
		t.Fatalf("ListExecutions: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("http status = %d, body=%s", rec.Code, rec.Body.String())
	}

	var payload struct {
		Data struct {
			Items []struct {
				ID               string `json:"id"`
				StrategyName     string `json:"strategyName"`
				Status           string `json:"status"`
				Progress         int    `json:"progress"`
				TotalDevices     int    `json:"totalDevices"`
				CompletedDevices int    `json:"completedDevices"`
				Summary          struct {
					TotalChecks  int     `json:"totalChecks"`
					PassedChecks int     `json:"passedChecks"`
					Score        float64 `json:"score"`
				} `json:"summary"`
			} `json:"items"`
			Total int `json:"total"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("json.Unmarshal: %v, body=%s", err, rec.Body.String())
	}

	if payload.Data.Total != 2 {
		t.Fatalf("total = %d, want 2（多设备批次应聚合为一条）, body=%s", payload.Data.Total, rec.Body.String())
	}
	if len(payload.Data.Items) != 2 {
		t.Fatalf("items length = %d, want 2, body=%s", len(payload.Data.Items), rec.Body.String())
	}

	first := payload.Data.Items[0]
	if first.ID != "batch-a" {
		t.Fatalf("items[0].id = %q, want batch-a（新批次 id 为 batch_id）", first.ID)
	}
	if first.TotalDevices != 2 {
		t.Fatalf("items[0].totalDevices = %d, want 2", first.TotalDevices)
	}
	if first.CompletedDevices != 1 {
		t.Fatalf("items[0].completedDevices = %d, want 1", first.CompletedDevices)
	}
	if first.Status != inspection.StatusRunning {
		t.Fatalf("items[0].status = %q, want running（批内仍有设备在执行）", first.Status)
	}
	if first.Progress != 75 {
		t.Fatalf("items[0].progress = %d, want 75（15/20 检查项）", first.Progress)
	}
	if first.Summary.TotalChecks != 20 || first.Summary.PassedChecks != 15 {
		t.Fatalf("items[0].summary = %+v, want total=20 passed=15", first.Summary)
	}

	second := payload.Data.Items[1]
	if second.ID != "3" {
		t.Fatalf("items[1].id = %q, want 3（历史批次 id 为批内最小数字 ID）", second.ID)
	}
	if second.TotalDevices != 1 {
		t.Fatalf("items[1].totalDevices = %d, want 1", second.TotalDevices)
	}
	if second.Status != inspection.StatusCompleted {
		t.Fatalf("items[1].status = %q, want completed", second.Status)
	}
	if second.Summary.TotalChecks != 8 || second.Summary.PassedChecks != 8 {
		t.Fatalf("items[1].summary = %+v, want total=8 passed=8", second.Summary)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestGetExecution_ShouldReturnMultiDeviceSummary(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"inspections:read"})
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := inspection.NewService(gormDB, zap.NewNop())
	h := handlers.InspectionHandler{
		Service: svc,
		Auth:    authSvc,
		Logger:  zap.NewNop(),
	}

	startTime := time.Date(2026, 6, 30, 9, 0, 0, 0, time.UTC)
	completedAt := startTime.Add(2 * time.Minute)

	// 批次 UUID 路径：按 batch_id 取批内全部记录
	mock.ExpectQuery(`SELECT \* FROM "inspections" WHERE batch_id = \$1 ORDER BY id ASC`).
		WithArgs("batch-a").
		WillReturnRows(sqlmock.NewRows(batchedInspectionColumns()).
			AddRow(1, 101, nil, 9, "核心巡检策略 手动触发", inspection.TriggerManual, inspection.StatusCompleted,
				nil, startTime, completedAt, 120, 10, 10, 0, 0, 0, nil, []byte(`{}`),
				nil, nil, nil, "tester", startTime, startTime, "batch-a").
			AddRow(2, 102, nil, 9, "核心巡检策略 手动触发", inspection.TriggerManual, inspection.StatusCompleted,
				nil, startTime, completedAt, 130, 10, 4, 4, 2, 0, nil, []byte(`{}`),
				nil, nil, nil, "tester", startTime, startTime, "batch-a"))
	// GetExecution 调用顺序：批内记录 → 策略名 → 巡检结果 → 设备信息
	mock.ExpectQuery(`SELECT id, name FROM "inspection_strategies" WHERE id IN \(\$1\)`).
		WithArgs(9).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name"}).AddRow(9, "核心巡检策略"))
	mock.ExpectQuery(`SELECT \* FROM "inspection_results" WHERE inspection_id IN \(\$1,\$2\).*ORDER BY inspection_id, id`).
		WithArgs(1, 2).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "inspection_id", "check_item_name", "check_item_type", "status",
		}).
			AddRow(11, 1, "CPU检查", "cpu", "pass").
			AddRow(12, 2, "CPU检查", "cpu", "fail"))
	mock.ExpectQuery(`SELECT id, name, device_type, ip_address FROM "devices" WHERE id IN \(\$1,\$2\)`).
		WithArgs(101, 102).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "device_type", "ip_address"}).
			AddRow(101, "核心交换机A", "switch", "10.0.0.1").
			AddRow(102, "核心交换机B", "switch", "10.0.0.2"))

	ctx, rec := newEchoContextWithBody(http.MethodGet, "/api/v1/inspection/executions/batch-a", token, nil)
	ctx.SetParamNames("id")
	ctx.SetParamValues("batch-a")

	if err := h.GetExecution(ctx); err != nil {
		t.Fatalf("GetExecution: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("http status = %d, body=%s", rec.Code, rec.Body.String())
	}

	var payload struct {
		Data struct {
			ID      string `json:"id"`
			Status  string `json:"status"`
			Summary struct {
				TotalChecks   int `json:"totalChecks"`
				PassedChecks  int `json:"passedChecks"`
				FailedChecks  int `json:"failedChecks"`
				DeviceResults []struct {
					DeviceID   string `json:"deviceId"`
					DeviceName string `json:"deviceName"`
					Status     string `json:"status"`
				} `json:"deviceResults"`
			} `json:"summary"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("json.Unmarshal: %v, body=%s", err, rec.Body.String())
	}

	if payload.Data.ID != "batch-a" {
		t.Fatalf("id = %q, want batch-a", payload.Data.ID)
	}
	if payload.Data.Status != inspection.StatusCompleted {
		t.Fatalf("status = %q, want completed", payload.Data.Status)
	}
	summary := payload.Data.Summary
	if summary.TotalChecks != 20 || summary.PassedChecks != 14 || summary.FailedChecks != 4 {
		t.Fatalf("summary = %+v, want total=20 passed=14 failed=4", summary)
	}
	if len(summary.DeviceResults) != 2 {
		t.Fatalf("deviceResults length = %d, want 2（详情应包含逐设备结果）, body=%s", len(summary.DeviceResults), rec.Body.String())
	}
	if summary.DeviceResults[0].DeviceName != "核心交换机A" || summary.DeviceResults[1].DeviceName != "核心交换机B" {
		t.Fatalf("deviceResults names = %q, %q, want 核心交换机A/B", summary.DeviceResults[0].DeviceName, summary.DeviceResults[1].DeviceName)
	}
	if summary.DeviceResults[1].Status != "error" {
		t.Fatalf("deviceResults[1].status = %q, want error（存在失败检查项）", summary.DeviceResults[1].Status)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestDeleteExecution_ShouldDeleteWholeBatch(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"inspections:delete"})
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := inspection.NewService(gormDB, zap.NewNop())
	h := handlers.InspectionHandler{
		Service: svc,
		Auth:    authSvc,
		Logger:  zap.NewNop(),
	}

	startTime := time.Date(2026, 6, 30, 9, 0, 0, 0, time.UTC)

	// 数字 ID 路径：先取代表记录（带 batch_id），再按 batch_id 展开批内全部记录一并删除
	mock.ExpectQuery(`SELECT \* FROM "inspections" WHERE id = \$1`).
		WithArgs(5, sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows(batchedInspectionColumns()).AddRow(
			5, 101, nil, 9, "核心巡检策略 手动触发", inspection.TriggerManual, inspection.StatusCompleted,
			nil, startTime, startTime.Add(time.Minute), 60, 10, 10, 0, 0, 0, nil, []byte(`{}`),
			nil, nil, nil, "tester", startTime, startTime, "batch-a",
		))
	mock.ExpectQuery(`SELECT \* FROM "inspections" WHERE batch_id = \$1 ORDER BY id ASC`).
		WithArgs("batch-a").
		WillReturnRows(sqlmock.NewRows(batchedInspectionColumns()).
			AddRow(5, 101, nil, 9, "核心巡检策略 手动触发", inspection.TriggerManual, inspection.StatusCompleted,
				nil, startTime, startTime.Add(time.Minute), 60, 10, 10, 0, 0, 0, nil, []byte(`{}`),
				nil, nil, nil, "tester", startTime, startTime, "batch-a").
			AddRow(6, 102, nil, 9, "核心巡检策略 手动触发", inspection.TriggerManual, inspection.StatusCompleted,
				nil, startTime, startTime.Add(time.Minute), 60, 10, 9, 1, 0, 0, nil, []byte(`{}`),
				nil, nil, nil, "tester", startTime, startTime, "batch-a"))

	// DeleteInspectionsByIDs：显式事务内先删结果、再删记录
	mock.ExpectBegin()
	mock.ExpectExec(`DELETE FROM "inspection_results" WHERE inspection_id IN \(\$1,\$2\)`).
		WithArgs(5, 6).
		WillReturnResult(sqlmock.NewResult(0, 2))
	mock.ExpectExec(`DELETE FROM "inspections" WHERE id IN \(\$1,\$2\)`).
		WithArgs(5, 6).
		WillReturnResult(sqlmock.NewResult(0, 2))
	mock.ExpectCommit()

	ctx, rec := newEchoContextWithBody(http.MethodDelete, "/api/v1/inspection/executions/5", token, nil)
	ctx.SetParamNames("id")
	ctx.SetParamValues("5")

	if err := h.DeleteExecution(ctx); err != nil {
		t.Fatalf("DeleteExecution: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("http status = %d, body=%s", rec.Code, rec.Body.String())
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestGetExecution_ShouldExpandLegacyBatchByNumericID(t *testing.T) {
	// 历史记录无 batch_id：数字 ID → 代表记录 → 按 策略+名称+精确创建时间 归并展开
	authSvc, token := newAuthServiceWithPermissions(t, []string{"inspections:read"})
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := inspection.NewService(gormDB, zap.NewNop())
	h := handlers.InspectionHandler{
		Service: svc,
		Auth:    authSvc,
		Logger:  zap.NewNop(),
	}

	createdAt := time.Date(2026, 5, 10, 8, 30, 0, 0, time.UTC)
	completedAt := createdAt.Add(2 * time.Minute)

	// 数字 ID 路径：先取代表记录（不含 batch_id 列 → 历史记录）
	mock.ExpectQuery(`SELECT \* FROM "inspections" WHERE id = \$1`).
		WithArgs(5, sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows(inspectionColumns).AddRow(
			5, 101, nil, 9, "核心巡检策略 手动触发", inspection.TriggerManual, inspection.StatusCompleted,
			nil, createdAt, completedAt, 120, 10, 9, 1, 0, 0, nil, []byte(`{}`),
			nil, nil, nil, "tester", createdAt, createdAt,
		))
	// 历史归并展开：同一次触发的行 created_at 精确相同（GORM 会对 OR 条件额外包一层括号）
	mock.ExpectQuery(`SELECT \* FROM "inspections" WHERE \(\(batch_id IS NULL OR batch_id = ''\)\) AND COALESCE\(schedule_id, 0\) = \$1 AND COALESCE\(name, ''\) = \$2 AND created_at IS NOT DISTINCT FROM \$3 ORDER BY id ASC`).
		WithArgs(9, "核心巡检策略 手动触发", createdAt).
		WillReturnRows(sqlmock.NewRows(inspectionColumns).
			AddRow(5, 101, nil, 9, "核心巡检策略 手动触发", inspection.TriggerManual, inspection.StatusCompleted,
				nil, createdAt, completedAt, 120, 10, 9, 1, 0, 0, nil, []byte(`{}`),
				nil, nil, nil, "tester", createdAt, createdAt).
			AddRow(6, 102, nil, 9, "核心巡检策略 手动触发", inspection.TriggerManual, inspection.StatusCompleted,
				nil, createdAt, completedAt, 120, 10, 10, 0, 0, 0, nil, []byte(`{}`),
				nil, nil, nil, "tester", createdAt, createdAt))
	// GetExecution 后续加载顺序：策略名 → 巡检结果 → 设备信息
	mock.ExpectQuery(`SELECT id, name FROM "inspection_strategies" WHERE id IN \(\$1\)`).
		WithArgs(9).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name"}).AddRow(9, "核心巡检策略"))
	mock.ExpectQuery(`SELECT \* FROM "inspection_results" WHERE inspection_id IN \(\$1,\$2\).*ORDER BY inspection_id, id`).
		WithArgs(5, 6).
		WillReturnRows(sqlmock.NewRows([]string{"id", "inspection_id", "check_item_name", "status"}).
			AddRow(21, 5, "CPU检查", "pass").
			AddRow(22, 6, "CPU检查", "pass"))
	mock.ExpectQuery(`SELECT id, name, device_type, ip_address FROM "devices" WHERE id IN \(\$1,\$2\)`).
		WithArgs(101, 102).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "device_type", "ip_address"}).
			AddRow(101, "核心交换机A", "switch", "10.0.0.1").
			AddRow(102, "核心交换机B", "switch", "10.0.0.2"))

	ctx, rec := newEchoContextWithBody(http.MethodGet, "/api/v1/inspection/executions/5", token, nil)
	ctx.SetParamNames("id")
	ctx.SetParamValues("5")

	if err := h.GetExecution(ctx); err != nil {
		t.Fatalf("GetExecution: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("http status = %d, body=%s", rec.Code, rec.Body.String())
	}

	var payload struct {
		Data struct {
			ID      string `json:"id"`
			Status  string `json:"status"`
			Summary struct {
				DeviceResults []struct {
					DeviceID string `json:"deviceId"`
				} `json:"deviceResults"`
			} `json:"summary"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("json.Unmarshal: %v, body=%s", err, rec.Body.String())
	}

	// 历史批次对外 id 为批内最小数字 ID
	if payload.Data.ID != "5" {
		t.Fatalf("id = %q, want 5", payload.Data.ID)
	}
	if len(payload.Data.Summary.DeviceResults) != 2 {
		t.Fatalf("deviceResults length = %d, want 2（历史归并应展开同批全部设备）, body=%s",
			len(payload.Data.Summary.DeviceResults), rec.Body.String())
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestStopExecution_ShouldCancelWholeBatch(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"inspections:execute"})
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := inspection.NewService(gormDB, zap.NewNop())
	h := handlers.InspectionHandler{
		Service: svc,
		Auth:    authSvc,
		Logger:  zap.NewNop(),
		WS:      nil, // 不校验广播
	}

	startTime := time.Date(2026, 6, 30, 9, 0, 0, 0, time.UTC)

	// 批次 UUID 路径：按 batch_id 取批内全部记录
	mock.ExpectQuery(`SELECT \* FROM "inspections" WHERE batch_id = \$1 ORDER BY id ASC`).
		WithArgs("batch-run").
		WillReturnRows(sqlmock.NewRows(batchedInspectionColumns()).
			AddRow(1, 101, nil, 9, "核心巡检策略 手动触发", inspection.TriggerManual, inspection.StatusRunning,
				nil, startTime, nil, nil, 10, 3, 0, 0, 0, nil, []byte(`{}`),
				nil, nil, nil, "tester", startTime, startTime, "batch-run").
			AddRow(2, 102, nil, 9, "核心巡检策略 手动触发", inspection.TriggerManual, inspection.StatusCompleted,
				nil, startTime, startTime.Add(time.Minute), 60, 10, 10, 0, 0, 0, nil, []byte(`{}`),
				nil, nil, nil, "tester", startTime, startTime, "batch-run"))

	// 批量原子取消：单条 UPDATE，WHERE 带状态过滤——批内已完成的记录（设备102）
	// 不会被误覆盖成"已取消"，仅运行中的记录（设备101）受影响。
	// SET 列按字母序：completed_at、duration(表达式内联)、error_message、status、updated_at。
	mock.ExpectExec(`UPDATE "inspections" SET .* WHERE id IN \(\$5,\$6\) AND status IN \(\$7,\$8\)`).
		WithArgs(sqlmock.AnyArg(), sqlmock.AnyArg(), inspection.StatusCancelled, sqlmock.AnyArg(), 1, 2, inspection.StatusRunning, inspection.StatusPending).
		WillReturnResult(sqlmock.NewResult(0, 1))

	ctx, rec := newEchoContextWithBody(http.MethodPost, "/api/v1/inspection/executions/batch-run/stop", token, nil)
	ctx.SetParamNames("id")
	ctx.SetParamValues("batch-run")

	if err := h.StopExecution(ctx); err != nil {
		t.Fatalf("StopExecution: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("http status = %d, body=%s", rec.Code, rec.Body.String())
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}
