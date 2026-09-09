package handlers_test

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"
	_ "unsafe"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/inspection"
	"go.uber.org/zap"
)

// aggregateExecutionStatuses 是批次状态聚合的未导出函数，经 go:linkname 桥接做白盒测试
// （沿用本仓库约定）。
//
//go:linkname aggregateExecutionStatuses github.com/your-org/inspect-system/backend-go/internal/http/handlers.aggregateExecutionStatuses
func aggregateExecutionStatuses(rows []inspection.Inspection) string

// buildBatchExecutionResponse 是批次列表响应构建的未导出函数，经 go:linkname 桥接做白盒测试。
//
//go:linkname buildBatchExecutionResponse github.com/your-org/inspect-system/backend-go/internal/http/handlers.buildBatchExecutionResponse
func buildBatchExecutionResponse(rows []inspection.Inspection, strategyNames map[int]string, userNames map[string]string) map[string]interface{}

func batchRow(id int, deviceID int, status string, completedAt *time.Time) inspection.Inspection {
	return inspection.Inspection{
		ID:          id,
		DeviceID:    deviceID,
		Status:      status,
		CompletedAt: completedAt,
		Duration:    nil,
	}
}

// 评审 M3 口径：pending 不得优先于 completed——「部分完成 + 部分排队」的批次
// 实际仍在推进，显示等待中会让前端认为不可停止（无停止按钮）。

func TestAggregateExecutionStatuses_PendingWithCompletedIsRunning(t *testing.T) {
	rows := []inspection.Inspection{
		batchRow(1, 101, inspection.StatusCompleted, nil),
		batchRow(2, 102, inspection.StatusPending, nil),
	}
	if got := aggregateExecutionStatuses(rows); got != inspection.StatusRunning {
		t.Fatalf("status = %q, want %q：部分完成+部分排队应显示执行中", got, inspection.StatusRunning)
	}
}

func TestAggregateExecutionStatuses_AllPendingKeepsPending(t *testing.T) {
	rows := []inspection.Inspection{
		batchRow(1, 101, inspection.StatusPending, nil),
		batchRow(2, 102, inspection.StatusPending, nil),
	}
	if got := aggregateExecutionStatuses(rows); got != inspection.StatusPending {
		t.Fatalf("status = %q, want %q：全部排队才是等待中", got, inspection.StatusPending)
	}
}

// 评审 M2 口径：批次未全部终态时 endTime 必须为空——「最早完成的设备的完成时间」
// 会被误读成批次结束时间，duration 也随之随完成台数增长。

func TestBuildBatchExecutionResponse_EndTimeNilUntilAllTerminal(t *testing.T) {
	startTime := time.Date(2026, 6, 30, 9, 0, 0, 0, time.UTC)
	completedAt := startTime.Add(2 * time.Minute)
	rows := []inspection.Inspection{
		batchRow(1, 101, inspection.StatusCompleted, &completedAt),
		batchRow(2, 102, inspection.StatusRunning, nil),
	}

	resp := buildBatchExecutionResponse(rows, map[int]string{9: "核心巡检策略"}, map[string]string{})
	// 注意 typed nil：endTime 为 nil 时接口里装的是 (*time.Time)(nil)，必须解类型后判空
	if endTime, ok := resp["endTime"].(*time.Time); ok && endTime != nil {
		t.Fatalf("endTime = %v, want nil：批次未全部终态不得给出结束时间", endTime)
	}
}

func TestBuildBatchExecutionResponse_EndTimeIsLatestWhenAllTerminal(t *testing.T) {
	startTime := time.Date(2026, 6, 30, 9, 0, 0, 0, time.UTC)
	early := startTime.Add(time.Minute)
	late := startTime.Add(5 * time.Minute)
	rows := []inspection.Inspection{
		batchRow(1, 101, inspection.StatusCompleted, &late),
		batchRow(2, 102, inspection.StatusCompleted, &early),
	}

	resp := buildBatchExecutionResponse(rows, map[int]string{9: "核心巡检策略"}, map[string]string{})
	endTime, ok := resp["endTime"].(*time.Time)
	if !ok || endTime == nil {
		t.Fatalf("endTime = %v, want 批内最晚完成时间", resp["endTime"])
	}
	if !endTime.Equal(late) {
		t.Fatalf("endTime = %v, want %v（两台皆终态取最大值）", endTime, late)
	}
}

// 评审 L1：deviceResults.deviceId 改用 inspections.device_id（item.DeviceID），
// 不再取 devices 表映射——设备删除后 deviceMap 查不到该设备，原实现会输出 "0"。
// deviceInfo 为未导出类型，按仓库约定走 GetExecution 详情合同测试而非 linkname。

func TestGetExecution_DeviceIdComesFromInspectionRow(t *testing.T) {
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

	mock.ExpectQuery(`SELECT \* FROM "inspections" WHERE batch_id = \$1 ORDER BY id ASC`).
		WithArgs("batch-x").
		WillReturnRows(sqlmock.NewRows(batchedInspectionColumns()).
			AddRow(1, 77, nil, nil, "批量巡检", inspection.TriggerManual, inspection.StatusCompleted,
				nil, startTime, completedAt, 120, 10, 10, 0, 0, 0, nil, []byte(`{}`),
				nil, nil, nil, "tester", startTime, startTime, "batch-x"))
	// schedule_id 为 nil（手动批量执行），不会查询策略表
	mock.ExpectQuery(`SELECT \* FROM "inspection_results" WHERE inspection_id IN \(\$1\).*ORDER BY inspection_id, id`).
		WithArgs(1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "inspection_id", "check_item_name", "check_item_type", "status"}).
			AddRow(11, 1, "CPU检查", "cpu", "pass"))
	// 设备 77 已被删除：设备表查询为空
	mock.ExpectQuery(`SELECT id, name, device_type, ip_address FROM "devices" WHERE id IN \(\$1\)`).
		WithArgs(77).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "device_type", "ip_address"}))

	ctx, rec := newEchoContextWithBody(http.MethodGet, "/api/v1/inspection/executions/batch-x", token, nil)
	ctx.SetParamNames("id")
	ctx.SetParamValues("batch-x")

	if err := h.GetExecution(ctx); err != nil {
		t.Fatalf("GetExecution: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("http status = %d, body=%s", rec.Code, rec.Body.String())
	}

	var payload struct {
		Data struct {
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
	if len(payload.Data.Summary.DeviceResults) != 1 {
		t.Fatalf("deviceResults length = %d, want 1, body=%s", len(payload.Data.Summary.DeviceResults), rec.Body.String())
	}
	if got := payload.Data.Summary.DeviceResults[0].DeviceID; got != "77" {
		t.Fatalf("deviceId = %q, want \"77\"（设备删除后不得退化为 0）", got)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}
